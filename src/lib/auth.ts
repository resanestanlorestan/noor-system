import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, customRoles, loginAttempts, messageOutbox, sessions, users } from "@/db/schema";
import { digest } from "@/lib/local-secrets";
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
  const result = await db.select({ user: users, customLabel: customRoles.label, customBase: customRoles.baseRole })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(customRoles, eq(users.customRoleId, customRoles.id))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true))).limit(1);
  const row = result[0];
  if (!row?.user) return null;
  return { ...row.user, effectiveRole: (row.customBase ?? row.user.role) as UserRole, customRoleLabel: row.customLabel ?? null };
}
export async function requireUser(): Promise<SessionUser> { const user = await getCurrentUser(); if (!user) redirect("/login"); return user; }
export async function endSession() {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  jar.delete(COOKIE);
}
export async function audit(actorId: string | null, action: string, targetType: string, targetId?: string, detail?: string) {
  await db.insert(auditLogs).values({ actorId, action, targetType, targetId: targetId || null, detail: detail || null });
}
export async function throttleKey(identifier: string) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
  return digest(`${identifier.toLowerCase()}|${ip}`);
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
