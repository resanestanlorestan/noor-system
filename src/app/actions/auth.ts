"use server";

import { createHash, randomInt, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  auditLogs, counties, mobileResetCodes,
  mobileVerificationCodes, provinces, users,
} from "@/db/schema";
import {
  clearLoginFailures, createSession, destroySession, hashPassword, hashToken,
  isBlocked, passwordIssues, recordLoginFailure, requireUser, verifyPassword,
} from "@/lib/auth";
import { normalizeDigits, normalizeText } from "@/lib/format";
import { sendSms } from "@/lib/sms";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);

// Local development SMS echo: when NOOR_SMS_LOCAL=1 we also surface the code in
// the response so the flow is testable without a real gateway.
function smsEchoEnabled(): boolean {
  return process.env.NOOR_SMS_LOCAL !== "0";
}

/* --------------------------------- login --------------------------------- */

export async function loginAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const identity = field(data, "identity", 254);
  const password = String(data.get("password") || "");
  if (!identity || !password) return { error: "شناسه ورود و رمز عبور را وارد کنید." };
  if (await isBlocked(identity)) return { error: "به دلیل تلاش‌های ناموفق، ورود موقتاً مسدود است؛ کمی بعد تلاش کنید." };

  const phone = normalizeDigits(identity).replace(/\s/g, "");
  const email = identity.trim().toLowerCase();
  const [user] = await db.select().from(users).where(sql`${users.phone} = ${phone} OR lower(${users.email}) = ${email}`).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordLoginFailure(identity);
    return { error: "شناسه یا رمز عبور اشتباه است." };
  }
  if (!user.active) return { error: "حساب شما غیرفعال است؛ با مدیر سیستم تماس بگیرید." };

  await clearLoginFailures(identity);
  await createSession(user.id);
  await db.insert(auditLogs).values({ actorId: user.id, action: "login", targetType: "session", targetId: user.id });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  let actorId: string | null = null;
  try { actorId = (await requireUser()).id; } catch { /* already signed out */ }
  await destroySession();
  if (actorId) await db.insert(auditLogs).values({ actorId, action: "logout", targetType: "session", targetId: actorId });
  redirect("/login");
}

/* -------------------------- password reset via SMS ------------------------ */

/** Issues a 6-digit reset code to the account bound to the mobile number. */
export async function requestPasswordResetAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const mobile = normalizeDigits(field(data, "mobile", 20)).replace(/\s/g, "");
  if (!/^09\d{9}$/.test(mobile)) return { error: "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود." };
  const [user] = await db.select().from(users).where(eq(users.phone, mobile)).limit(1);
  // Do not disclose whether the number exists — same response either way.
  if (user) {
    const code = randomInt(100000, 1000000).toString();
    await db.delete(mobileResetCodes).where(and(eq(mobileResetCodes.userId, user.id), isNull(mobileResetCodes.usedAt)));
    await db.insert(mobileResetCodes).values({
      userId: user.id,
      mobile,
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    await sendSms(mobile, `کد بازیابی رمز عبور شما در سامانه نور: ${code} — این کد ۵ دقیقه اعتبار دارد.`, { userId: user.id });
    if (smsEchoEnabled()) return { success: `کد بازیابی ارسال شد. (حالت آزمایشی — کد: ${code})` };
  }
  return { success: "اگر این شماره در سامانه ثبت شده باشد، کد بازیابی پیامک شد." };
}

export async function resetPasswordAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const mobile = normalizeDigits(field(data, "mobile", 20)).replace(/\s/g, "");
  const code = normalizeDigits(field(data, "code", 6)).replace(/\s/g, "");
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirm") || "");
  if (!/^09\d{9}$/.test(mobile)) return { error: "شماره همراه معتبر نیست." };
  if (!/^\d{6}$/.test(code)) return { error: "کد بازیابی باید ۶ رقم باشد." };
  if (password !== confirm) return { error: "رمز عبور و تکرار آن یکسان نیستند." };
  const issues = passwordIssues(password);
  if (issues.length) return { error: `رمز عبور باید شامل: ${issues.join("، ")}` };

  const [row] = await db
    .select()
    .from(mobileResetCodes)
    .where(and(eq(mobileResetCodes.mobile, mobile), isNull(mobileResetCodes.usedAt), gt(mobileResetCodes.expiresAt, new Date())))
    .limit(1);
  if (!row) return { error: "کد بازیابی معتبر نیست یا منقضی شده است؛ کد جدید بگیرید." };
  if (row.attempts >= 5) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ کد جدید بگیرید." };
  if (createHash("sha256").update(code).digest("hex") !== row.codeHash) {
    await db.update(mobileResetCodes).set({ attempts: row.attempts + 1 }).where(eq(mobileResetCodes.id, row.id));
    return { error: "کد بازیابی اشتباه است." };
  }
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.update(mobileResetCodes).set({ usedAt: new Date() }).where(eq(mobileResetCodes.id, row.id));
    await tx.insert(auditLogs).values({ actorId: row.userId, action: "password_reset_sms", targetType: "user", targetId: row.userId });
  });
  return { success: "رمز عبور با موفقیت تغییر کرد؛ اکنون وارد شوید." };
}

