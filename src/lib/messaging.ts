import { createTransport } from "nodemailer";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messageOutbox, notifications, smsSettings, users } from "@/db/schema";
import { notificationRows } from "@/lib/workflow-utils";
import { decryptSecret } from "@/lib/local-secrets";
import { type SmsCategory } from "@/lib/sms-templates";
import { resolveSmsTemplate } from "@/lib/sms-admin";

export type OutboxChannel = "email" | "sms";
export type OutboxStatus = "queued" | "sent" | "failed" | "local";

export const emailConfigured = () => !!process.env.SMTP_HOST;

// --- SMS providers ---
// Supported gateways: «پیامک‌پنل» (rest.payamak-panel.com — used by SMSline
// and other payamak-panel resellers) and «کاوه‌نگار».
// The active provider is chosen from environment variables; پیامک‌پنل wins if
// both are configured. With no provider, SMS stays in the local outbox.
// Auth: PAYAMAK_PANEL_API_KEY (the panel's APIKey from ?module=ApiSetting)
// replaces the password per the provider's official docs; a plain
// PAYAMAK_PANEL_PASSWORD is also accepted.
export type SmsProvider = "payamak-panel" | "kavenegar";

export const smsProvider = (): SmsProvider | null => {
  if (process.env.PAYAMAK_PANEL_USERNAME && (process.env.PAYAMAK_PANEL_API_KEY || process.env.PAYAMAK_PANEL_PASSWORD)) return "payamak-panel";
  if (process.env.KAVENEGAR_API_KEY) return "kavenegar";
  return null;
};

export const smsProviderLabel = (): string | null => {
  switch (smsProvider()) {
    case "payamak-panel": return "پیامک‌پنل";
    case "kavenegar": return "کاوه‌نگار";
    default: return null;
  }
};

export const smsConfigured = () => !!smsProvider();
// In local mode (no real delivery configured) the message body is captured in
// the outbox so the flow remains fully testable without external services.
export const localDeliveryMode = () => !emailConfigured();

// --- Config resolution (الحاقیهٔ ۲.۱۰.۵) ---
// The SMS management panel stores its gateway config in the database
// (sms_settings, API key encrypted at rest). A complete, enabled row wins
// over the environment variables; otherwise the env fallback behaves exactly
// like before ۲.۱۰.۵. With neither source, SMS stays in the local outbox.
export type SmsConfig = { provider: SmsProvider; username?: string; secret: string; sender?: string; source: "database" | "environment" };

function envSmsConfig(): SmsConfig | null {
  const provider = smsProvider();
  if (provider === "payamak-panel") return { provider, username: process.env.PAYAMAK_PANEL_USERNAME!, secret: process.env.PAYAMAK_PANEL_API_KEY || process.env.PAYAMAK_PANEL_PASSWORD || "", sender: process.env.PAYAMAK_PANEL_SENDER || "", source: "environment" };
  if (provider === "kavenegar") return { provider, secret: process.env.KAVENEGAR_API_KEY!, sender: process.env.KAVENEGAR_SENDER, source: "environment" };
  return null;
}

export async function resolveSmsSettings(): Promise<SmsConfig | null> {
  try {
    const [row] = await db.select().from(smsSettings).where(eq(smsSettings.id, "default")).limit(1);
    if (row?.enabled && row.provider && row.secretCipher) {
      const secret = await decryptSecret(row.secretCipher, "sms-panel-secret");
      if (secret) {
        if (row.provider === "payamak-panel" && row.username) return { provider: "payamak-panel", username: row.username, secret, sender: row.sender || "", source: "database" };
        if (row.provider === "kavenegar") return { provider: "kavenegar", secret, sender: row.sender || undefined, source: "database" };
      }
    }
  } catch { /* بدون دیتابیس، فقط محیط */ }
  return envSmsConfig();
}

export async function smsReady(): Promise<boolean> {
  return !!(await resolveSmsSettings());
}

/** برچسب و منبع فعال برای نمایش در پنل: پیامک‌پنل/کاوه‌نگار + دیتابیس/محیط. */
export async function currentSmsSource(): Promise<{ label: string; source: "database" | "environment" } | null> {
  const config = await resolveSmsSettings();
  if (!config) return null;
  return { label: config.provider === "payamak-panel" ? "پیامک‌پنل" : "کاوه‌نگار", source: config.source };
}

