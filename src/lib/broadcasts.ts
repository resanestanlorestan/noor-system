// Group broadcast messaging (اطلاع‌رسانی گروهی — Release 2.2).
//
// Managers (super/province/county admin, capability `messages.broadcast`)
// can send one announcement to a *filtered audience* of quranic activists
// inside their own geographic scope:
//   - SMS through message_outbox (پیامک‌پنل / Kavenegar when configured,
//     captured locally otherwise) for every activist with a phone number,
//   - an in-app notification for every activist who has a linked, active
//     user account,
//   - one audit-log entry per broadcast.
// Every send is recorded in message_broadcasts with the audience filters and
// delivery counts, which is what the history table renders.
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activists, applications, auditLogs, counties, messageBroadcasts, notifications, provinces, specialties, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { faNumber } from "@/lib/format";
import { queueSms, smsProvider } from "@/lib/messaging";
import { statusLabels, type AppStatus } from "@/lib/constants";
import { isUuid } from "@/lib/workflow-utils";

export const MAX_BROADCAST_RECIPIENTS = 500;
export const BROADCAST_SMS_PREFIX = "سامانه نور:";
export const MAX_SUBJECT_LENGTH = 160;
export const MAX_BODY_LENGTH = 1000;
export const BROADCAST_SAMPLE_SIZE = 8;

// ---------- pure helpers (unit-testable) ----------

export type BroadcastFilters = {
  provinceId?: number; countyId?: number; specialtyId?: number;
  status?: AppStatus; onlyWithPhone: boolean;
};

export type BroadcastInput = {
  provinceId?: string; countyId?: string; specialtyId?: string;
  status?: string; onlyWithPhone?: string; subject?: string; body?: string;
};

/** Validates and normalises the raw form/URL input. */
export function parseBroadcastFilters(input: BroadcastInput): { filters: BroadcastFilters; error?: string } {
  const filters: BroadcastFilters = { onlyWithPhone: input.onlyWithPhone === "1" };
  for (const key of ["provinceId", "countyId", "specialtyId"] as const) {
    const raw = input[key]?.trim(); if (!raw) continue;
    if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) return { filters, error: "شناسه فیلتر جغرافیایی یا تخصص معتبر نیست." };
    filters[key] = Number(raw);
  }
  if (input.status?.trim()) {
    if (!Object.hasOwn(statusLabels, input.status.trim())) return { filters, error: "وضعیت پرونده معتبر نیست." };
    filters.status = input.status.trim() as AppStatus;
  }
  if (filters.countyId && !filters.provinceId) return { filters, error: "برای فیلتر شهرستان، ابتدا استان را انتخاب کنید." };
  return { filters };
}

/** Validates the message fields (subject/body) for the send action. */
export function parseBroadcastMessage(input: BroadcastInput): { subject: string; body: string; error?: string } {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject) return { subject, body, error: "عنوان پیام را وارد کنید." };
  if (subject.length > MAX_SUBJECT_LENGTH) return { subject, body, error: `عنوان پیام حداکثر ${faNumber(MAX_SUBJECT_LENGTH)} نویسه است.` };
  if (!body) return { subject, body, error: "متن پیام را وارد کنید." };
  if (body.length > MAX_BODY_LENGTH) return { subject, body, error: `متن پیام حداکثر ${faNumber(MAX_BODY_LENGTH)} نویسه است.` };
  return { subject, body };
}

/** Persists filter IDs into hidden fields / query strings, dropping empties. */
export function filterParams(filters: BroadcastFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of ["provinceId", "countyId", "specialtyId"] as const) if (filters[key]) params[key] = String(filters[key]);
  if (filters.status) params.status = filters.status;
  if (filters.onlyWithPhone) params.onlyWithPhone = "1";
  return params;
}

/** Human-readable Persian description of the audience. */
export function audienceLabel(filters: BroadcastFilters, names: { province?: string | null; county?: string | null; specialty?: string | null }): string {
  const parts: string[] = [];
  if (filters.provinceId) parts.push(`استان ${names.province || "انتخاب‌شده"}`);
  if (filters.countyId) parts.push(`شهرستان ${names.county || "انتخاب‌شده"}`);
  if (filters.specialtyId) parts.push(`تخصص ${names.specialty || "انتخاب‌شده"}`);
  if (filters.status) parts.push(`وضعیت «${statusLabels[filters.status]}»`);
  if (filters.onlyWithPhone) parts.push("فقط دارای شماره همراه");
  return parts.length ? parts.join(" · ") : "همه فعالان محدوده دسترسی";
}

