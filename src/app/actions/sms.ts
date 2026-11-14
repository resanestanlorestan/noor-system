"use server";

// الحاقیهٔ ۲.۱۰.۵ — اکشن‌های پنل مدیریت پیامک‌ها (فقط دارندگان مجوز «sms.manage»،
// پیش‌فرض مدیر کل): CRUD قالب‌ها، ذخیرهٔ تنظیمات پنل پیامکی با کلید رمزنگاری‌شده،
// ارسال پیامک آزمایشی با بازخورد واقعی وضعیت و ارسال مجدد پیامک‌های ناموفق.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { messageOutbox, smsSettings, smsTemplates } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deliverOutbox, normalizeIranMobile, resolveSmsSettings, smsReady } from "@/lib/messaging";
import { encryptSecret } from "@/lib/local-secrets";
import { previewSmsBody, renderSmsBody, smsTemplateDef, type SmsCategory } from "@/lib/sms-templates";
import { normalizeText } from "@/lib/format";
import { stashFlash } from "@/lib/flash";
import { isUuid } from "@/lib/workflow-utils";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 500) => normalizeText(String(data.get(key) || "")).slice(0, max);

/** گارد مشترک: مسیر ریدایرکت با پیام فلش برای کسی که مجوز ندارد. */
async function smsGuard(tab: string) {
  const user = await requireUser();
  if (!(await can(user, "sms.manage"))) redirect(`/dashboard?m=${stashFlash("دسترسی مدیریت پیامک‌ها را ندارید.")}`);
  return user;
}

const tabRedirect: (tab: string, message: string) => never = (tab, message) => redirect(`/sms?tab=${tab}&m=${stashFlash(message)}`);

// --- قالب‌ها ---

export async function saveSmsTemplateAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await smsGuard("templates");
  const key = field(data, "templateKey", 60);
  const body = field(data, "body", 900);
  const def = smsTemplateDef(key);
  if (!def) return { error: "قالب موردنظر در رجیستری پیامک‌ها تعریف نشده است." };
  if (body.length < 5) return { error: "متن قالب را کامل‌تر بنویسید (حداقل ۵ نویسه)." };
  const preview = renderSmsBody(body, Object.fromEntries(def.variables.map((item) => [item.token, item.sample])));
  if (!preview.trim()) return { error: "پس از جایگزینی متغیرها، متن پیامک خالی می‌شود؛ متن را بررسی کنید." };
  await db.insert(smsTemplates).values({ key, body, enabled: true, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: smsTemplates.key, set: { body, updatedBy: user.id, updatedAt: new Date() } });
  await audit(user.id, "upsert_sms_template", "sms_template", key, `category=${def.category};length=${body.length}`);
  revalidatePath("/sms");
  return { success: "متن قالب ذخیره شد و از همین لحظه در پیامک‌های سامانه استفاده می‌شود." };
}

export async function resetSmsTemplateAction(data: FormData) {
  const user = await smsGuard("templates");
  const key = field(data, "templateKey", 60);
  if (!smsTemplateDef(key)) tabRedirect("templates", "قالب معتبر نیست.");
  await db.delete(smsTemplates).where(eq(smsTemplates.key, key));
  await audit(user.id, "delete_sms_template", "sms_template", key);
  revalidatePath("/sms");
  tabRedirect("templates", "قالب به متن پیش‌فرض برگشت.");
}

export async function toggleSmsTemplateAction(data: FormData) {
  const user = await smsGuard("templates");
  const key = field(data, "templateKey", 60);
  const def = smsTemplateDef(key);
  if (!def) tabRedirect("templates", "قالب معتبر نیست.");
  const [row] = await db.select({ body: smsTemplates.body, enabled: smsTemplates.enabled }).from(smsTemplates).where(eq(smsTemplates.key, key)).limit(1);
  const nextEnabled = row ? !row.enabled : false;
  await db.insert(smsTemplates).values({ key, body: row?.body ?? def.defaultBody, enabled: nextEnabled, updatedBy: user.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: smsTemplates.key, set: { enabled: nextEnabled, updatedBy: user.id, updatedAt: new Date() } });
  await audit(user.id, "upsert_sms_template", "sms_template", key, `enabled=${nextEnabled}`);
  revalidatePath("/sms");
  tabRedirect("templates", nextEnabled ? "این قالب غیرفعال شد؛ سامانه به متن پیش‌فرض رجیستری برمی‌گردد." : "قالب فعال شد.");
}

// --- تنظیمات پنل پیامکی ---