/** Normalizes Iranian mobile numbers to the 09xxxxxxxxx form the gateways expect. */
export function normalizeIranMobile(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0098") && digits.length === 14) return `0${digits.slice(4)}`;
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

type QueueContext = Pick<typeof db, "insert" | "delete" | "update" | "select">;

async function queueMessage(tx: QueueContext, message: {
  channel: OutboxChannel; recipient: string; subject?: string | null; body: string;
  userId?: string | null; applicationId?: string | null; category?: SmsCategory | null; templateKey?: string | null;
}) {
  // الحاقیهٔ ۲.۱۰.۵ — وضعیت صف با منبع فعال واقعی تصمیم می‌گیرد: تنظیمات پنل
  // پیامکیِ ذخیره‌شده در دیتابیس می‌تواند متغیرهای محیطی را override کند.
  const smsReadyNow = message.channel === "sms" ? await smsReady() : null;
  const status: OutboxStatus = message.channel === "email" ? (emailConfigured() ? "queued" : "local") : (smsReadyNow ? "queued" : "local");
  await tx.insert(messageOutbox).values({
    channel: message.channel,
    recipient: message.recipient,
    userId: message.userId ?? null,
    applicationId: message.applicationId ?? null,
    subject: message.subject ?? null,
    body: message.body,
    status,
    deliveredAt: status === "local" ? new Date() : null,
    category: message.category ?? null,
    templateKey: message.templateKey ?? null,
  });
}

export async function queueEmail(tx: QueueContext, recipient: string, subject: string, body: string, options?: { userId?: string | null; applicationId?: string | null }) {
  if (!recipient || recipient.length > 254) return;
  await queueMessage(tx, { channel: "email", recipient, subject, body, ...options });
}

export async function queueSms(tx: QueueContext, phone: string, text: string, options?: { userId?: string | null; applicationId?: string | null; category?: SmsCategory; templateKey?: string }) {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(normalized)) return;
  await queueMessage(tx, { channel: "sms", recipient: normalized, subject: null, body: text, ...options });
}

/** الحاقیهٔ ۲.۱۰.۵ — ارسال پیامک از روی قالب رجیستری/دیتابیس: متن از
 *  sms_templates (یا پیش‌فرض) خوانده، متغیرها جایگزین و کلید/دستهٔ قالب برای
 *  فیلترهای تاریخچهٔ پنل مدیریت پیامک روی ردیف ثبت می‌شود. */
export async function queueTemplateSms(tx: QueueContext, phone: string, key: string, vars: Record<string, string | number | undefined | null>, options?: { userId?: string | null; applicationId?: string | null }) {
  const template = await resolveSmsTemplate(key, vars);
  if (!template) return;
  await queueSms(tx, phone, template.body, { ...options, category: template.category, templateKey: template.key });
}

/** Creates in-app notifications and queues the matching e-mail in the same
 *  transaction. With `options.sms` a matching SMS is queued for every active
 *  recipient that has a mobile number on file — used for urgent workflow
 *  events (e.g. case submission) where e-mail alone is too slow. Since ۲.۱۰.۵
 *  every queued SMS row carries its template key and category so the SMS
 *  management panel can filter the history by usage. */
export async function notifyUsers(tx: QueueContext, userIds: (string | null | undefined)[], title: string, body: string, applicationId: string, options?: { sms?: string; smsCategory?: SmsCategory; smsTemplateKey?: string }) {
  const rows = notificationRows(userIds, title, body, applicationId);
  if (rows.length) await tx.insert(notifications).values(rows);
  const ids = rows.map((row) => row.userId);
  if (!ids.length) return;
  const recipients = await tx.select({ id: users.id, email: users.email, active: users.active, phone: users.phone }).from(users).where(inArray(users.id, ids));
  for (const recipient of recipients) {
    if (!recipient.active) continue;
    if (options?.sms && recipient.phone) await queueSms(tx, recipient.phone, options.sms, { userId: recipient.id, applicationId, category: options.smsCategory, templateKey: options.smsTemplateKey });
    if (!recipient.email) continue;
    await queueEmail(tx, recipient.email, title, `${title}\n\n${body}`, { userId: recipient.id, applicationId });
  }
}

// --- Message templates (pure, unit-testable) ---

export function passwordResetEmail(link: string) {
  return {
    subject: "بازیابی گذرواژه — سامانه جامع فعالان قرآنی",
    body: `درخواست بازیابی گذرواژه برای حساب شما ثبت شده است.\n\nبرای انتخاب گذرواژه جدید روی پیوند زیر کلیک کنید (اعتبار: ۳۰ دقیقه):\n${link}\n\nاگر این درخواست را شما ثبت نکرده‌اید، این پیام را نادیده بگیرید؛ گذرواژه فعلی تغییر نمی‌کند.`,
  };
}

export function emailVerificationEmail(link: string) {
  return {
    subject: "تأیید ایمیل حساب — سامانه جامع فعالان قرآنی",
    body: `برای تأیید نشانی ایمیل حساب خود روی پیوند زیر کلیک کنید (اعتبار: ۲۴ ساعت):\n${link}\n\nاگر این حساب را شما نساخته‌اید، این پیام را نادیده بگیرید.`,
  };
}