/** The SMS text actually queued per recipient. */
export function broadcastSmsText(subject: string, body: string): string {
  const full = `${BROADCAST_SMS_PREFIX} ${subject}\n${body}`;
  return full.length <= 480 ? full : `${full.slice(0, 477)}…`;
}

/** Guards the batch size before anything is written. */
export function recipientsWithinCap(total: number, cap = MAX_BROADCAST_RECIPIENTS): boolean {
  return total >= 0 && total <= cap;
}

// ---------- data layer ----------

/** Geographic + attribute filters; callers must pass a manager session. */
function audienceConditions(user: SessionUser, filters: BroadcastFilters): SQL[] {
  const clauses: SQL[] = [];
  // Managers are always geo-scoped by their own account first.
  if (user.effectiveRole !== "super_admin") {
    if (!user.provinceId || (user.effectiveRole === "county_admin" && !user.countyId)) return [sql`false`];
    clauses.push(eq(activists.provinceId, user.provinceId));
    if (user.countyId) clauses.push(eq(activists.countyId, user.countyId));
  }
  if (filters.provinceId) clauses.push(eq(activists.provinceId, filters.provinceId));
  if (filters.countyId) clauses.push(eq(activists.countyId, filters.countyId));
  if (filters.specialtyId) clauses.push(sql`exists (select 1 from ${activistSpecialties} where ${activistSpecialties.activistId} = ${activists.id} and ${activistSpecialties.specialtyId} = ${filters.specialtyId})`);
  if (filters.status) clauses.push(sql`exists (select 1 from ${applications} where ${applications.activistId} = ${activists.id} and ${applications.status} = ${filters.status})`);
  if (filters.onlyWithPhone) clauses.push(sql`${activists.phone} is not null and ${activists.phone} <> ''`);
  return clauses;
}

function baseAudienceSelect() {
  return db.select({
    id: activists.id,
    name: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    phone: activists.phone,
    userId: activists.userId,
    userActive: users.active,
    province: provinces.name,
    county: counties.name,
  }).from(activists)
    .leftJoin(users, eq(activists.userId, users.id))
    .leftJoin(provinces, eq(activists.provinceId, provinces.id))
    .leftJoin(counties, eq(activists.countyId, counties.id));
}

async function filterNames(filters: BroadcastFilters) {
  const names: { province?: string | null; county?: string | null; specialty?: string | null } = {};
  if (filters.provinceId) names.province = (await db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, filters.provinceId)))[0]?.name ?? null;
  if (filters.countyId) names.county = (await db.select({ name: counties.name }).from(counties).where(eq(counties.id, filters.countyId)))[0]?.name ?? null;
  if (filters.specialtyId) names.specialty = (await db.select({ title: specialties.title }).from(specialties).where(eq(specialties.id, filters.specialtyId)))[0]?.title ?? null;
  return names;
}

export type AudienceRow = Awaited<ReturnType<typeof baseAudienceSelect>>[number];
export type AudiencePreview = { total: number; withPhone: number; withAccount: number; sample: AudienceRow[]; overCap: boolean };

/** Live audience preview for the compose page (counts + first sample rows). */
export async function previewAudience(user: SessionUser, filters: BroadcastFilters): Promise<AudiencePreview> {
  const clauses = audienceConditions(user, filters);
  const where = clauses.length ? and(...clauses) : undefined;
  const [totals] = await db.select({
    total: count(),
    withPhone: sql<number>`count(${activists.phone}) filter (where ${activists.phone} is not null and ${activists.phone} <> '')::int`,
    withAccount: sql<number>`count(${activists.userId})::int`,
  }).from(activists).where(where);
  const sample = await baseAudienceSelect().where(where).orderBy(desc(activists.createdAt)).limit(BROADCAST_SAMPLE_SIZE);
  return { total: Number(totals?.total ?? 0), withPhone: Number(totals?.withPhone ?? 0), withAccount: Number(totals?.withAccount ?? 0), sample, overCap: Number(totals?.total ?? 0) > MAX_BROADCAST_RECIPIENTS };
}

export type BroadcastSummary = {
  recipients: number; sms: number; localSms: number; notifications: number; withoutPhone: number;
};

/**
 * Sends one broadcast. Nothing is written when the audience exceeds the cap;
 * the caller surfaces the error via the query-string banner.
 */
