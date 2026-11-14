"use server";

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, mobileResetCodes, passwordResetTokens, sessions, users } from "@/db/schema";
import { audit, clearFailures, hashPassword, isThrottled, recordFailure, throttleKey } from "@/lib/auth";
import { digest } from "@/lib/local-secrets";
import { deliverOutbox, localDeliveryMode, normalizeIranMobile, passwordChangedEmail, passwordResetEmail, passwordResetSms, queueEmail, queueSms, smsProvider } from "@/lib/messaging";
import { originUrl } from "@/lib/request-url";
import { PASSWORD_RESET_TTL_MS, PASSWORD_POLICY_ERROR, validEmailFormat, validIranMobile, validPasswordFormat, validResetTokenFormat } from "@/lib/validation";
import { generateMobileCode } from "@/lib/mobile-verification";
import type { ActionState } from "@/lib/action-state";

// Legacy e-mail reset (kept for outstanding token links): request + token page.
export async function requestPasswordResetAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") || "").trim().toLowerCase();
  if (!validEmailFormat(email)) return { error: "ایمیل معتبر را وارد کنید." };
  const key = await throttleKey(`pwreset:${email}`);
  if (await isThrottled(key)) return { error: "تعداد درخواست‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const [user] = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.email, email)).limit(1);
  let devLink: string | undefined;
  if (user?.active) {
    await recordFailure(key); // per-identity request limiting: 5 requests per 15 minutes
    if (!(await isThrottled(key))) {
      const token = randomBytes(32).toString("hex");
      await db.transaction(async (tx) => {
        await tx.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
        await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
        const template = passwordResetEmail(`${await originUrl()}/reset-password/${token}`);
        await queueEmail(tx, email, template.subject, template.body, { userId: user.id });
      });
      await audit(null, "password_reset_requested", "user", user.id);
      void deliverOutbox();
      // Local-only convenience: without SMTP the link is shown here instead of e-mail.
      if (localDeliveryMode()) devLink = `/reset-password/${token}`;
    }
  }
  return { success: "اگر این ایمیل در سامانه ثبت شده باشد، پیوند بازیابی برایتان ارسال می‌شود. پوشه هرزنامه را هم بررسی کنید.", devLink };
}

