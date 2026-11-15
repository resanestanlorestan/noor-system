"use server";

// الحاقیهٔ ۲.۱۶.۰ — اکشن‌های «اطلاع‌رسانی پیامکی مدیران» (فقط دارندگان مجوز
// «sms.manage»، پیش‌فرض مدیر ارشد): همگام‌سازی مدیران از سامانهٔ کاربران،
// مدیریت دستی دریافت‌کنندگان، کلید ارسال خودکار، پیامک آزمایشی و ارسال مجدد
// رویدادهای ناموفق. همهٔ عملیات با رد ممیزی ثبت می‌شود.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { managerSmsEvents, managerSmsRecipients, managerSmsSettings, messageOutbox } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deliverOutbox, normalizeIranMobile, smsReady } from "@/lib/messaging";
import { resolveSmsTemplate } from "@/lib/sms-admin";
import { managerCaseCreatedVars, syncManagerRecipients } from "@/lib/manager-sms";
import { normalizeText } from "@/lib/format";
import { stashFlash } from "@/lib/flash";
import { isUuid } from "@/lib/workflow-utils";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);
const VALID_PHONE = /^09\d{9}$/;

async function managerSmsGuard() {
  const user = await requireUser();
  if (!(await can(user, "sms.manage"))) redirect(`/dashboard?m=${stashFlash("دسترسی اطلاع‌رسانی پیامکی مدیران را ندارید.")}`);
  return user;
}

function back(message: string): never {
  return redirect(`/manager-sms?m=${stashFlash(message)}`);
}

// --- همگام‌سازی مدیران از سامانهٔ کاربران ---

export async function syncManagersAction(): Promise<void> {
  const user = await managerSmsGuard();
  const result = await syncManagerRecipients(user.id);
  await audit(user.id, "sync_manager_sms_recipients", "manager_sms_recipients", "all", `identified=${result.identified};added=${result.added};updated=${result.updated};removed=${result.removed};duplicates=${result.duplicates.length};errors=${result.errors.length}`);
  revalidatePath("/manager-sms");
  const parts = [`همگام‌سازی انجام شد — ${result.identified} مدیر شناسایی شد، ${result.added} ردیف افزوده، ${result.updated} به‌روزرسانی و ${result.removed} ردیف منقضی حذف شد.`];
  for (const item of [...result.duplicates, ...result.errors]) parts.push(`• ${item}`);
  back(parts.join("\n"));
}

// --- مدیریت دستی دریافت‌کنندگان ---

export async function addManagerRecipientAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await managerSmsGuard();
  const fullName = field(data, "fullName", 120);
  const position = field(data, "position", 120);
  const phone = normalizeIranMobile(field(data, "phone", 20));
  if (fullName.length < 3) return { error: "نام و نام خانوادگی مدیر را کامل وارد کنید." };
  if (!VALID_PHONE.test(phone)) return { error: "شمارهٔ موبایل معتبر نیست؛ شماره را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید." };
  const [existing] = await db.select({ id: managerSmsRecipients.id }).from(managerSmsRecipients).where(eq(managerSmsRecipients.phone, phone)).limit(1);
  if (existing) return { error: "این شماره موبایل قبلاً در فهرست دریافت‌کنندگان ثبت شده است." };
  const [created] = await db.insert(managerSmsRecipients).values({ fullName, position, phone, smsEnabled: true, source: "manual", createdBy: user.id }).returning({ id: managerSmsRecipients.id });
  await audit(user.id, "add_manager_sms_recipient", "manager_sms_recipient", created.id, `phone=${phone};position=${position}`);
  revalidatePath("/manager-sms");
  return { success: `مدیر «${fullName}» به فهرست دریافت‌کنندگان پیامک اضافه شد.` };
}

