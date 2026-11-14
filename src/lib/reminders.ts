// Overdue-case SMS reminders (یادآور پیامکی پرونده‌های معوق — Release 2.1).
//
// A case is «معوق» when it has sat unchanged in a review status for longer
// than the threshold (default 14 days, same definition as the dashboard card
// and the reports module). Each eligible case gets exactly one reminder per
// cooldown window (default 3 days) to its *responsible person*:
//   1. the assigned expert,          → app_users.phone
//   2. else the staff creator,       → app_users.phone
//   3. else the activist's own user  → quranic_activists.phone
// The SMS body goes through message_outbox (Kavenegar when configured,
// otherwise captured locally) and an in-app notification is always created.
// Every send is recorded in case_reminders, which is what makes the cooldown
// and the audit trail work.
import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { activists, applications, auditLogs, caseReminders, counties, notifications, provinces, users } from "@/db/schema";
import type { MaybeSessionUser, SessionUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";
import { normalizeDigits } from "@/lib/format";
import { faNumber } from "@/lib/format";
import { queueSms, smsConfigured } from "@/lib/messaging";
import { statusLabels, type AppStatus, type UserRole } from "@/lib/constants";
import { notificationRows, isUuid } from "@/lib/workflow-utils";

export const OVERDUE_STATUSES = ["pending", "specialist_review"] as const satisfies readonly AppStatus[];
export const THRESHOLD_OPTIONS = [7, 14, 30] as const;
export const DEFAULT_THRESHOLD_DAYS = 14;
export const REMINDER_COOLDOWN_DAYS = 3;
export const MAX_REMINDER_BATCH = 100;

const DAY_MS = 86400000;

// ---------- pure helpers (unit-testable) ----------

/** Cases untouched since this instant count as overdue. */
export function overdueSince(thresholdDays: number, now = new Date()): Date {
  return new Date(now.getTime() - thresholdDays * DAY_MS);
}

/** Whole days a case has been waiting (floor). */
export function waitingDays(updatedAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / DAY_MS));
}

export function isCooldownActive(lastReminderAt: Date | null, now = new Date(), cooldownDays = REMINDER_COOLDOWN_DAYS): boolean {
  return !!lastReminderAt && now.getTime() - lastReminderAt.getTime() < cooldownDays * DAY_MS;
}

