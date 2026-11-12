"use server";

import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { audit, clearFailures, createSession, endSession, getCurrentUser, hashPassword, isThrottled, recordFailure, throttleKey, verifyPassword } from "@/lib/auth";
import { bootstrapCode, digest } from "@/lib/local-secrets";
import { issueEmailVerificationToken } from "@/lib/email-tokens";
import { issueMobileVerification, issuePendingVerificationToken, pendingMobileCodeRecentlyIssued } from "@/lib/mobile-verification";
import { normalizeIranMobile, deliverOutbox, emailVerificationEmail, mobileVerificationSms, queueEmail, queueSms, smsProvider } from "@/lib/messaging";
import { validIranMobile, validEmailFormat, validPasswordFormat, PASSWORD_POLICY_ERROR } from "@/lib/validation";
import { originUrl } from "@/lib/request-url";
import { normalizeText } from "@/lib/format";
import { clearPendingMfaToken, consumeRecoveryCode, createPendingMfaToken, getDecryptedMfaSecret, resolvePendingMfaToken, verifyTotp } from "@/lib/mfa";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string) => String(data.get(key) || "").trim();

/** Normalized split-name pair for accounts (مرحله دوم): full_name stays the
 *  derived display value so every existing screen keeps working. */
function accountNames(data: FormData): { firstName: string; lastName: string; fullName: string } | { error: string } {
  const firstName = normalizeText(field(data, "firstName"));
  const lastName = normalizeText(field(data, "lastName"));
  if (firstName.length < 2 || firstName.length > 80) return { error: "نام (حداقل ۲ نویسه) را وارد کنید." };
  if (lastName.length < 2 || lastName.length > 100) return { error: "نام خانوادگی (حداقل ۲ نویسه) را وارد کنید." };
  return { firstName, lastName, fullName: normalizeText(`${firstName} ${lastName}`) };
}

export async function loginAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const identifier = field(data, "identifier");
  const password = String(data.get("password") || "");
  const mobile = normalizeIranMobile(identifier);
  const email = identifier.toLowerCase();
  const byMobile = validIranMobile(mobile);
  if (!identifier || identifier.length > 254 || !password || password.length > 128 || (!byMobile && !validEmailFormat(email)))
    return { error: "شماره موبایل یا ایمیل و گذرواژه را به‌درستی وارد کنید." };
  const key = await throttleKey(`login:${byMobile ? mobile : email}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const [user] = byMobile
    ? await db.select().from(users).where(eq(users.phone, mobile)).limit(1)
    : await db.select().from(users).where(eq(users.email, email)).limit(1);
  const invalidMessage = "شماره موبایل یا ایمیل، یا گذرواژه نادرست است یا حساب غیرفعال شده است.";
  const valid = await verifyPassword(password, user?.passwordHash || null);
  if (!valid || !user) {
    await recordFailure(key); await audit(null, "login_failed", "session");
    return { error: invalidMessage };
  }
  if (!user.active) {
    // Pending registration: correct credentials for an account that is still
    // waiting for its mobile OTP — hand the user a fresh verify session
    // instead of a dead end. The code itself is only re-sent after cooldown.
    if (!user.mobileVerifiedAt && user.phone && smsProvider()) {
      const token = await db.transaction(async (tx) => {
        if (!(await pendingMobileCodeRecentlyIssued(user.id))) {
          const code = await issueMobileVerification(tx, user.id, user.phone!);
          await queueSms(tx, user.phone!, mobileVerificationSms(code).body, { userId: user.id });
        }
        return issuePendingVerificationToken(tx, user.id);
      });
      void deliverOutbox(); await audit(user.id, "login_pending_verification", "session");
      redirect(`/register/verify/${token}`);
    }
    await recordFailure(key); await audit(user.id, "login_failed", "session");
    return { error: invalidMessage };
  }
  await clearFailures(key);
  if (user.mfaEnabled) {
    const mfaToken = await createPendingMfaToken(user.id);
    await audit(user.id, "mfa_challenge", "session");
    return { mfaToken };
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id); await audit(user.id, "login", "session");
  redirect("/dashboard");
}

export async function verifyMfaLoginAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const mfaToken = field(data, "mfaToken"); const code = field(data, "code");
  if (!mfaToken || !code) return { error: "کد تأیید را وارد کنید.", mfaToken };
  const userId = await resolvePendingMfaToken(mfaToken);
  if (!userId) return { error: "نشست تأیید دومرحله‌ای منقضی شده است؛ دوباره وارد شوید." };
  const key = await throttleKey(`mfa:${userId}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.active || !user.mfaEnabled) return { error: "حساب کاربری معتبر نیست." };
  const secret = await getDecryptedMfaSecret(user);
  const normalizedCode = code.replace(/[^\d-]/g, "");
  const valid = (secret && /^\d{6}$/.test(normalizedCode) && await verifyTotp(secret, normalizedCode)) || (/^\d{6}-\d{6}$/.test(normalizedCode) && await consumeRecoveryCode(user.id, normalizedCode));
  if (!valid) { await recordFailure(key); await audit(user.id, "mfa_failed", "session"); return { error: "کد تأیید نادرست است.", mfaToken }; }
  await clearFailures(key); await clearPendingMfaToken(mfaToken);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id); await audit(user.id, "login", "session", undefined, "mfa");
  redirect("/dashboard");
}