export async function updateManagerRecipientAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await managerSmsGuard();
  const id = field(data, "recipientId", 40);
  const fullName = field(data, "fullName", 120);
  const position = field(data, "position", 120);
  const phone = normalizeIranMobile(field(data, "phone", 20));
  if (!isUuid(id)) return { error: "شناسهٔ مدیر معتبر نیست." };
  if (fullName.length < 3) return { error: "نام و نام خانوادگی مدیر را کامل وارد کنید." };
  if (!VALID_PHONE.test(phone)) return { error: "شمارهٔ موبایل معتبر نیست؛ شماره را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید." };
  const [clash] = await db.select({ id: managerSmsRecipients.id }).from(managerSmsRecipients).where(eq(managerSmsRecipients.phone, phone)).limit(1);
  if (clash && clash.id !== id) return { error: "این شماره موبایل برای مدیر دیگری ثبت شده است." };
  await db.update(managerSmsRecipients).set({ fullName, position, phone, updatedAt: new Date() }).where(eq(managerSmsRecipients.id, id));
  await audit(user.id, "update_manager_sms_recipient", "manager_sms_recipient", id, `phone=${phone}`);
  revalidatePath("/manager-sms");
  return { success: "اطلاعات مدیر به‌روزرسانی شد." };
}

export async function deleteManagerRecipientAction(data: FormData) {
  const user = await managerSmsGuard();
  const id = field(data, "recipientId", 40);
  if (!isUuid(id)) back("شناسهٔ مدیر معتبر نیست.");
  const [row] = await db.select({ fullName: managerSmsRecipients.fullName }).from(managerSmsRecipients).where(eq(managerSmsRecipients.id, id)).limit(1);
  if (!row) back("این مدیر در فهرست پیدا نشد.");
  await db.delete(managerSmsRecipients).where(eq(managerSmsRecipients.id, id));
  await audit(user.id, "delete_manager_sms_recipient", "manager_sms_recipient", id, row.fullName);
  revalidatePath("/manager-sms");
  back(`مدیر «${row.fullName}» و سابقهٔ پیامک‌هایش حذف شد.`);
}

export async function toggleManagerRecipientSmsAction(data: FormData) {
  const user = await managerSmsGuard();
  const id = field(data, "recipientId", 40);
  if (!isUuid(id)) back("شناسهٔ مدیر معتبر نیست.");
  const [row] = await db.select({ fullName: managerSmsRecipients.fullName, smsEnabled: managerSmsRecipients.smsEnabled }).from(managerSmsRecipients).where(eq(managerSmsRecipients.id, id)).limit(1);
  if (!row) back("این مدیر در فهرست پیدا نشد.");
  const next = !row.smsEnabled;
  await db.update(managerSmsRecipients).set({ smsEnabled: next, updatedAt: new Date() }).where(eq(managerSmsRecipients.id, id));
  await audit(user.id, "toggle_manager_sms_recipient", "manager_sms_recipient", id, `enabled=${next}`);
  revalidatePath("/manager-sms");
  back(next ? `دریافت پیامک برای «${row.fullName}» فعال شد.` : `دریافت پیامک برای «${row.fullName}» غیرفعال شد؛ پیامک‌های خودکار برای او ارسال نمی‌شود.`);
}

// --- تنظیمات ارسال خودکار ---

export async function saveManagerSmsSettingsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await managerSmsGuard();
  const autoCaseCreated = field(data, "autoCaseCreated", 5) === "1";
  await db.insert(managerSmsSettings).values({ id: "default", autoCaseCreated, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: managerSmsSettings.id, set: { autoCaseCreated, updatedBy: user.id, updatedAt: new Date() } });
  await audit(user.id, "save_manager_sms_settings", "manager_sms_settings", "default", `auto_case_created=${autoCaseCreated}`);
  revalidatePath("/manager-sms");
  return { success: autoCaseCreated ? "ارسال خودکار پیامک هنگام ثبت پرونده فعال شد." : "ارسال خودکار هنگام ثبت پرونده خاموش شد." };
}

// --- پیامک آزمایشی ---