export async function saveSmsSettingsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await smsGuard("settings");
  const providerRaw = field(data, "provider", 20);
  const provider = providerRaw === "payamak-panel" || providerRaw === "kavenegar" ? providerRaw : "";
  const username = field(data, "username", 120);
  const sender = field(data, "sender", 31);
  const secret = field(data, "secret", 200);
  const enabled = field(data, "enabled", 5) === "1";
  const [existing] = await db.select({ secretCipher: smsSettings.secretCipher }).from(smsSettings).where(eq(smsSettings.id, "default")).limit(1);
  if (enabled) {
    if (!provider) return { error: "برای فعال‌سازی ارسال واقعی، سرویس‌دهنده را انتخاب کنید." };
    if (provider === "payamak-panel" && (!username || (!secret && !existing?.secretCipher))) return { error: "پیامک‌پنل به نام کاربری و کلید API نیاز دارد (اگر کلید قبلاً ذخیره شده، گذاشتن آن خالی کافی است)." };
    if (provider === "kavenegar" && !secret && !existing?.secretCipher) return { error: "کاوه‌نگار به کلید API نیاز دارد." };
  }
  const patch: Partial<typeof smsSettings.$inferInsert> = { provider, username, sender, enabled, updatedBy: user.id, updatedAt: new Date() };
  if (secret) patch.secretCipher = await encryptSecret(secret, "sms-panel-secret");
  await db.insert(smsSettings).values({ id: "default", ...patch })
    .onConflictDoUpdate({ target: smsSettings.id, set: patch });
  // اگر تنظیمات ناقص ولی فعال‌شده ذخیره شود، resolveSmsSettings به محیط برمی‌گردد؛
  // پیام وضعیت واقعی پس از ذخیره نمایش داده می‌شود.
  const nowReady = enabled && !!(await resolveSmsSettings());
  await audit(user.id, "save_sms_settings", "sms_settings", "default", `provider=${provider || "none"};enabled=${enabled};source=${nowReady ? "database" : await smsReady() ? "environment" : "local"}`);
  revalidatePath("/sms");
  revalidatePath("/outbox");
  if (enabled && !nowReady) return { success: "تنظیمات ذخیره شد اما با این مقادیر پنل فعال نمی‌شود؛ فیلدهای لازم را کامل کنید یا ارسال را غیرفعال کنید تا از متغیرهای محیطی استفاده شود." };
  return { success: nowReady ? "تنظیمات ذخیره و ارسال واقعی پیامک فعال شد." : "تنظیمات ذخیره شد؛ سامانه در حالت محلی/محیطی قبلی می‌ماند." };
}

// --- تست ارسال ---

export async function sendTestSmsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await smsGuard("settings");
  const phone = normalizeIranMobile(field(data, "phone", 20));
  if (!/^09\d{9}$/.test(phone)) return { error: "شماره موبایل گیرنده را به شکل ۰۹xxxxxxxxx وارد کنید." };
  const key = field(data, "templateKey", 60);
  const custom = field(data, "customBody", 600);
  const def = smsTemplateDef(key);
  if (!def && !custom) return { error: "یکی از قالب‌ها را انتخاب کنید یا متن دلخواه بنویسید." };
  const body = def ? previewSmsBody(def.defaultBody, def.variables) : custom;
  if (!body.trim()) return { error: "متن پیامک خالی است." };
  const ready = await smsReady();
  const [row] = await db.insert(messageOutbox).values({
    channel: "sms", recipient: phone, userId: user.id, subject: null, body,
    status: ready ? "queued" : "local", deliveredAt: ready ? null : new Date(), category: "test" as SmsCategory, templateKey: def ? key : null,
  }).returning({ id: messageOutbox.id });
  await deliverOutbox();
  const [after] = await db.select({ status: messageOutbox.status, error: messageOutbox.error }).from(messageOutbox).where(eq(messageOutbox.id, row.id)).limit(1);
  await audit(user.id, "send_test_sms", "sms_outbox", row.id, `template=${key || "custom"};status=${after?.status ?? "?"}`);
  revalidatePath("/sms");
  revalidatePath("/outbox");
  const statusText = after?.status === "sent" ? "با موفقیت به سرویس‌دهنده تحویل شد" : after?.status === "failed" ? `ناموفق بود (${after?.error ?? "خطای نامشخص"})` : after?.status === "local" ? "در حالت محلی ذخیره شد (پنل پیامکی تنظیم نشده)" : "در صف ارسال ماند";
  return after?.status === "failed"
    ? { error: `ارسال آزمایشی به ${phone} ${statusText}.`, warning: true, mobile: phone }
    : { success: `ارسال آزمایشی به ${phone} ${statusText}.`, mobile: phone };
}

// --- تاریخچه ---

export async function resendSmsAction(data: FormData) {
  const user = await smsGuard("history");
  const id = field(data, "messageId", 40);
  if (!isUuid(id)) tabRedirect("history", "شناسه پیام معتبر نیست.");
  const [row] = await db.select({ status: messageOutbox.status, channel: messageOutbox.channel }).from(messageOutbox).where(eq(messageOutbox.id, id)).limit(1);
  if (!row || row.channel !== "sms" || row.status !== "failed") tabRedirect("history", "فقط پیامک ناموفق برای ارسال مجدد قابل است.");
  await db.update(messageOutbox).set({ status: "queued", error: null }).where(eq(messageOutbox.id, id));
  await deliverOutbox();
  await audit(user.id, "resend_sms", "sms_outbox", id);
  revalidatePath("/sms");
  tabRedirect("history", "پیامک دوباره در صف ارسال قرار گرفت و تلاش ارسال انجام شد.");
}
