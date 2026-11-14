import { createTransport } from "nodemailer";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messageOutbox, notifications, users } from "@/db/schema";
import { notificationRows } from "@/lib/workflow-utils";

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
  userId?: string | null; applicationId?: string | null;
}) {
  const status: OutboxStatus = message.channel === "email" ? (emailConfigured() ? "queued" : "local") : (smsConfigured() ? "queued" : "local");
  await tx.insert(messageOutbox).values({
    channel: message.channel,
    recipient: message.recipient,
    userId: message.userId ?? null,
    applicationId: message.applicationId ?? null,
    subject: message.subject ?? null,
    body: message.body,
    status,
    deliveredAt: status === "local" ? new Date() : null,
  });
}

export async function queueEmail(tx: QueueContext, recipient: string, subject: string, body: string, options?: { userId?: string | null; applicationId?: string | null }) {
  if (!recipient || recipient.length > 254) return;
  await queueMessage(tx, { channel: "email", recipient, subject, body, ...options });
}

export async function queueSms(tx: QueueContext, phone: string, text: string, options?: { userId?: string | null; applicationId?: string | null }) {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(normalized)) return;
  await queueMessage(tx, { channel: "sms", recipient: normalized, subject: null, body: text, ...options });
}

/** Creates in-app notifications and queues the matching e-mail in the same
 *  transaction. With `options.sms` a matching SMS is queued for every active
 *  recipient that has a mobile number on file — used for urgent workflow
 *  events (e.g. case submission) where e-mail alone is too slow. */
export async function notifyUsers(tx: QueueContext, userIds: (string | null | undefined)[], title: string, body: string, applicationId: string, options?: { sms?: string }) {
  const rows = notificationRows(userIds, title, body, applicationId);
  if (rows.length) await tx.insert(notifications).values(rows);
  const ids = rows.map((row) => row.userId);
  if (!ids.length) return;
  const recipients = await tx.select({ id: users.id, email: users.email, active: users.active, phone: users.phone }).from(users).where(inArray(users.id, ids));
  for (const recipient of recipients) {
    if (!recipient.active) continue;
    if (options?.sms && recipient.phone) await queueSms(tx, recipient.phone, options.sms, { userId: recipient.id, applicationId });
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

/** پیامک‌پنل REST gateway (rest.payamak-panel.com) — RetStatus 1 means accepted. */
export async function sendSmsViaPayamakPanel(to: string, text: string): Promise<void> {
  const response = await fetch("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.PAYAMAK_PANEL_USERNAME!,
      password: process.env.PAYAMAK_PANEL_API_KEY || process.env.PAYAMAK_PANEL_PASSWORD!,
      to: normalizeIranMobile(to),
      from: process.env.PAYAMAK_PANEL_SENDER || "",
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
  if (smsProvider() === "payamak-panel") return sendSmsViaPayamakPanel(row.recipient, row.body);
  const key = process.env.KAVENEGAR_API_KEY!;
  const url = new URL(`https://api.kavenegar.com/v1/${key}/sms/send.json`);
  url.searchParams.set("receptor", row.recipient);
  url.searchParams.set("message", row.body);
  if (process.env.KAVENEGAR_SENDER) url.searchParams.set("sender", process.env.KAVENEGAR_SENDER);
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
