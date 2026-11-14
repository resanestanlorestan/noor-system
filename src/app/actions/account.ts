"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { audit, clearFailures, createSession, hashPassword, isThrottled, recordFailure, requireUser, throttleKey, verifyPassword } from "@/lib/auth";
import { normalizeText } from "@/lib/format";
import { issueEmailVerificationToken, pendingVerificationRecentlyIssued } from "@/lib/email-tokens";
import { deliverOutbox, emailChangeEmail, localDeliveryMode, passwordChangedEmail, queueEmail } from "@/lib/messaging";
import { originUrl } from "@/lib/request-url";
import { validEmailFormat, validPasswordFormat, PASSWORD_POLICY_ERROR } from "@/lib/validation";
import { createPendingSecret, disableMfa, enableMfa, verifyTotp } from "@/lib/mfa";
import type { ActionState } from "@/lib/action-state";

export async function changePasswordAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user=await requireUser(); const current=String(data.get("currentPassword") || ""); const next=String(data.get("newPassword") || ""); const confirmation=String(data.get("confirmation") || "");
  if (!current || current.length>128 || !validPasswordFormat(next) || next!==confirmation || current===next) return {error:PASSWORD_POLICY_ERROR};
  const key=await throttleKey(`password:${user.id}`); if(await isThrottled(key)) return {error:"تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید."};
  if(!await verifyPassword(current,user.passwordHash)) {await recordFailure(key); return {error:"گذرواژه فعلی نادرست است."};}
  const passwordHash=await hashPassword(next);
  await db.transaction(async tx=>{await tx.update(users).set({passwordHash}).where(eq(users.id,user.id));await tx.delete(sessions).where(eq(sessions.userId,user.id));await tx.insert(auditLogs).values({actorId:user.id,action:"change_password",targetType:"user",targetId:user.id});if (user.email) {const notice=passwordChangedEmail();await queueEmail(tx,user.email,notice.subject,notice.body,{userId:user.id});}});
  await clearFailures(key); await createSession(user.id); void deliverOutbox(); return {success:"گذرواژه تغییر کرد و نشست‌های قبلی باطل شدند."};
}

export async function changeEmailAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const newEmail = normalizeText(String(data.get("newEmail") || "")).toLowerCase();
  const password = String(data.get("currentPassword") || "");
  if (!validEmailFormat(newEmail)) return { error: "ایمیل جدید معتبر نیست." };
  if (!password || password.length > 128) return { error: "برای تغییر ایمیل، گذرواژه فعلی را وارد کنید." };
  if (newEmail === user.email) return { error: "ایمیل جدید با ایمیل فعلی یکسان است." };
  const key = await throttleKey(`email:${user.id}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  if (!(await verifyPassword(password, user.passwordHash))) { await recordFailure(key); return { error: "گذرواژه فعلی نادرست است." }; }
  if (await pendingVerificationRecentlyIssued(user.id, 5)) return { error: "درخواست تغییر ایمیل قبلی هنوز معتبر است؛ چند دقیقه صبر کنید." };
  try {
    const token = await db.transaction(async (tx) => {
      const created = await issueEmailVerificationToken(tx, user.id, newEmail);
      await tx.insert(auditLogs).values({ actorId: user.id, action: "change_email_requested", targetType: "user", targetId: user.id, detail: newEmail });
      const template = emailChangeEmail(`${await originUrl()}/verify-email/${created}`, newEmail);
      await queueEmail(tx, newEmail, template.subject, template.body, { userId: user.id });
      return created;
    });
    await clearFailures(key);
    void deliverOutbox();
    return { success: "درخواست ثبت شد. برای تکمیل تغییر، پیوند تأیید ارسال‌شده به ایمیل جدید را تا ۲۴ ساعت باز کنید؛ تا آن زمان ایمیل فعلی معتبر می‌ماند.", devLink: localDeliveryMode() ? `/verify-email/${token}` : undefined };
  } catch {
    await recordFailure(key);
    return { error: "ثبت درخواست ممکن نشد؛ این ایمیل ممکن است قبلاً برای حساب دیگری ثبت شده باشد." };
  }
}

export async function startMfaSetupAction(): Promise<ActionState> {
  const user = await requireUser();
  if (user.mfaEnabled) return { error: "احراز هویت دومرحله‌ای از قبل فعال است." };
  const { secret, qrDataUrl } = await createPendingSecret(user.email ?? user.phone ?? user.id);
  return { secret, qrDataUrl };
}

export async function confirmMfaSetupAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.mfaEnabled) return { error: "احراز هویت دومرحله‌ای از قبل فعال است." };
  const secret = String(data.get("secret") || "").trim();
  const code = String(data.get("code") || "").trim();
  if (!/^[A-Z2-7]{16,}$/.test(secret)) return { error: "کد راه‌اندازی نامعتبر است؛ دوباره تلاش کنید." };
  const key = await throttleKey(`mfa-setup:${user.id}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  if (!(await verifyTotp(secret, code))) { await recordFailure(key); return { error: "کد شش‌رقمی نادرست است؛ دوباره تلاش کنید.", secret }; }
  await clearFailures(key);
  const recoveryCodes = await enableMfa(user.id, secret);
  await audit(user.id, "enable_mfa", "user", user.id);
  return { success: "احراز هویت دومرحله‌ای فعال شد. کدهای بازیابی را در جای امن نگه دارید.", recoveryCodes };
}

export async function disableMfaAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!user.mfaEnabled) return { error: "احراز هویت دومرحله‌ای فعال نیست." };
  const password = String(data.get("currentPassword") || "");
  if (!(await verifyPassword(password, user.passwordHash))) return { error: "گذرواژه فعلی نادرست است." };
  await disableMfa(user.id);
  await audit(user.id, "disable_mfa", "user", user.id);
  return { success: "احراز هویت دومرحله‌ای غیرفعال شد." };
}
