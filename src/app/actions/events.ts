"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activists, counties, eventParticipants, events } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/workflow-utils";
import { EVENT_KINDS, PARTICIPANT_STATUSES, REMINDER_HOUR_OPTIONS, eventKindLabels, eventScope, sendEventReminders, type EventKind, type ParticipantStatus } from "@/lib/events";

import type { ActionState } from "@/lib/action-state";

type EventActionState = ActionState;

const guard = async () => {
  const actor = await requireUser();
  if (!(await can(actor, "events.manage"))) redirect("/dashboard");
  return actor;
};

const eventKind = (value: string): EventKind => ((EVENT_KINDS as readonly string[]).includes(value) ? value as EventKind : "meeting");
const participantStatus = (value: string): ParticipantStatus => ((PARTICIPANT_STATUSES as readonly string[]).includes(value) ? value as ParticipantStatus : "invited");

function parseStart(raw: string): Date | null {
  // datetime-local: 2026-11-20T18:30 interpreted as Tehran time (UTC+03:30).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  return new Date(`${raw}:00+03:30`);
}

export async function createEventAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const title = String(data.get("title") || "").trim();
  const description = String(data.get("description") || "").trim();
  const kind = eventKind(String(data.get("kind") || ""));
  const location = String(data.get("location") || "").trim();
  const capacity = Number(data.get("capacity") || 0);
  const reminderHours = Number(data.get("reminderHours") || 48);
  const startsAt = parseStart(String(data.get("startsAt") || ""));
  const endsRaw = String(data.get("endsAt") || "");
  const endsAt = endsRaw ? parseStart(endsRaw) : null;
  const provinceRaw = String(data.get("provinceId") || "");
  const countyRaw = String(data.get("countyId") || "");
  const role = actor.effectiveRole ?? actor.role;

  if (title.length < 3 || title.length > 160) return { error: "عنوان رویداد باید بین ۳ تا ۱۶۰ نویسه باشد." };
  if (!startsAt) return { error: "تاریخ و ساعت شروع را به‌درستی وارد کنید." };
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) return { error: "پایان رویداد باید پس از شروع باشد." };
  if (!(REMINDER_HOUR_OPTIONS as readonly number[]).includes(reminderHours)) return { error: "آستانه یادآور نامعتبر است." };
  if (capacity && (capacity < 2 || capacity > 10000)) return { error: "ظرفیت باید بین ۲ تا ۱۰۰۰۰ نفر باشد." };

  // Geography must stay inside the actor's own scope; null province (country-wide) is super-admin-only.
  let provinceId: number | null = null;
  let countyId: number | null = null;
  if (role === "super_admin") {
    provinceId = /^\d+$/.test(provinceRaw) ? Number(provinceRaw) : null;
    countyId = /^\d+$/.test(countyRaw) ? Number(countyRaw) : null;
    if (countyId && !provinceId) return { error: "برای انتخاب شهرستان، ابتدا استان را انتخاب کنید." };
    if (provinceId || countyId) {
      const [geo] = await db.select({ id: counties.id, provinceId: counties.provinceId }).from(counties).where(eq(counties.id, countyId ?? -1)).limit(1);
      if (countyId && (!geo || geo.provinceId !== provinceId)) return { error: "شهرستان انتخاب‌شده به استان انتخاب‌شده تعلق ندارد." };
    }
  } else if (role === "county_admin") {
    if (!actor.provinceId || !actor.countyId) return { error: "محدوده جغرافیایی حساب شما کامل نیست." };
    provinceId = actor.provinceId; countyId = actor.countyId;
  } else {
    if (!actor.provinceId) return { error: "محدوده جغرافیایی حساب شما کامل نیست." };
    provinceId = actor.provinceId; countyId = null;
  }

  const [row] = await db.insert(events).values({
    title, description: description || null, kind, startsAt,
    endsAt: endsAt ?? null, location: location || null,
    provinceId, countyId, capacity: capacity || null,
    reminderHours, createdBy: actor.id,
  }).returning();
  await audit(actor.id, "create_event", "event", row.id, `kind=${kind};start=${startsAt.toISOString()};province=${provinceId ?? "national"};county=${countyId ?? "-"}`);
  revalidatePath("/events");
  redirect(`/events?created=${encodeURIComponent(row.id)}`);
}

export async function updateEventAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const id = String(data.get("eventId") || "");
  const title = String(data.get("title") || "").trim();
  const description = String(data.get("description") || "").trim();
  const location = String(data.get("location") || "").trim();
  const capacity = Number(data.get("capacity") || 0);
  const reminderHours = Number(data.get("reminderHours") || 48);
  const startsAt = parseStart(String(data.get("startsAt") || ""));
  if (!isUuid(id)) return { error: "شناسه رویداد نامعتبر است." };
  if (title.length < 3 || title.length > 160) return { error: "عنوان رویداد باید بین ۳ تا ۱۶۰ نویسه باشد." };
  if (!startsAt) return { error: "تاریخ و ساعت شروع را به‌درستی وارد کنید." };
  if (!(REMINDER_HOUR_OPTIONS as readonly number[]).includes(reminderHours)) return { error: "آستانه یادآور نامعتبر است." };
  const scope = eventScope(actor);
  const [row] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, id), scope)).limit(1);
  if (!row) return { error: "رویداد در محدوده شما یافت نشد." };
  await db.update(events).set({
    title, description: description || null, location: location || null,
    startsAt, capacity: capacity || null, reminderHours, updatedAt: new Date(),
  }).where(eq(events.id, id));
  await audit(actor.id, "update_event", "event", id, `start=${startsAt.toISOString()};reminderHours=${reminderHours}`);
  revalidatePath("/events");
  return {};
}

