import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, customRoles, loginAttempts, messageOutbox, sessions, users } from "@/db/schema";
import { digest } from "@/lib/local-secrets";
import { IDLE_TIMEOUT_MS, isSessionIdle } from "@/lib/session-timeout";
import type { UserRole } from "@/lib/constants";

const COOKIE = "noor_session";
export type AppUser = typeof users.$inferSelect;
/** Session user enriched with the custom-role view: effectiveRole drives data
 *  scoping (it is the custom role's base role, or the account role), while
 *  capability checks go through can(user, key) in lib/permissions. */
export type SessionUser = AppUser & { effectiveRole: UserRole; customRoleLabel: string | null };
/** Anything that behaves like a session user; plain AppUser rows fall back to
 *  their account role (used by feature-test fixtures and DB-fetched users). */
export type MaybeSessionUser = AppUser & { effectiveRole?: UserRole; customRoleLabel?: string | null };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`; }
export async function verifyPassword(password: string, stored: string | null) {
  const parts = (stored || `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual = await derive(password, parts[1]); const expected = Buffer.from(parts[2], "hex");
  return timingSafeEqual(actual, expected) && !!stored;
}
// Opportunistic housekeeping: without a cron job, prune old rows occasionally
// on write paths so sessions/login_attempts tables don't grow unbounded.
async function maybeCleanupStaleRows() {
  if (Math.random() >= 0.02) return;
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())),
    db.delete(loginAttempts).where(and(lt(loginAttempts.windowStartedAt, staleBefore), isNull(loginAttempts.blockedUntil))),
    db.delete(messageOutbox).where(lt(messageOutbox.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))),
  ]).catch(() => undefined);
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: digest(token), userId, expiresAt });
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  // DEMO_EMBED=1 (sandbox preview only): the app renders inside the platform
  // preview iframe, which is cross-site, so the session cookie must be
  // SameSite=None; Secure to be sent at all. Production keeps Lax.
  const embed = process.env.DEMO_EMBED === "1";
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: embed ? "none" : "lax", secure: embed || process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  void maybeCleanupStaleRows();
}
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = digest(token);
  const result = await db.select({ user: users, customLabel: customRoles.label, customBase: customRoles.baseRole, lastSeenAt: sessions.lastSeenAt })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(customRoles, eq(users.customRoleId, customRoles.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), eq(users.active, true))).limit(1);
  const row = result[0];
  if (!row?.user) return null;
  // الحاقیهٔ ۲.۱۸.۷ — اعتبارسنجی سرسوییِ بی‌فعالیتی: نشستی که از سقف مجاز
  // (پیش‌فرض ۱۵ دقیقه) درخواستی نداشته، همین‌جا باطل می‌شود؛ خروج خودکار فقط
  // به تایمر مرورگر وابسته نیست و هر مسیر محافظت‌شده‌ای آن را اجرا می‌کند.
  if (isSessionIdle(row.lastSeenAt)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    await audit(row.user.id, "idle_session_invalidated", "session").catch(() => undefined);
    return null;
  }
  // تمدید «آخرین فعالیت» با هر درخواست معتبر — با آستانهٔ ۳۰ ثانیه تا هر
  // پیمایش صفحه یک UPDATE نزند؛ درخواست‌های پیاپیِ زیر ۳۰ ثانیه جزئی‌اند.
  if (Date.now() - row.lastSeenAt.getTime() > 30_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.tokenHash, tokenHash)).catch(() => undefined);
  }
  return { ...row.user, effectiveRole: (row.customBase ?? row.user.role) as UserRole, customRoleLabel: row.customLabel ?? null };
}
export async function requireUser(): Promise<SessionUser> { const user = await getCurrentUser(); if (!user) redirect("/login"); return user; }
export async function endSession() {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  jar.delete(COOKIE);
}
// الحاقیهٔ ۲.۱۸.۷ — نبض نشست: کلاینت فقط با کلیک «ادامه فعالیت» این تابع را
// صدا می‌زند؛ سرور همین‌جا بی‌فعالیتی را دوباره اعتبارسنجی می‌کند (اگر از سقف
// گذشته باشد نشست باطل می‌شود) و در حالت سالم، «آخرین فعالیت» را تمدید و زمان
// باقی‌مانده را برمی‌گرداند. هیچ تایمر پس‌زمینه‌ای این مسیر را صدا نمی‌زند تا
// فعالیت واقعیِ کاربر تنها مبنا بماند.
export async function pingSession(): Promise<{ ok: boolean; remainingMs: number }> {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { ok: false, remainingMs: 0 };
  const tokenHash = digest(token);
  const [row] = await db.select({ lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  const now = new Date();
  if (!row || row.expiresAt <= now || isSessionIdle(row.lastSeenAt, now)) {
    if (row) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return { ok: false, remainingMs: 0 };
  }
  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
  return { ok: true, remainingMs: Math.max(0, IDLE_TIMEOUT_MS - (now.getTime() - row.lastSeenAt.getTime())) };
}
// الحاقیهٔ ۲.۱۸.۷ — خروج خودکار/هشداری با ممیزی: نشست سمت سرور حذف، کوکی پاک و
// کنش در رویدادهای حساس ثبت می‌شود (idle_logout)؛ مستقل از درخواست صفحه.
export async function idleLogout(reason: "idle" | "manual"): Promise<{ ok: boolean }> {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = digest(token);
    const [row] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    if (row) await audit(row.userId, reason === "idle" ? "idle_logout" : "logout", "session", undefined, reason === "idle" ? "خروج خودکار در صورت عدم فعالیت" : undefined).catch(() => undefined);
  }
  jar.delete(COOKIE);
  return { ok: true };
}
export async function audit(actorId: string | null, action: string, targetType: string, targetId?: string, detail?: string) {
  await db.insert(auditLogs).values({ actorId, action, targetType, targetId: targetId || null, detail: detail || null });
}
export async function throttleKey(identifier: string) {
  // الحاقیهٔ ۲.۱۸.۰ — کلید قفل فقط بر شناسهٔ حساب بسته می‌شود؛ مقدار نخست
  // X-Forwarded-For از سوی کلاینت قابل جعل است و چرخاندن آن پنجرهٔ تازهٔ
  // تلاش می‌ساخت (ممیزی امنیتی ۲.۱۷.۱ یافتهٔ F3).
  return digest(identifier.toLowerCase());
}
export async function isThrottled(key: string) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.identityHash, key)).limit(1);
  return !!row?.blockedUntil && row.blockedUntil > new Date();
}
export async function recordFailure(key: string) {
  const now = new Date(); const windowStart = new Date(Date.now() - 15 * 60 * 1000); const blockUntil = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(loginAttempts).values({ identityHash: key, attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({ target: loginAttempts.identityHash, set: {
      attempts: sql`case when ${loginAttempts.windowStartedAt} < ${windowStart.toISOString()}::timestamptz then 1 else ${loginAttempts.attempts} + 1 end`,
      windowStartedAt: sql`case when ${loginAttempts.windowStartedAt} < ${windowStart.toISOString()}::timestamptz then ${now.toISOString()}::timestamptz else ${loginAttempts.windowStartedAt} end`,
      blockedUntil: sql`case when ${loginAttempts.windowStartedAt} >= ${windowStart.toISOString()}::timestamptz and ${loginAttempts.attempts} + 1 >= 5 then ${blockUntil.toISOString()}::timestamptz else null end`,
    } });
}
export async function clearFailures(key: string) { await db.delete(loginAttempts).where(eq(loginAttempts.identityHash, key)); }
