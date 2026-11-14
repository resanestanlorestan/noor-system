import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mobileVerificationCodes, pendingMobileVerifications } from "@/db/schema";
import { digest } from "@/lib/local-secrets";

// Lifecycle of the registration mobile-OTP flow: a 6-digit code is issued,
// queued as an SMS and stored only as a SHA-256 digest. The no-session verify
// page reaches the pending account through a random token (digest-stored like
// every other one-shot token in the codebase).

export const MOBILE_CODE_TTL_MS = 10 * 60 * 1000;
export const MOBILE_CODE_MAX_ATTEMPTS = 5;
export const MOBILE_RESEND_COOLDOWN_MS = 60 * 1000;
export const PENDING_VERIFICATION_TTL_MS = 30 * 60 * 1000;

type CodeContext = Pick<typeof db, "insert" | "delete" | "update" | "select">;

export const generateMobileCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Issues a fresh OTP for the user, replacing any pending one. Returns the plain code for the SMS body. */
export async function issueMobileVerification(tx: CodeContext, userId: string, mobile: string) {
  const code = generateMobileCode();
  await tx.delete(mobileVerificationCodes).where(and(eq(mobileVerificationCodes.userId, userId), isNull(mobileVerificationCodes.usedAt)));
  await tx.insert(mobileVerificationCodes).values({
    userId, mobile, codeHash: digest(code),
    expiresAt: new Date(Date.now() + MOBILE_CODE_TTL_MS),
  });
  return code;
}

/** Issues the URL token that carries the no-session verify page to the pending account. */
export async function issuePendingVerificationToken(tx: CodeContext, userId: string) {
  const token = randomBytes(32).toString("hex");
  await tx.delete(pendingMobileVerifications).where(eq(pendingMobileVerifications.userId, userId));
  await tx.insert(pendingMobileVerifications).values({ tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + PENDING_VERIFICATION_TTL_MS) });
  return token;
}

/** Resolves the pending token to its owner, or null when unknown/expired. */
export async function resolvePendingVerificationToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [row] = await db.select({ userId: pendingMobileVerifications.userId })
    .from(pendingMobileVerifications)
    .where(and(eq(pendingMobileVerifications.tokenHash, digest(token)), gt(pendingMobileVerifications.expiresAt, new Date())))
    .limit(1);
  return row?.userId ?? null;
}

/** True when a code was issued for the user within the resend cooldown window. */
export async function pendingMobileCodeRecentlyIssued(userId: string, withinMs = MOBILE_RESEND_COOLDOWN_MS) {
  const [row] = await db.select({ id: mobileVerificationCodes.id })
    .from(mobileVerificationCodes)
    .where(and(eq(mobileVerificationCodes.userId, userId), isNull(mobileVerificationCodes.usedAt), gt(mobileVerificationCodes.createdAt, new Date(Date.now() - withinMs))))
    .limit(1);
  return !!row;
}

export type MobileCodeCheck = "ok" | "invalid" | "expired" | "locked";

/** Single-use verification with per-code attempt capping; never throws. */
export async function consumeMobileCode(tx: CodeContext, userId: string, code: string): Promise<{ check: MobileCodeCheck; remainingAttempts: number }> {
  const [row] = await tx.select().from(mobileVerificationCodes)
    .where(and(eq(mobileVerificationCodes.userId, userId), isNull(mobileVerificationCodes.usedAt)))
    .limit(1);
  if (!row) return { check: "expired", remainingAttempts: 0 };
  if (row.expiresAt <= new Date()) return { check: "expired", remainingAttempts: 0 };
  if (row.attempts >= MOBILE_CODE_MAX_ATTEMPTS) return { check: "locked", remainingAttempts: 0 };
  if (row.codeHash !== digest(code)) {
    await tx.update(mobileVerificationCodes).set({ attempts: row.attempts + 1 }).where(eq(mobileVerificationCodes.id, row.id));
    const used = row.attempts + 1 >= MOBILE_CODE_MAX_ATTEMPTS;
    return { check: "invalid", remainingAttempts: used ? 0 : MOBILE_CODE_MAX_ATTEMPTS - row.attempts - 1 };
  }
  await tx.update(mobileVerificationCodes).set({ usedAt: new Date() }).where(eq(mobileVerificationCodes.id, row.id));
  return { check: "ok", remainingAttempts: 0 };
}

/** 0912***789 — safe display form for the verify page heading. */
export function maskMobile(mobile: string) {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 7) return "•".repeat(digits.length || 3);
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}