export async function registerAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const names = accountNames(data);
  if ("error" in names) return { error: names.error };
  const email = field(data, "email").toLowerCase();
  const password = String(data.get("password") || ""); const confirmation = String(data.get("confirmation") || "");
  const mobile = normalizeIranMobile(field(data, "mobile"));
  if (email && !validEmailFormat(email)) return { error: "ایمیل اختیاری است؛ اما اگر وارد می‌کنید باید معتبر باشد." };
  if (!validPasswordFormat(password)) return { error: PASSWORD_POLICY_ERROR };
  if (!validIranMobile(mobile)) return { error: "شماره موبایل معتبر وارد کنید؛ مانند ۰۹۱۲۳۴۵۶۷۸۹." };
  if (password !== confirmation) return { error: "تکرار گذرواژه با گذرواژه یکسان نیست." };
  const key = await throttleKey(`register:${email || mobile}`);
  const mobileKey = await throttleKey(`register-mobile:${mobile}`);
  if ((await isThrottled(key)) || (await isThrottled(mobileKey))) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید." };
  // With a real SMS gateway configured, the account stays inactive until the
  // OTP sent to the mobile is confirmed; without one (local/demo mode) the
  // previous activate-immediately behaviour is preserved.
  const otpRequired = !!smsProvider();
  let userId: string;
  try {
    const [created] = await db.insert(users).values({ fullName: names.fullName, firstName: names.firstName, lastName: names.lastName, email: email || null, passwordHash: await hashPassword(password), role: "activist", phone: mobile, active: !otpRequired }).returning({ id: users.id });
    userId = created.id;
  } catch { await recordFailure(key); return { error: "ثبت‌نام ممکن نشد. ممکن است این شماره موبایل یا ایمیل قبلاً ثبت شده باشد." }; }
  await clearFailures(key); await clearFailures(mobileKey);
  await audit(userId, "register", "user", userId);
  // Best-effort e-mail verification — only when an e-mail was provided and it
  // never blocks the registration itself.
  const queueEmailVerification = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
    issueEmailVerificationToken(tx, userId, null)
      .then(async (token) => emailVerificationEmail(`${await originUrl()}/verify-email/${token}`))
      .then((template) => queueEmail(tx, email, template.subject, template.body, { userId }))
      .catch(() => undefined);
  if (otpRequired) {
    const pendingToken = await db.transaction(async (tx) => {
      const code = await issueMobileVerification(tx, userId, mobile);
      await queueSms(tx, mobile, mobileVerificationSms(code).body, { userId });
      if (email) await queueEmailVerification(tx);
      return issuePendingVerificationToken(tx, userId);
    });
    void deliverOutbox();
    redirect(`/register/verify/${pendingToken}`);
  }
  await createSession(userId);
  if (email) { try { await db.transaction(queueEmailVerification); } catch { /* verification must not block registration */ } }
  redirect("/dashboard?welcome=1");
}

export async function setupAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const names = accountNames(data);
  if ("error" in names) return { error: names.error };
  const email = field(data, "email").toLowerCase();
  const mobile = normalizeIranMobile(field(data, "mobile"));
  const password = String(data.get("password") || ""); const code = field(data, "code");
  if (email && !validEmailFormat(email)) return { error: "ایمیل اختیاری است؛ اما اگر وارد می‌کنید باید معتبر باشد." };
  if (!validIranMobile(mobile)) return { error: "شماره موبایل معتبر مدیر سامانه را وارد کنید؛ ورود بعدی با همین شماره انجام می‌شود." };
  if (!validPasswordFormat(password)) return { error: PASSWORD_POLICY_ERROR };
  if (password !== String(data.get("confirmation") || "")) return { error: "تکرار گذرواژه یکسان نیست." };
  const key = await throttleKey("setup");
  if (await isThrottled(key)) return { error: "تلاش‌های بیش از حد؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };
  const expected = await bootstrapCode();
  if (!timingSafeEqual(Buffer.from(digest(code)), Buffer.from(digest(expected)))) { await recordFailure(key); return { error: "کد راه‌اندازی معتبر نیست." }; }
  const passwordHash = await hashPassword(password);
  let userId: string | null = null;
  try {
    userId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(8051731)`);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
      if (existing) return null;
      const [created] = await tx.insert(users).values({ fullName: names.fullName, firstName: names.firstName, lastName: names.lastName, email: email || null, phone: mobile, passwordHash, role: "super_admin" }).returning({ id: users.id });
      await tx.insert(auditLogs).values({ actorId: created.id, action: "bootstrap_admin", targetType: "user", targetId: created.id });
      return created.id;
    });
  } catch { return { error: "ساخت مدیر اولیه ممکن نشد؛ شماره موبایل یا ایمیل تکراری است." }; }
  if (!userId) return { error: "مدیر اولیه قبلاً ایجاد شده است." };
  await clearFailures(key); await createSession(userId); redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await audit(user.id, "logout", "session");
  await endSession(); redirect("/login");
}
