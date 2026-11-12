// Events calendar + pre-event SMS reminders (تقویم رویدادها و یادآور پیش از
// رویداد — Release 2.4، فاز ۲).
//
// Managers with events.manage create country/province/county events and invite
// activists (limited to their own geographic scope). Every event carries its
// own reminder_hours window: the sweep (manual from the page or automated via
// /api/cron/events) reminds every not-yet-reminded, non-cancelled participant
// `reminder_hours` before start — SMS through message_outbox (Kavenegar when
// configured, otherwise captured locally) plus an in-app notification when the
// activist has an account. reminded_at makes the sweep idempotent.
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activists, auditLogs, counties, eventParticipants, events, notifications, provinces, users } from "@/db/schema";
import type { MaybeSessionUser, SessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/workflow-utils";
import { faDate } from "@/lib/format";
import { queueSms, smsConfigured } from "@/lib/messaging";
// (faNumber unused here — the page layer formats numbers)

export const EVENT_KINDS = ["meeting", "workshop", "competition", "ceremony", "course"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const eventKindLabels: Record<EventKind, string> = {
  meeting: "جلسه هم‌اندیشی",
  workshop: "کارگاه آموزشی",
  competition: "مسابقه قرآنی",
  ceremony: "مراسم و افتخارآفرینی",
  course: "دوره آموزشی",
};

export const PARTICIPANT_STATUSES = ["invited", "confirmed", "attended", "cancelled"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const participantStatusLabels: Record<ParticipantStatus, string> = {
  invited: "دعوت‌شده",
  confirmed: "تأیید حضور",
  attended: "حاضر",
  cancelled: "منصرف",
};

export const REMINDER_HOUR_OPTIONS = [24, 48, 72, 168] as const;
export const DEFAULT_REMINDER_HOURS = 48;
export const MAX_EVENT_REMINDER_BATCH = 300;
const HOUR_MS = 3600000;

// ---------- pure helpers (unit-testable) ----------

/** Reminder window of an event: [startsAt - reminderHours, startsAt). */
export function reminderWindow(startsAt: Date, reminderHours: number) {
  return { opensAt: new Date(startsAt.getTime() - reminderHours * HOUR_MS), startsAt };
}

/** A sweep at `now` must remind when the window is open and the event is still ahead. */
export function isReminderDue(startsAt: Date, reminderHours: number, now = new Date()): boolean {
  const { opensAt } = reminderWindow(startsAt, reminderHours);
  return opensAt.getTime() <= now.getTime() && startsAt.getTime() > now.getTime();
}

/** Accepts only the defined options; anything else falls back to the default. */
export function parseReminderHours(raw: string | null | undefined): number {
  const value = Number(raw || "");
  return (REMINDER_HOUR_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_REMINDER_HOURS;
}

/** Jalali schedule line shared by the SMS body and the UI. */
export function eventScheduleText(startsAt: Date): string {
  return faDate(startsAt, true);
}
export function eventSmsText(title: string, startsAt: Date, location: string | null): string {
  const where = location ? ` در محل «${location}»` : "";
  return `سامانه نور: رویداد «${title}» در تاریخ ${eventScheduleText(startsAt)} برگزار می‌شود${where}. لطفاً حضور خود را در سامانه تأیید کنید.`;
}

export function eventNotificationBody(title: string, startsAt: Date, location: string | null): string {
  const where = location ? ` — محل: ${location}` : "";
  return `رویداد «${title}» در تاریخ ${eventScheduleText(startsAt)} برگزار می‌شود${where}. برای مشاهده جزئیات و تأیید حضور به صفحه رویدادها مراجعه کنید.`;
}

// ---------- scoping ----------

/** Country-wide events (province_id null) are visible to every manager. */
export function eventScope(user: MaybeSessionUser): SQL {
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return sql`true`;
  if (!user.provinceId) return sql`false`;
  if (role === "county_admin") {
    const ownCounty = user.countyId ? eq(events.countyId, user.countyId) : sql`false`;
    return or(isNull(events.provinceId), and(eq(events.provinceId, user.provinceId), isNull(events.countyId)), ownCounty)!;
  }
  return or(isNull(events.provinceId), eq(events.provinceId, user.provinceId))!;
}

/** Where an actor is allowed to place a new event (null province = country-wide, super admin only). */
export function eventPlaceScope(user: MaybeSessionUser): { provinceId: number | null; countyId: number | null } {
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return { provinceId: null, countyId: null };
  if (role === "county_admin") return { provinceId: user.provinceId, countyId: user.countyId };
  return { provinceId: user.provinceId, countyId: null };
}

// ---------- data layer ----------

const participantCountExpr = sql<number>`(select count(*) from ${eventParticipants} where ${eventParticipants.eventId} = ${events.id} and ${eventParticipants.status} <> 'cancelled')`;

export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

export async function listEvents(user: MaybeSessionUser, options: { from?: Date; to?: Date; limit?: number } = {}) {
  const conditions: SQL[] = [eventScope(user)];
  if (options.from) conditions.push(sql`${events.startsAt} >= ${options.from}`);
  if (options.to) conditions.push(sql`${events.startsAt} < ${options.to}`);
  return db.select({
    id: events.id, title: events.title, description: events.description, kind: events.kind,
    startsAt: events.startsAt, endsAt: events.endsAt, location: events.location,
    capacity: events.capacity, reminderHours: events.reminderHours, createdBy: events.createdBy,
    provinceId: events.provinceId, countyId: events.countyId,
    province: provinces.name, county: counties.name, creatorName: users.fullName,
    participantCount: participantCountExpr,
  }).from(events)
    .leftJoin(provinces, eq(events.provinceId, provinces.id))
    .leftJoin(counties, eq(events.countyId, counties.id))
    .leftJoin(users, eq(events.createdBy, users.id))
    .where(and(...conditions))
    .orderBy(asc(events.startsAt))
    .limit(options.limit ?? 200);
}

export async function getEventForUser(user: MaybeSessionUser, id: string) {
  if (!isUuid(id)) return null;
  const rows = await listEvents(user, { limit: 200 });
  return rows.find((row) => row.id === id) ?? null;
}

export type EventParticipantRow = Awaited<ReturnType<typeof listParticipants>>[number];

export async function listParticipants(user: MaybeSessionUser, eventId: string) {
  const event = await getEventForUser(user, eventId);
  if (!event) return [];
  return db.select({
    id: eventParticipants.id, status: eventParticipants.status, remindedAt: eventParticipants.remindedAt,
    createdAt: eventParticipants.createdAt,
    activistId: activists.id, firstName: activists.firstName, lastName: activists.lastName,
    phone: activists.phone, activistUserId: activists.userId, userActive: users.active,
    caseId: sql<string | null>`(select a.id from applications a where a.activist_id = ${activists.id} limit 1)`,
  }).from(eventParticipants)
    .innerJoin(activists, eq(eventParticipants.activistId, activists.id))
    .leftJoin(users, eq(activists.userId, users.id))
    .where(eq(eventParticipants.eventId, eventId))
    .orderBy(asc(eventParticipants.createdAt));
}

/** Scoped activist options for the invite form (name + phone presence). */
export async function listInvitableActivists(user: MaybeSessionUser, eventId: string) {
  const event = await getEventForUser(user, eventId);
  if (!event) return [];
  const { scopeCondition } = await import("@/lib/data");
  const rows = await db.select({
    id: activists.id, firstName: activists.firstName, lastName: activists.lastName, phone: activists.phone,
  }).from(activists).where(scopeCondition(user)).orderBy(asc(activists.lastName)).limit(500);
  const existing = await db.select({ activistId: eventParticipants.activistId }).from(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  const taken = new Set(existing.map((row) => row.activistId));
  return rows.filter((row) => !taken.has(row.id));
}

// ---------- reminder sweep ----------

export type EventReminderSummary = {
  considered: number; sent: number; withSms: number; localSms: number; withoutPhone: number; skippedCancelled: number;
};

/**
 * Sends due event reminders. `actor === null` = automated cron sweep (system
 * actor, full scope — the route layer guards the secret). Scoping for human
 * actors always flows through eventScope.
 */
export async function sendEventReminders(actor: MaybeSessionUser | null, options: { eventIds?: string[]; now?: Date } = {}): Promise<EventReminderSummary> {
  const now = options.now ?? new Date();
  const scope: SQL = actor ? eventScope(actor) : sql`true`;
  const conditions: SQL[] = [
    scope,
    // window open and the event still ahead, using each event's own reminder_hours
    sql`${events.startsAt} > ${now.toISOString()}::timestamptz`,
    sql`${events.startsAt} - (${events.reminderHours} * interval '1 hour') <= ${now.toISOString()}::timestamptz`,
  ];
  const selected = options.eventIds?.filter(isUuid);
  if (selected?.length) conditions.push(inArray(events.id, selected));
  const dueEvents = await db.select({ id: events.id, title: events.title, startsAt: events.startsAt, location: events.location })
    .from(events).where(and(...conditions)).orderBy(asc(events.startsAt)).limit(MAX_EVENT_REMINDER_BATCH);

  const summary: EventReminderSummary = { considered: 0, sent: 0, withSms: 0, localSms: 0, withoutPhone: 0, skippedCancelled: 0 };
  const smsEnabled = smsConfigured();

  for (const event of dueEvents) {
    const pending = await db.select({
      participantId: eventParticipants.id, status: eventParticipants.status,
      phone: activists.phone, userId: activists.userId, firstName: activists.firstName, lastName: activists.lastName,
    }).from(eventParticipants)
      .innerJoin(activists, eq(eventParticipants.activistId, activists.id))
      .where(and(eq(eventParticipants.eventId, event.id), isNull(eventParticipants.remindedAt)));
    summary.considered += pending.length;

    for (const participant of pending) {
      if (participant.status === "cancelled") { summary.skippedCancelled++; continue; }
      const fullName = `${participant.firstName} ${participant.lastName}`.trim();
      const message = eventSmsText(event.title, event.startsAt, event.location);
      await db.transaction(async (tx) => {
        await tx.update(eventParticipants).set({ remindedAt: now }).where(eq(eventParticipants.id, participant.participantId));
        if (participant.userId) {
          const title = "یادآور رویداد";
          const body = eventNotificationBody(event.title, event.startsAt, event.location);
          await tx.insert(notifications).values({ userId: participant.userId, title, body, applicationId: null });
        }
        if (participant.phone) {
          await queueSms(tx, participant.phone, message, { userId: participant.userId ?? null });
        }
        await tx.insert(auditLogs).values({
          actorId: actor?.id ?? null, action: "send_event_reminder", targetType: "event", targetId: event.id,
          detail: `participant=${fullName};phone=${participant.phone ? "yes" : "no"};sms=${participant.phone ? (smsEnabled ? "queued" : "local") : "skipped"};automated=${!actor}`,
        });
      });
      summary.sent++;
      if (participant.phone) { if (smsEnabled) summary.withSms++; else summary.localSms++; }
      else summary.withoutPhone++;
    }
  }
  return summary;
}

/** Cron entry point: sweep + best-effort delivery of the queued messages. */
export async function runAutomatedEventReminders() {
  const summary = await sendEventReminders(null);
  const { deliverOutbox } = await import("@/lib/messaging");
  await deliverOutbox();
  return summary;
}

/** Recent event-related audit rows for the page footer. */
export async function listRecentEventActivity(limit = 8) {
  return db.select({
    id: auditLogs.id, action: auditLogs.action, detail: auditLogs.detail, createdAt: auditLogs.createdAt,
    actorName: users.fullName,
  }).from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(sql`${auditLogs.targetType} = 'event'`)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
