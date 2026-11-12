"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit, clearFailures, createSession, isThrottled, recordFailure, throttleKey } from "@/lib/auth";
import { consumeMobileCode, resolvePendingVerificationToken } from "@/lib/mobile-verification";
import { deliverOutbox, mobileVerificationSms, queueSms, smsProvider } from "@/lib/messaging";
import { issueMobileVerification, pendingMobileCodeRecentlyIssued } from "@/lib/mobile-verification";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string) => String(data.get(key) || "").trim();

/** Confirms the 6-digit SMS code and activates the pending account. */
export async function verifyRegistrationMobileAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const token = field(data, "token"); const code = field(data, "code").replace(/[^\d]/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "کد ۶ رقمی پیامک‌شده را وارد کنید.", token };
  const userId = await resolvePendingVerificationToken(token);
  if (!userId) return { error: "نشست تأیید منقضی یا نامعتبر است؛ وارد سامانه شوید تا نشست تازه بسازد." };
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "حساب کاربری یافت نشد." };
  if (user.active) redirect("/login");
  const key = await throttleKey(`mobile-verify:${userId}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید.", token };
  const result = await consumeMobileCode(db, userId, code);
  if (result.check !== "ok") {
    if (result.check === "invalid") await recordFailure(key);
    const message = result.check === "invalid"
      ? result.remainingAttempts > 0
        ? `کد تأیید نادرست است؛ ${result.remainingAttempts.toLocaleString("fa-IR")} تلاش باقی مانده.`
        : "این کد به‌دلیل تلاش‌های ناموفق غیرفعال شد؛ کد جدید درخواست کنید."
      : result.check === "locked"
        ? "این کد به‌دلیل تلاش‌های ناموفق غیرفعال شد؛ کد جدید درخواست کنید."
        : "کد تأیید منقضی شده است؛ کد جدید درخواست کنید.";
    return { error: message, token };
  }
  await clearFailures(key);
  await db.update(users).set({ active: true, mobileVerifiedAt: new Date() }).where(eq(users.id, userId));
  await audit(userId, "mobile_verified", "user", userId);
  await createSession(userId);
  redirect("/dashboard?welcome=1");
}

/** Re-sends the OTP; respects the cooldown and re-arms an exhausted code. */
export async function resendRegistrationMobileAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const token = field(data, "token");
  const userId = await resolvePendingVerificationToken(token);
  if (!userId) return { error: "نشست تأیید منقضی شده است؛ برای ساخت نشست تازه وارد سامانه شوید.", warning: true };
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.active || !user.phone || !smsProvider()) return { error: "ارسال دوباره کد ممکن نیست.", warning: true };
  if (await pendingMobileCodeRecentlyIssued(user.id)) {
    return { token, success: "کد پیش‌تر ارسال شده است؛ چند لحظه صبر کنید و صندوق پیامک را بررسی کنید." };
  }
  await db.transaction(async (tx) => {
    const code = await issueMobileVerification(tx, user.id, user.phone!);
    await queueSms(tx, user.phone!, mobileVerificationSms(code).body, { userId: user.id });
  });
  void deliverOutbox();
  await audit(userId, "mobile_code_resent", "user", userId);
  return { token, success: "کد تأیید جدید پیامک شد." };
}