export async function resetPasswordAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const token = String(data.get("token") || "").trim();
  const password = String(data.get("password") || "");
  const confirmation = String(data.get("confirmation") || "");
  if (!validResetTokenFormat(token)) return { error: "پیوند بازیابی معتبر نیست." };
  if (!validPasswordFormat(password)) return { error: PASSWORD_POLICY_ERROR };
  if (password !== confirmation) return { error: "تکرار گذرواژه با گذرواژه یکسان نیست." };
  const key = await throttleKey(`pwapply:${token.slice(0, 12)}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const [row] = await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, digest(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
  if (!row) { await recordFailure(key); return { error: "پیوند بازیابی نامعتبر یا منقضی شده است؛ درخواست جدید ثبت کنید." }; }
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt))).returning({ id: passwordResetTokens.id });
    if (!updated.length) throw new Error("token already used");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    await tx.insert(auditLogs).values({ actorId: row.userId, action: "reset_password", targetType: "user", targetId: row.userId });
  });
  await clearFailures(key);
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (user?.email) await db.transaction(async (tx) => { const template = passwordChangedEmail(); await queueEmail(tx, user.email!, template.subject, template.body, { userId: row.userId }); });
  void deliverOutbox();
  redirect("/login?reset=1");
}

// --- Mobile (SMS OTP) reset — the primary recovery path (مرحله دوم) ---

const MOBILE_RESET_TTL_MS = 10 * 60 * 1000;
const MOBILE_RESET_MAX_ATTEMPTS = 5;
const MOBILE_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

export async function requestMobileResetAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const mobile = normalizeIranMobile(String(data.get("mobile") || ""));
  if (!validIranMobile(mobile)) return { error: "شماره موبایل معتبر وارد کنید؛ مانند ۰۹۱۲۳۴۵۶۷۸۹." };
  const key = await throttleKey(`pwresetm:${mobile}`);
  if (await isThrottled(key)) return { error: "تعداد درخواست‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const [user] = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.phone, mobile)).limit(1);
  let devCode: string | undefined;
  if (user?.active) {
    await recordFailure(key); // per-identity request limiting: 5 requests per 15 minutes
    if (!(await isThrottled(key))) {
      // Resend cooldown: one pending code per user per minute, like registration.
      const [recent] = await db.select({ id: mobileResetCodes.id }).from(mobileResetCodes)
        .where(and(eq(mobileResetCodes.userId, user.id), isNull(mobileResetCodes.usedAt), gt(mobileResetCodes.createdAt, new Date(Date.now() - MOBILE_RESET_RESEND_COOLDOWN_MS)))).limit(1);
      if (!recent) {
        const code = generateMobileCode();
        await db.transaction(async (tx) => {
          await tx.delete(mobileResetCodes).where(and(eq(mobileResetCodes.userId, user.id), isNull(mobileResetCodes.usedAt)));
          await tx.insert(mobileResetCodes).values({ userId: user.id, mobile, codeHash: digest(code), expiresAt: new Date(Date.now() + MOBILE_RESET_TTL_MS) });
          const template = passwordResetSms(code);
          await queueSms(tx, mobile, template.body, { userId: user.id });
        });
        await audit(null, "password_reset_requested", "user", user.id, "mobile");
        void deliverOutbox();
        // Local-only convenience: without an SMS gateway the code is shown here.
        if (!smsProvider()) devCode = code;
      }
    }
  }
  return { success: "اگر این شماره در سامانه ثبت شده باشد، کد بازیابی برایتان پیامک می‌شود.", mobile, devCode };
}

export async function resetWithMobileAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const mobile = normalizeIranMobile(String(data.get("mobile") || ""));
  const code = String(data.get("code") || "").trim();
  const password = String(data.get("password") || "");
  const confirmation = String(data.get("confirmation") || "");
  if (!validIranMobile(mobile)) return { error: "شماره موبایل معتبر نیست؛ از نو شروع کنید." };
  if (!/^\d{6}$/.test(code)) return { error: "کد شش‌رقمی پیامک‌شده را وارد کنید.", mobile };
  if (!validPasswordFormat(password)) return { error: PASSWORD_POLICY_ERROR, mobile };
  if (password !== confirmation) return { error: "تکرار گذرواژه با گذرواژه یکسان نیست.", mobile };
  const key = await throttleKey(`pwapplym:${mobile}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید.", mobile };
  const [user] = await db.select({ id: users.id, active: users.active, email: users.email }).from(users).where(eq(users.phone, mobile)).limit(1);
  if (!user?.active) { await recordFailure(key); return { error: "کد یا شماره موبایل نامعتبر است.", mobile }; }
  const [row] = await db.select().from(mobileResetCodes)
    .where(and(eq(mobileResetCodes.userId, user.id), isNull(mobileResetCodes.usedAt))).limit(1);
  if (!row || row.expiresAt <= new Date()) return { error: "کد بازیابی منقضی شده است؛ کد جدید درخواست کنید.", mobile };
  if (row.attempts >= MOBILE_RESET_MAX_ATTEMPTS) return { error: "کد به‌دلیل تلاش‌های زیاد باطل شده است؛ کد جدید درخواست کنید.", mobile };
  if (row.codeHash !== digest(code)) {
    await db.update(mobileResetCodes).set({ attempts: row.attempts + 1 }).where(eq(mobileResetCodes.id, row.id));
    await recordFailure(key);
    const remaining = MOBILE_RESET_MAX_ATTEMPTS - row.attempts - 1;
    return { error: remaining > 0 ? `کد نادرست است؛ ${remaining} تلاش باقی مانده.` : "کد به‌دلیل تلاش‌های زیاد باطل شد؛ کد جدید درخواست کنید.", mobile };
  }
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx.update(mobileResetCodes).set({ usedAt: new Date() })
      .where(and(eq(mobileResetCodes.id, row.id), isNull(mobileResetCodes.usedAt))).returning({ id: mobileResetCodes.id });
    if (!updated.length) throw new Error("code already used");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "reset_password", targetType: "user", targetId: user.id, detail: "mobile" });
  });
  await clearFailures(key);
  if (user.email) await db.transaction(async (tx) => { const template = passwordChangedEmail(); await queueEmail(tx, user.email!, template.subject, template.body, { userId: user.id }); }).catch(() => undefined);
  void deliverOutbox();
  redirect("/login?reset=1");
}