/** pg may hand raw-SQL timestamps back as ISO strings; always coerce. */
export function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Accepts ۷/۱۴/۳۰ (also Persian digits); anything else falls back to the default. */
export function parseThreshold(raw: string | null | undefined): number {
  const value = Number(normalizeDigits(String(raw || "")));
  return (THRESHOLD_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_THRESHOLD_DAYS;
}

/** Keeps 4 leading + 4 trailing digits; everything between becomes ***. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = normalizeDigits(phone).replace(/[^\d+]/g, "");
  return digits.length >= 10 ? `${digits.slice(0, 4)}***${digits.slice(-4)}` : "***";
}

export function staffSmsText(activistName: string, days: number): string {
  return `سامانه نور: پرونده ${activistName} بیش از ${faNumber(days)} روز در انتظار بررسی است. لطفاً در سامانه پیگیری فرمایید.`;
}
export function activistSmsText(days: number): string {
  return `سامانه نور: پرونده شما بیش از ${faNumber(days)} روز در انتظار بررسی است. برای اطلاع از وضعیت به سامانه مراجعه فرمایید.`;
}

export type ReminderSource = "expert" | "staff_creator" | "activist";

/** Minimal shape of a query row the resolver needs. */
export type ReminderTargetRow = {
  expertId: string | null; expertActive: boolean | null; expertPhone: string | null;
  creatorId: string; creatorRole: UserRole | null; creatorActive: boolean | null; creatorPhone: string | null;
  activistUserId: string | null; activistUserActive: boolean | null; activistPhone: string | null;
};

export type ResolvedRecipient = { userId: string; phone: string | null; source: ReminderSource };

/** Deterministic responsible-person resolution for one case row. */
export function resolveRecipient(row: ReminderTargetRow): ResolvedRecipient | null {
  if (row.expertId && row.expertActive) return { userId: row.expertId, phone: row.expertPhone, source: "expert" };
  if (row.creatorRole && row.creatorRole !== "activist" && row.creatorActive) return { userId: row.creatorId, phone: row.creatorPhone, source: "staff_creator" };
  if (row.activistUserId && row.activistUserActive) return { userId: row.activistUserId, phone: row.activistPhone, source: "activist" };
  return null;
}

// ---------- data layer ----------

const expertUser = alias(users, "reminder_expert_user");
const creatorUser = alias(users, "reminder_creator_user");
const activistUser = alias(users, "reminder_activist_user");

const lastReminderExpr = sql<Date | null>`(select max(${caseReminders.createdAt}) from ${caseReminders} where ${caseReminders.applicationId} = ${applications.id})`;

function baseOverdueSelect() {
  return db.select({
    id: applications.id, status: applications.status, updatedAt: applications.updatedAt,
    activistName: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    activistPhone: activists.phone, activistUserId: activists.userId, activistUserActive: activistUser.active,
    province: provinces.name, county: counties.name,
    expertId: applications.assignedExpertId, expertName: expertUser.fullName, expertPhone: expertUser.phone, expertActive: expertUser.active,
    creatorId: applications.createdBy, creatorRole: creatorUser.role, creatorName: creatorUser.fullName, creatorPhone: creatorUser.phone, creatorActive: creatorUser.active,
    lastReminderAt: lastReminderExpr,
  }).from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .leftJoin(provinces, eq(activists.provinceId, provinces.id))
    .leftJoin(counties, eq(activists.countyId, counties.id))
    .leftJoin(expertUser, eq(applications.assignedExpertId, expertUser.id))
    .leftJoin(creatorUser, eq(applications.createdBy, creatorUser.id))
    .leftJoin(activistUser, eq(activists.userId, activistUser.id));
}

export type OverdueCaseRow = Awaited<ReturnType<typeof listOverdueCases>>[number];

/** Overdue cases inside the user's scope, longest-waiting first. */
export async function listOverdueCases(user: MaybeSessionUser, thresholdDays = DEFAULT_THRESHOLD_DAYS, now = new Date()) {
  const rows = await baseOverdueSelect()
    .where(and(user ? scopeCondition(user) : sql`true`, isNull(applications.deletedAt), inArray(applications.status, [...OVERDUE_STATUSES]), lt(applications.updatedAt, overdueSince(thresholdDays, now))))
    .orderBy(asc(applications.updatedAt))
    .limit(400);
  return rows.map((row) => ({ ...row, lastReminderAt: toDateOrNull(row.lastReminderAt), waitingDays: waitingDays(row.updatedAt, now), cooldownActive: isCooldownActive(toDateOrNull(row.lastReminderAt), now) }));
}

export type ReminderSummary = {
  considered: number; cooldownSkipped: number; noRecipient: number;
  sent: number; withSms: number; localSms: number; withoutPhone: number;
  bySource: Record<ReminderSource, number>;
};

/**
 * Sends reminders for eligible overdue cases. `actor === null` means the
 * automated cron sweep (system actor, full scope, no permission check — the
 * route layer guards the secret). Scoping for human actors always flows
 * through scopeCondition, so a province admin can never reach other
 * provinces' cases.
 */
export async function sendReminders(actor: SessionUser | null, options: { thresholdDays?: number; caseIds?: string[]; now?: Date } = {}): Promise<ReminderSummary> {
  const thresholdDays = options.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  const now = options.now ?? new Date();
  const selected = options.caseIds?.filter(isUuid);
  const scope: SQL = actor ? scopeCondition(actor) : sql`true`;
  const conditions: SQL[] = [scope, isNull(applications.deletedAt), inArray(applications.status, [...OVERDUE_STATUSES]), lt(applications.updatedAt, overdueSince(thresholdDays, now))];
  if (selected?.length) conditions.push(inArray(applications.id, selected));
  const rows = await baseOverdueSelect().where(and(...conditions)).orderBy(asc(applications.updatedAt)).limit(MAX_REMINDER_BATCH);

  const summary: ReminderSummary = { considered: rows.length, cooldownSkipped: 0, noRecipient: 0, sent: 0, withSms: 0, localSms: 0, withoutPhone: 0, bySource: { expert: 0, staff_creator: 0, activist: 0 } };
  const smsEnabled = smsConfigured();

  for (const row of rows) {
    const lastReminderAt = toDateOrNull(row.lastReminderAt);
    if (isCooldownActive(lastReminderAt, now)) { summary.cooldownSkipped++; continue; }
    const recipient = resolveRecipient(row);
    if (!recipient) { summary.noRecipient++; continue; }
    const days = waitingDays(row.updatedAt, now);
    const message = recipient.source === "activist" ? activistSmsText(days) : staffSmsText(row.activistName, days);

    await db.transaction(async (tx) => {
      await tx.insert(caseReminders).values({
        applicationId: row.id, recipientId: recipient.userId, recipientPhone: recipient.phone,
        message, sentBy: actor?.id ?? null, automated: !actor,
      });
      const title = "یادآور پرونده معوق";
      const body = recipient.source === "activist"
        ? `پرونده شما بیش از ${faNumber(days)} روز در وضعیت «${statusLabels[row.status]}» بدون به‌روزرسانی است. لطفاً پیگیری فرمایید.`
        : `پرونده ${row.activistName} بیش از ${faNumber(days)} روز در وضعیت «${statusLabels[row.status]}» بدون به‌روزرسانی است. لطفاً بررسی کنید.`;
      const notificationList = notificationRows([recipient.userId], title, body, row.id);
      if (notificationList.length) await tx.insert(notifications).values(notificationList);
      if (recipient.phone) {
        await queueSms(tx, recipient.phone, message, { userId: recipient.userId, applicationId: row.id });
      }
      await tx.insert(auditLogs).values({
        actorId: actor?.id ?? null, action: "send_reminder", targetType: "application", targetId: row.id,
        detail: `source=${recipient.source};days=${days};phone=${recipient.phone ? "yes" : "no"};sms=${recipient.phone ? (smsEnabled ? "queued" : "local") : "skipped"}`,
      });
    });

    summary.sent++;
    summary.bySource[recipient.source]++;
    if (recipient.phone) {
      // Real SMS when Kavenegar is configured (outbox status "queued"),
      // otherwise captured in the outbox with status "local".
      if (smsEnabled) summary.withSms++; else summary.localSms++;
    } else summary.withoutPhone++;
  }
  return summary;
}

/** Cron entry point: sweep + best-effort delivery of the queued messages. */
export async function runAutomatedReminders(thresholdDays = DEFAULT_THRESHOLD_DAYS) {
  const summary = await sendReminders(null, { thresholdDays });
  const { deliverOutbox } = await import("@/lib/messaging");
  await deliverOutbox();
  return summary;
}

/** Recent reminder history for the management page. */
export async function listRecentReminders(limit = 20) {
  return db.select({
    id: caseReminders.id, message: caseReminders.message, automated: caseReminders.automated,
    recipientPhone: caseReminders.recipientPhone, createdAt: caseReminders.createdAt,
    activistName: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    recipientName: users.fullName,
  }).from(caseReminders)
    .innerJoin(applications, eq(caseReminders.applicationId, applications.id))
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .innerJoin(users, eq(caseReminders.recipientId, users.id))
    .orderBy(desc(caseReminders.createdAt))
    .limit(limit);
}
