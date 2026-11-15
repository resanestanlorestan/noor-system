// الحاقیهٔ ۲.۱۶.۰ — مدیریت اطلاع‌رسانی پیامکی مدیران.
// دو مسئولیت: (۱) همگام‌سازی خودکار فهرست مدیران از سامانهٔ کاربران — هر
// کاربری که نقش پایهٔ مدیریتی دارد یا سمت سفارشی‌اش حاوی «مدیر» است، با
// شمارهٔ معتبر و بدون تکرار، به فهرست دریافت‌کنندگان می‌رسد و با تغییر
// سامانهٔ اصلی به‌روز یا حذف می‌شود؛ (۲) ارسال خودکار پیامک هنگام ثبت پرونده
// برای همهٔ مدیران فعال — ضدتکرار با کلید یکتای دیتابیس، ثبت وضعیت و خطای
// واقعی پنل پیامکی روی رد رویداد و امکان تلاش دوباره.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customRoles, managerSmsEvents, managerSmsRecipients, managerSmsSettings, messageOutbox, users } from "@/db/schema";
import { deliverOutbox, normalizeIranMobile, smsReady } from "@/lib/messaging";
import { resolveSmsTemplate } from "@/lib/sms-admin";
import { roleLabels, type UserRole } from "@/lib/constants";

export type ManagerSyncResult = {
  identified: number;
  added: number;
  updated: number;
  removed: number;
  duplicates: string[];
  errors: string[];
};

const MANAGER_ROLE_KEYS: readonly UserRole[] = ["super_admin", "province_admin", "county_admin"];
const VALID_PHONE = /^09\d{9}$/;

/** شناسایی مدیران از سامانهٔ کاربران: نقش پایهٔ مدیریتی یا سمت سفارشی حاوی «مدیر». */
export async function identifyManagers() {
  const rows = await db.select({
    id: users.id,
    fullName: users.fullName,
    phone: users.phone,
    role: users.role,
    customLabel: customRoles.label,
  }).from(users)
    .leftJoin(customRoles, eq(users.customRoleId, customRoles.id))
    .where(and(eq(users.active, true), isNull(users.deletedAt)));
  return rows.filter((row) => MANAGER_ROLE_KEYS.includes(row.role) || (row.customLabel ?? "").includes("مدیر"));
}

/** همگام‌سازی کامل و ایدم‌پوتنت فهرست دریافت‌کنندگان با سامانهٔ کاربران.
 *  شماره کلید یکتاست؛ نام/سمت/شمارهٔ ردیف‌های خودکار با سامانهٔ اصلی به‌روز
 *  می‌شود و ردیف خودکارِ مدیری که دیگر مدیر نیست (تغییر نقش، غیرفعالی، حذف)
 *  از فهرست پاک می‌شود. پرچم دریافت پیامک هر مدیر دست‌نخورده می‌ماند. */
export async function syncManagerRecipients(actorId?: string | null): Promise<ManagerSyncResult> {
  const duplicates: string[] = [];
  const errors: string[] = [];
  const raw = await identifyManagers();
  const candidates = raw.map((row) => ({
    sourceUserId: row.id,
    fullName: (row.fullName || "بدون نام").slice(0, 120),
    position: ((row.customLabel && row.customLabel.includes("مدیر") ? row.customLabel : roleLabels[row.role]) || "").slice(0, 120),
    phone: normalizeIranMobile(row.phone || ""),
  }));
  const valid = candidates.filter((item) => VALID_PHONE.test(item.phone));
  for (const bad of candidates.filter((item) => !VALID_PHONE.test(item.phone))) {
    errors.push(`«${bad.fullName}» شمارهٔ موبایل معتبری در حسابش ندارد و به فهرست پیامک اضافه نشد.`);
  }
  const identified = valid.length;
  const existing = await db.select().from(managerSmsRecipients);
  const bySource = new Map(existing.filter((row) => row.sourceUserId).map((row) => [row.sourceUserId!, row]));
  const byPhone = new Map(existing.map((row) => [row.phone, { id: row.id, phone: row.phone, sourceUserId: row.sourceUserId, fullName: row.fullName }]));
  const seen = new Set<string>();
  let added = 0;
  let updated = 0;
  for (const candidate of valid) {
    // جلوگیری از شمارهٔ تکراری حتی اگر دو حساب مختلف همان شماره را داشته باشند
    if (seen.has(candidate.phone)) {
      duplicates.push(`شمارهٔ ${candidate.phone} هم‌زمان برای بیش از یک مدیر در سامانه ثبت است؛ فقط اولین حساب فهرست شد.`);
      continue;
    }
    seen.add(candidate.phone);
    const current = bySource.get(candidate.sourceUserId);
    const phoneOwner = byPhone.get(candidate.phone);
    if (current && current.id !== phoneOwner?.id && phoneOwner) {
      duplicates.push(`شمارهٔ جدید «${candidate.fullName}» (${candidate.phone}) پیش‌تر برای «${phoneOwner.fullName}» ثبت شده است؛ شمارهٔ او به‌روز نشد.`);
      continue;
    }
    if (!current && phoneOwner && phoneOwner.sourceUserId !== candidate.sourceUserId) {
      duplicates.push(`شمارهٔ «${candidate.fullName}» (${candidate.phone}) برای «${phoneOwner.fullName}» قبلاً ثبت شده است؛ ردیف تکراری ساخته نشد.`);
      continue;
    }
    if (current) {
      if (current.fullName !== candidate.fullName || current.position !== candidate.position || current.phone !== candidate.phone) {
        await db.update(managerSmsRecipients).set({ fullName: candidate.fullName, position: candidate.position, phone: candidate.phone, updatedAt: new Date() }).where(eq(managerSmsRecipients.id, current.id));
        byPhone.delete(current.phone);
        byPhone.set(candidate.phone, { ...current, phone: candidate.phone });
        updated += 1;
      }
    } else {
      const [created] = await db.insert(managerSmsRecipients).values({
        sourceUserId: candidate.sourceUserId, fullName: candidate.fullName, position: candidate.position,
        phone: candidate.phone, smsEnabled: true, source: "auto", createdBy: actorId ?? null,
      }).onConflictDoNothing({ target: managerSmsRecipients.phone }).returning({ id: managerSmsRecipients.id });
      if (created) {
        byPhone.set(candidate.phone, { id: created.id, phone: candidate.phone, sourceUserId: candidate.sourceUserId, fullName: candidate.fullName });
        added += 1;
      }
    }
  }
  // ردیف‌های خودکاری که منبعشان دیگر مدیر فعال سامانه نیست، حذف می‌شوند
  const validSources = new Set(valid.map((item) => item.sourceUserId));
  const stale = existing.filter((row) => row.source === "auto" && row.sourceUserId && !validSources.has(row.sourceUserId));
  if (stale.length) await db.delete(managerSmsRecipients).where(inArray(managerSmsRecipients.id, stale.map((row) => row.id)));
  return { identified, added, updated, removed: stale.length, duplicates, errors };
}