export async function sendBroadcast(actor: SessionUser, message: { subject: string; body: string }, filters: BroadcastFilters): Promise<{ summary: BroadcastSummary | null; error?: string }> {
  const clauses = audienceConditions(actor, filters);
  const rows = await baseAudienceSelect().where(clauses.length ? and(...clauses) : undefined).orderBy(desc(activists.createdAt)).limit(MAX_BROADCAST_RECIPIENTS + 1);
  if (rows.length > MAX_BROADCAST_RECIPIENTS) return { summary: null, error: `تعداد گیرندگان بیشتر از سقف مجاز (${faNumber(MAX_BROADCAST_RECIPIENTS)}) است؛ لطفاً فیلترها را محدودتر کنید.` };
  if (!rows.length) return { summary: null, error: "هیچ فعالی با این فیلترها در محدوده شما یافت نشد." };

  const names = await filterNames(filters);
  const label = audienceLabel(filters, names);
  const smsText = broadcastSmsText(message.subject, message.body);
  const smsEnabled = smsProvider();
  const summary: BroadcastSummary = { recipients: rows.length, sms: 0, localSms: 0, notifications: 0, withoutPhone: 0 };

  await db.transaction(async (tx) => {
    const [row] = await tx.insert(messageBroadcasts).values({
      subject: message.subject, body: message.body,
      audience: filterParams(filters), audienceLabel: label,
      recipientCount: rows.length, sentBy: actor.id,
    }).returning();

    const notifyUserIds = [...new Set(rows.filter((item) => item.userId && item.userActive).map((item) => item.userId as string))];
    const notificationList = notifyUserIds.map((userId) => ({ userId, applicationId: null, title: message.subject.slice(0, 140), body: message.body }));
    if (notificationList.length) await tx.insert(notifications).values(notificationList);
    summary.notifications = notificationList.length;

    for (const item of rows) {
      if (item.phone) {
        await queueSms(tx, item.phone, smsText, { userId: item.userId ?? null, applicationId: null });
        if (smsEnabled) summary.sms++; else summary.localSms++;
      } else summary.withoutPhone++;
    }

    await tx.update(messageBroadcasts).set({
      smsCount: summary.sms + summary.localSms,
      notificationCount: summary.notifications,
      withoutPhoneCount: summary.withoutPhone,
    }).where(eq(messageBroadcasts.id, row.id));

    await tx.insert(auditLogs).values({
      actorId: actor.id, action: "send_broadcast", targetType: "broadcast", targetId: row.id,
      detail: `recipients=${rows.length};sms=${summary.sms + summary.localSms};sms_mode=${smsEnabled ?? "local"};notifications=${summary.notifications};audience=${label}`,
    });
  });

  return { summary };
}

/** Recent broadcasts for the history table. */
export async function listRecentBroadcasts(limit = 15) {
  return db.select({
    id: messageBroadcasts.id, subject: messageBroadcasts.subject, body: messageBroadcasts.body,
    audienceLabel: messageBroadcasts.audienceLabel, recipientCount: messageBroadcasts.recipientCount,
    smsCount: messageBroadcasts.smsCount, notificationCount: messageBroadcasts.notificationCount,
    withoutPhoneCount: messageBroadcasts.withoutPhoneCount, createdAt: messageBroadcasts.createdAt,
    senderName: users.fullName,
  }).from(messageBroadcasts)
    .leftJoin(users, eq(messageBroadcasts.sentBy, users.id))
    .orderBy(desc(messageBroadcasts.createdAt))
    .limit(limit);
}

/** Helper kept for feature tests / future dedup work. */
export const broadcastRecipientKeys = (rows: { id: string }[]) => rows.map((row) => row.id).filter(isUuid);
export const broadcastFilterSummary = (filters: BroadcastFilters) => filterParams(filters);
export const statusChoices = () => Object.entries(statusLabels).filter(([key]) => !["draft", "filling", "needs_correction"].includes(key));
export const audienceActivistIds = async (user: SessionUser, filters: BroadcastFilters) => {
  const clauses = audienceConditions(user, filters);
  const rows = await db.select({ id: activists.id }).from(activists).where(clauses.length ? and(...clauses) : undefined).limit(MAX_BROADCAST_RECIPIENTS + 1);
  return rows.map((row) => row.id);
};
export const usersById = async (ids: string[]) => ids.length ? db.select({ id: users.id, active: users.active }).from(users).where(inArray(users.id, ids)) : [];