export async function addParticipantsAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const eventId = String(data.get("eventId") || "");
  const activistIds = data.getAll("activistIds").map((value) => String(value)).filter(isUuid);
  if (!isUuid(eventId)) return { error: "شناسه رویداد نامعتبر است." };
  if (!activistIds.length) return { error: "حداقل یک فعال را برای دعوت انتخاب کنید." };
  const scope = eventScope(actor);
  const [event] = await db.select({ id: events.id, capacity: events.capacity }).from(events).where(and(eq(events.id, eventId), scope)).limit(1);
  if (!event) return { error: "رویداد در محدوده شما یافت نشد." };
  // Only activists inside the actor's case scope may be invited.
  const invited = await db.select({ id: activists.id }).from(activists).where(and(inArray(activists.id, activistIds), scopeCondition(actor)));
  if (!invited.length) return { error: "فعالان انتخاب‌شده در محدوده دسترسی شما نیستند." };
  const existing = await db.select({ activistId: eventParticipants.activistId }).from(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  const taken = new Set(existing.map((row) => row.activistId));
  const fresh = invited.map((row) => row.id).filter((id) => !taken.has(id));
  if (!fresh.length) return { error: "همه فعالان انتخاب‌شده قبلاً دعوت شده‌اند." };
  if (event.capacity) {
    if (existing.length + fresh.length > event.capacity) return { error: `ظرفیت رویداد ${event.capacity} نفر است؛ ${event.capacity - existing.length} جای خالی باقی مانده.` };
  }
  await db.insert(eventParticipants).values(fresh.map((activistId) => ({ eventId, activistId, status: "invited" as const }))).onConflictDoNothing();
  await audit(actor.id, "add_event_participant", "event", eventId, `count=${fresh.length}`);
  revalidatePath("/events");
  return {};
}

export async function setParticipantStatusAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const participantId = String(data.get("participantId") || "");
  const status = participantStatus(String(data.get("status") || ""));
  if (!isUuid(participantId)) return { error: "شناسه دعوت‌نامه نامعتبر است." };
  const [row] = await db.select({ id: eventParticipants.id, eventId: eventParticipants.eventId })
    .from(eventParticipants).innerJoin(events, eq(eventParticipants.eventId, events.id))
    .where(and(eq(eventParticipants.id, participantId), eventScope(actor))).limit(1);
  if (!row) return { error: "دعوت‌نامه در محدوده شما یافت نشد." };
  await db.update(eventParticipants).set({ status }).where(eq(eventParticipants.id, participantId));
  await audit(actor.id, "set_event_participant_status", "event", row.eventId, `participant=${participantId};status=${status}`);
  revalidatePath("/events");
  return {};
}

export async function removeParticipantAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const participantId = String(data.get("participantId") || "");
  if (!isUuid(participantId)) return { error: "شناسه دعوت‌نامه نامعتبر است." };
  const [row] = await db.select({ id: eventParticipants.id, eventId: eventParticipants.eventId })
    .from(eventParticipants).innerJoin(events, eq(eventParticipants.eventId, events.id))
    .where(and(eq(eventParticipants.id, participantId), eventScope(actor))).limit(1);
  if (!row) return { error: "دعوت‌نامه در محدوده شما یافت نشد." };
  await db.delete(eventParticipants).where(eq(eventParticipants.id, participantId));
  await audit(actor.id, "remove_event_participant", "event", row.eventId, `participant=${participantId}`);
  revalidatePath("/events");
  return {};
}

export async function sendEventRemindersAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const eventId = String(data.get("eventId") || "");
  const summary = eventId && isUuid(eventId)
    ? await sendEventReminders(actor, { eventIds: [eventId] })
    : await sendEventReminders(actor);
  await audit(actor.id, "send_event_reminders_manual", "event", eventId && isUuid(eventId) ? eventId : undefined, `sent=${summary.sent};withSms=${summary.withSms};local=${summary.localSms}`);
  revalidatePath("/events");
  redirect(`/events?reminded=${summary.sent}&sms=${summary.withSms}&local=${summary.localSms}&noPhone=${summary.withoutPhone}`);
}

export async function deleteEventAction(_state: EventActionState, data: FormData): Promise<ActionState> {
  const actor = await guard();
  const eventId = String(data.get("eventId") || "");
  if (!isUuid(eventId)) return { error: "شناسه رویداد نامعتبر است." };
  const scope = eventScope(actor);
  const [row] = await db.select({ id: events.id, title: events.title }).from(events).where(and(eq(events.id, eventId), scope)).limit(1);
  if (!row) return { error: "رویداد در محدوده شما یافت نشد." };
  await db.delete(events).where(eq(events.id, eventId));
  await audit(actor.id, "delete_event", "event", eventId, `title=${row.title}`);
  revalidatePath("/events");
  return {};
}