export async function sendManagerTestSmsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await managerSmsGuard();
  const phone = normalizeIranMobile(field(data, "phone", 20));
  if (!VALID_PHONE.test(phone)) return { error: "شمارهٔ گیرندهٔ پیامک آزمایشی را به شکل ۰۹xxxxxxxxx وارد کنید." };
  const body = await resolveSmsTemplate("manager_case_created", managerCaseCreatedVars("نمونهٔ آزمایشی", new Date()));
  const message = body?.body ?? "مدیر محترم، یک پرونده جدید در سامانه نور ثبت شد.\nلطفاً جهت بررسی به پنل مدیریت مراجعه فرمایید.";
  const ready = await smsReady();
  const [row] = await db.insert(messageOutbox).values({
    channel: "sms", recipient: phone, userId: user.id, subject: null, body: message,
    status: ready ? "queued" : "local", deliveredAt: ready ? null : new Date(),
    category: body?.category ?? "case", templateKey: "manager_case_created",
  }).returning({ id: messageOutbox.id });
  await deliverOutbox();
  const [after] = await db.select({ status: messageOutbox.status, error: messageOutbox.error }).from(messageOutbox).where(eq(messageOutbox.id, row.id)).limit(1);
  await audit(user.id, "send_manager_test_sms", "sms_outbox", row.id, `status=${after?.status ?? "?"}`);
  revalidatePath("/manager-sms");
  if (after?.status === "failed") return { error: `ارسال آزمایشی به ${phone} ناموفق بود — ${after.error ?? "خطای نامشخص پنل پیامکی"}.` };
  if (after?.status === "local") return { error: `پنل پیامکی تنظیم نشده است؛ پیامک آزمایشی فقط در صندوق محلی ذخیره شد. تنظیمات اتصال را در «مدیریت پیامک‌ها» کامل کنید.`, warning: true };
  return { success: `پیامک آزمایشی به ${phone} با موفقیت به پنل پیامکی تحویل شد.` };
}

// --- ارسال مجدد رویداد ناموفق ---

export async function resendManagerEventAction(data: FormData) {
  const user = await managerSmsGuard();
  const id = field(data, "eventId", 40);
  if (!isUuid(id)) back("شناسهٔ رویداد معتبر نیست.");
  const [event] = await db.select().from(managerSmsEvents).where(eq(managerSmsEvents.id, id)).limit(1);
  if (!event) back("رویداد پیامکی پیدا نشد.");
  if (event.status !== "failed") back("فقط پیامک‌های ناموفق برای تلاش دوباره قابل ارسال هستند.");
  if (!event.outboxId) back("این رویداد به صندوق پیام متصل نیست؛ ابتدا اتصال پنل پیامکی را بررسی کنید.");
  const outboxId = event.outboxId;
  await db.update(messageOutbox).set({ status: "queued", error: null }).where(eq(messageOutbox.id, outboxId));
  await deliverOutbox();
  const [after] = await db.select({ status: messageOutbox.status, error: messageOutbox.error, deliveredAt: messageOutbox.deliveredAt }).from(messageOutbox).where(eq(messageOutbox.id, outboxId)).limit(1);
  await db.update(managerSmsEvents).set({
    status: after?.status ?? "failed", error: after?.error ?? null, attempts: event.attempts + 1,
    sentAt: after && (after.status === "sent" || after.status === "local") ? (after.deliveredAt ?? new Date()) : null,
  }).where(eq(managerSmsEvents.id, id));
  await audit(user.id, "resend_manager_sms_event", "manager_sms_event", id, `status=${after?.status ?? "?"}`);
  revalidatePath("/manager-sms");
  back(after?.status === "failed"
    ? `تلاش دوباره ناموفق ماند — ${after.error ?? "خطای نامشخص پنل پیامکی"}`
    : "تلاش دوباره انجام شد و پیامک با موفقیت ثبت/ارسال شد.");
}