/** قالب متن پیامک ثبت پرونده (متغیرها از رجیستری/دیتابیس قالب‌ها). */
export function managerCaseCreatedVars(registrantName: string, occurredAt: Date) {
  const datetime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeStyle: "short" }).format(occurredAt);
  return { registrant: registrantName || "کاربر سامانه", datetime, app: "سامانه نور" };
}

/** ارسال خودکار پیامک «ثبت پروندهٔ جدید» به همهٔ مدیران فعال.
 *  هرگز خطا نمی‌پراند و ثبت پرونده را نمی‌شکند؛ وضعیت و خطای واقعی پنل
 *  پیامکی روی رد رویداد ثبت می‌شود و ارسال تکراری همان پرونده با کلید یکتا
 *  در سطح دیتابیس مسدود است. رویدادهای دیگر در آینده با همین الگو اضافه می‌شوند. */
export async function dispatchCaseCreatedSms(entityId: string, registrantName: string, actorId?: string | null): Promise<void> {
  try {
    const [settings] = await db.select().from(managerSmsSettings).where(eq(managerSmsSettings.id, "default"));
    if (settings && !settings.autoCaseCreated) return;
    const recipients = await db.select().from(managerSmsRecipients).where(eq(managerSmsRecipients.smsEnabled, true));
    if (!recipients.length) return;
    const body = await resolveSmsTemplate("manager_case_created", managerCaseCreatedVars(registrantName, new Date()));
    const message = body?.body ?? "مدیر محترم، یک پرونده جدید در سامانه نور ثبت شد.\nلطفاً جهت بررسی به پنل مدیریت مراجعه فرمایید.";
    const category = body?.category ?? "case";
    // ضدتکرار: ردیفی که همین حالا ساخته می‌شود کلید یکتا دارد؛ تلاش دوبارهٔ
    // همان پرونده (رفرش همزمان، تلاش دوبارهٔ اکشن) بدون ردیف تازه رد می‌شود.
    const fresh: string[] = [];
    for (const recipient of recipients) {
      const [row] = await db.insert(managerSmsEvents).values({
        eventType: "case_created", entityId, recipientId: recipient.id, phone: recipient.phone,
        message, status: "queued", createdBy: actorId ?? null,
      }).onConflictDoNothing({ target: [managerSmsEvents.eventType, managerSmsEvents.entityId, managerSmsEvents.recipientId] })
        .returning({ id: managerSmsEvents.id });
      if (row) fresh.push(row.id);
    }
    if (!fresh.length) return;
    const ready = await smsReady();
    const pending = await db.select().from(managerSmsEvents).where(inArray(managerSmsEvents.id, fresh));
    const linked: { eventId: string; outboxId: string }[] = [];
    for (const event of pending) {
      const [outboxRow] = await db.insert(messageOutbox).values({
        channel: "sms", recipient: event.phone, applicationId: entityId, subject: null, body: event.message,
        status: ready ? "queued" : "local", deliveredAt: ready ? null : new Date(),
        category, templateKey: "manager_case_created",
      }).returning({ id: messageOutbox.id });
      linked.push({ eventId: event.id, outboxId: outboxRow.id });
    }
    for (const item of linked) {
      await db.update(managerSmsEvents).set({ outboxId: item.outboxId }).where(eq(managerSmsEvents.id, item.eventId));
    }

    // تلاش واقعی ارسال از طریق پنل پیامکی؛ نتیجه از صندوق پیام بازخوانده می‌شود
    await deliverOutbox();
    for (const item of linked) {
      const [sent] = await db.select({ status: messageOutbox.status, error: messageOutbox.error, deliveredAt: messageOutbox.deliveredAt }).from(messageOutbox).where(eq(messageOutbox.id, item.outboxId));
      if (!sent) continue;
      await db.update(managerSmsEvents).set({
        status: sent.status, error: sent.error, attempts: 1,
        sentAt: sent.status === "sent" || sent.status === "local" ? (sent.deliveredAt ?? new Date()) : null,
      }).where(eq(managerSmsEvents.id, item.eventId));
    }
  } catch (error) {
    // اطلاع‌رسانی هرگز جریان ثبت پرونده را نباید بشکند
    console.error("manager-sms dispatch failed:", (error as Error)?.message ?? error);
  }
}