/** Registration OTP body — the code stays Latin digits so it is readable on every handset. */
export function mobileVerificationSms(code: string) {
  return {
    body: `کد تأیید ثبت‌نام شما در سامانه جامع فعالان قرآنی: ${code}\nاعتبار این کد ۱۰ دقیقه است؛ آن را در اختیار هیچ‌کس قرار ندهید.`,
  };
}

/** Password-reset OTP body (مرحله دوم) — same readability rules as the registration code. */
export function passwordResetSms(code: string) {
  return {
    body: `کد بازیابی گذرواژه شما در سامانه جامع فعالان قرآنی: ${code}\nاعتبار این کد ۱۰ دقیقه است؛ آن را در اختیار هیچ‌کس قرار ندهید.`,
  };
}

/** مرحله هفتم: submission alert for the review staff of the case's province
 *  and county. Pure template so the feature suite can assert the exact body. */
export function caseSubmittedSms(activistName: string) {
  return `سامانه نور: پرونده ${activistName} برای بررسی ارسال شد. لطفاً کارتابل پرونده‌ها را در سامانه کنترل فرمایید.`;
}

export function emailChangeEmail(link: string, newEmail: string) {
  return {
    subject: "تأیید تغییر ایمیل — سامانه جامع فعالان قرآنی",
    body: `درخواست تغییر ایمیل حساب به «${newEmail}» ثبت شده است.\nبرای تأیید و اعمال تغییر روی پیوند زیر کلیک کنید (اعتبار: ۲۴ ساعت):\n${link}\n\nتا پیش از تأیید، ایمیل فعلی معتبر می‌ماند.`,
  };
}

export function passwordChangedEmail() {
  return {
    subject: "گذرواژه تغییر کرد — سامانه جامع فعالان قرآنی",
    body: "گذرواژه حساب شما با موفقیت بازنشانی شد و همه نشست‌های فعال باطل شدند.\nاگر این تغییر را شما انجام نداده‌اید، فوراً با مدیر سامانه تماس بگیرید.",
  };
}

// --- Delivery adapters (best-effort, called after the transaction commits) ---

async function deliverEmail(row: typeof messageOutbox.$inferSelect) {
  const transport = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: row.recipient, subject: row.subject || "", text: row.body });
}

type PayamakResponse = { Value?: string | number; RetStatus?: number; StrRetStatus?: string };

/** پیامک‌پنل REST gateway (rest.payamak-panel.com) — RetStatus 1 means accepted.
 *  Without an explicit config the environment variables are used (same contract
 *  as before ۲.۱۰.۵, unit tests pin this); the delivery path passes the
 *  resolved config so the panel settings win when enabled. */
export async function sendSmsViaPayamakPanel(to: string, text: string, config?: SmsConfig): Promise<void> {
  const cfg = config ?? envSmsConfig();
  if (!cfg || cfg.provider !== "payamak-panel") throw new Error("پیامک‌پنل تنظیم نشده است");
  const response = await fetch("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: cfg.username!,
      password: cfg.secret,
      to: normalizeIranMobile(to),
      from: cfg.sender || "",
      text,
      isFlash: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`PayamakPanel responded ${response.status}`);
  const data = await response.json().catch(() => null) as PayamakResponse | null;
  if (!data) throw new Error("PayamakPanel returned an unreadable response");
  if (data.RetStatus !== 1) throw new Error(`PayamakPanel RetStatus=${data.RetStatus ?? "?"} (${data.StrRetStatus ?? "نامشخص"}) Value=${String(data.Value ?? "")}`);
}

async function deliverSms(row: typeof messageOutbox.$inferSelect) {
  const config = await resolveSmsSettings();
  if (!config) throw new Error("پنل پیامکی تنظیم نشده است؛ پیام در حالت محلی ذخیره می‌شود");
  if (config.provider === "payamak-panel") return sendSmsViaPayamakPanel(row.recipient, row.body, config);
  const url = new URL(`https://api.kavenegar.com/v1/${config.secret}/sms/send.json`);
  url.searchParams.set("receptor", row.recipient);
  url.searchParams.set("message", row.body);
  if (config.sender) url.searchParams.set("sender", config.sender);
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Kavenegar responded ${response.status}`);
}

let delivering = false;
/** Attempts delivery of queued messages; failures are recorded, never thrown. */
export async function deliverOutbox() {
  if (delivering) return;
  delivering = true;
  try {
    const queued = await db.select().from(messageOutbox).where(eq(messageOutbox.status, "queued")).limit(25);
    for (const row of queued) {
      try {
        if (row.channel === "email") await deliverEmail(row);
        else await deliverSms(row);
        await db.update(messageOutbox).set({ status: "sent", deliveredAt: new Date(), error: null }).where(eq(messageOutbox.id, row.id));
      } catch (error) {
        await db.update(messageOutbox).set({ status: "failed", error: String((error as Error)?.message || error).slice(0, 500) }).where(eq(messageOutbox.id, row.id));
      }
    }
  } catch { /* housekeeping must never break a request */ } finally { delivering = false; }
}