/* ---------------------------- public registration ------------------------- */

export async function registerAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const firstName = field(data, "firstName", 80);
  const lastName = field(data, "lastName", 100);
  const mobile = normalizeDigits(field(data, "mobile", 20)).replace(/\s/g, "");
  const email = field(data, "email", 254).toLowerCase();
  const password = String(data.get("password") || "");
  const confirm = String(data.get("confirm") || "");
  const provinceId = Number(field(data, "provinceId", 10)) || null;
  const countyId = Number(field(data, "countyId", 10)) || null;

  if (firstName.length < 2 || lastName.length < 2) return { error: "نام و نام خانوادگی را کامل وارد کنید." };
  if (!/^09\d{9}$/.test(mobile)) return { error: "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "ایمیل معتبر نیست." };
  if (password !== confirm) return { error: "رمز عبور و تکرار آن یکسان نیستند." };
  const issues = passwordIssues(password);
  if (issues.length) return { error: `رمز عبور باید شامل: ${issues.join("، ")}` };
  if (provinceId) {
    const [province] = await db.select().from(provinces).where(eq(provinces.id, provinceId)).limit(1);
    if (!province) return { error: "استان انتخاب‌شده معتبر نیست." };
    if (countyId) {
      const [county] = await db.select().from(counties).where(and(eq(counties.id, countyId), eq(counties.provinceId, provinceId))).limit(1);
      if (!county) return { error: "شهرستان با استان سازگار نیست." };
    }
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, mobile)).limit(1);
  if (existing) return { error: "این شماره همراه قبلاً ثبت شده است؛ وارد شوید یا شماره دیگری بزنید." };

  const code = randomInt(100000, 1000000).toString();
  const fullName = `${firstName} ${lastName}`;
  const passwordHash = await hashPassword(password);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      fullName, firstName, lastName, phone: mobile, email: email || null,
      passwordHash, role: "activist", active: true, provinceId, countyId,
    }).returning({ id: users.id });
    await tx.delete(mobileVerificationCodes).where(and(eq(mobileVerificationCodes.userId, user.id), isNull(mobileVerificationCodes.usedAt)));
    await tx.insert(mobileVerificationCodes).values({
      userId: user.id, mobile,
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "register", targetType: "user", targetId: user.id });
    return user.id;
  });
  await sendSms(mobile, `کد فعال‌سازی حساب شما در سامانه نور: ${code}`, { userId });
  revalidatePath("/login");
  return smsEchoEnabled() ? { success: `ثبت‌نام انجام شد. کد فعال‌سازی پیامک شد. (حالت آزمایشی — کد: ${code})`, existingCaseId: userId } as ActionState : { success: "ثبت‌نام انجام شد؛ کد فعال‌سازی پیامک شد." };
}

/** Confirms the registration OTP, verifies mobile and opens the session. */
export async function verifyMobileAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const userId = field(data, "userId", 40);
  const code = normalizeDigits(field(data, "code", 6)).replace(/\s/g, "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: "شناسه ثبت‌نام معتبر نیست." };
  if (!/^\d{6}$/.test(code)) return { error: "کد فعال‌سازی باید ۶ رقم باشد." };
  const [row] = await db
    .select()
    .from(mobileVerificationCodes)
    .where(and(eq(mobileVerificationCodes.userId, userId), isNull(mobileVerificationCodes.usedAt), gt(mobileVerificationCodes.expiresAt, new Date())))
    .limit(1);
  if (!row) return { error: "کد معتبر نیست یا منقضی شده است؛ ثبت‌نام را تکرار کنید." };
  if (row.attempts >= 5) return { error: "تعداد تلاش‌ها بیش از حد مجاز است." };
  if (createHash("sha256").update(code).digest("hex") !== row.codeHash) {
    await db.update(mobileVerificationCodes).set({ attempts: row.attempts + 1 }).where(eq(mobileVerificationCodes.id, row.id));
    return { error: "کد فعال‌سازی اشتباه است." };
  }
  await db.transaction(async (tx) => {
    await tx.update(mobileVerificationCodes).set({ usedAt: new Date() }).where(eq(mobileVerificationCodes.id, row.id));
    await tx.update(users).set({ mobileVerifiedAt: new Date() }).where(eq(users.id, userId));
    await tx.insert(auditLogs).values({ actorId: userId, action: "verify_mobile", targetType: "user", targetId: userId });
  });
  await createSession(userId);
  redirect("/dashboard");
}
