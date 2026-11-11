// Session-cookie authentication: DB-backed sessions, bcrypt passwords,
// login throttling, MFA hooks. Server-only.

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { customRolePermissions, customRoles, loginAttempts, sessions, users } from "@/db/schema";
import type { Permission, Role } from "@/lib/permissions";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

const SESSION_COOKIE = "noor_session";
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;
const BLOCK_MINUTES = 15;

export type SessionUser = {
  id: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  effectiveRole: Role;
  customPermissions: readonly Permission[] | null;
  provinceId: number | null;
  countyId: number | null;
  mfaEnabled: boolean;
  mfaSecretCipher: string | null;
  mobileVerifiedAt: Date | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function identityKey(identity: string): string {
  return sha256(identity.trim().toLowerCase());
}

export async function recordLoginFailure(identity: string): Promise<void> {
  const key = identityKey(identity);
  const now = new Date();
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.identityHash, key)).limit(1);
  if (!row) {
    await db.insert(loginAttempts).values({ identityHash: key, attempts: 1, windowStartedAt: now });
    return;
  }
  const windowExpired = now.getTime() - row.windowStartedAt.getTime() > WINDOW_MINUTES * 60_000;
  if (windowExpired) {
    await db.update(loginAttempts).set({ attempts: 1, windowStartedAt: now, blockedUntil: null }).where(eq(loginAttempts.identityHash, key));
    return;
  }
  const nextAttempts = row.attempts + 1;
  const blocked = nextAttempts >= MAX_ATTEMPTS;
  await db.update(loginAttempts).set({
    attempts: nextAttempts,
    ...(blocked ? { blockedUntil: new Date(now.getTime() + BLOCK_MINUTES * 60_000) } : {}),
  }).where(eq(loginAttempts.identityHash, key));
}

export async function isBlocked(identity: string): Promise<boolean> {
  const key = identityKey(identity);
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.identityHash, key)).limit(1);
  return Boolean(row?.blockedUntil && row.blockedUntil > new Date());
}

export async function clearLoginFailures(identity: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.identityHash, identityKey(identity)));
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("حداقل ۸ نویسه");
  if (!/[a-z]/.test(password)) issues.push("حداقل یک حرف کوچک");
  if (!/[A-Z]/.test(password)) issues.push("حداقل یک حرف بزرگ");
  if (!/\d/.test(password)) issues.push("حداقل یک رقم");
  return issues;
}

/** Resolves the logged-in user or null; joins custom-role grants when present. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionToken(token);
}

export async function resolveSessionToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.user.active) return null;
  const u = row.user;
  let effectiveRole: Role = u.role;
  let customPermissions: readonly Permission[] | null = null;
  if (u.customRoleId) {
    const [custom] = await db.select().from(customRoles).where(eq(customRoles.id, u.customRoleId)).limit(1);
    if (custom) {
      effectiveRole = custom.baseRole;
      const grants = await db.select({ permission: customRolePermissions.permissionKey }).from(customRolePermissions).where(eq(customRolePermissions.customRoleId, custom.id));
      customPermissions = grants.map((g) => g.permission as Permission);
    }
  }
  return {
    id: u.id,
    fullName: u.fullName,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    effectiveRole,
    customPermissions,
    provinceId: u.provinceId,
    countyId: u.countyId,
    mfaEnabled: u.mfaEnabled,
    mfaSecretCipher: u.mfaSecretCipher,
    mobileVerifiedAt: u.mobileVerifiedAt,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Throws (ending the request) when the user is not logged in. */
export async function currentUserOrNull(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  // opportunistic cleanup of expired sessions
  await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE };
export const rolePermissions = ROLE_PERMISSIONS;
