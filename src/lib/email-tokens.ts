import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens } from "@/db/schema";
import { digest } from "@/lib/local-secrets";
import { EMAIL_VERIFICATION_TTL_MS, validResetTokenFormat } from "@/lib/validation";

type TokenContext = Pick<typeof db, "insert" | "delete" | "update">;

/** Issues a fresh verification token, replacing any pending one for the user. */
export async function issueEmailVerificationToken(tx: TokenContext, userId: string, newEmail: string | null) {
  const token = randomBytes(32).toString("hex");
  await tx.delete(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
  await tx.insert(emailVerificationTokens).values({ userId, tokenHash: digest(token), newEmail, expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) });
  return token;
}

export async function pendingVerificationRecentlyIssued(userId: string, withinMinutes: number) {
  const [row] = await db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.createdAt, new Date(Date.now() - withinMinutes * 60 * 1000)))).limit(1);
  return !!row;
}

/** Marks the token as used (single-use) and returns its owner, or null. */
export async function consumeEmailVerificationToken(token: string) {
  if (!validResetTokenFormat(token)) return null;
  const [row] = await db.select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId, newEmail: emailVerificationTokens.newEmail })
    .from(emailVerificationTokens).where(and(eq(emailVerificationTokens.tokenHash, digest(token)), isNull(emailVerificationTokens.usedAt))).limit(1);
  if (!row) return null;
  const updated = await db.update(emailVerificationTokens).set({ usedAt: new Date() })
    .where(and(eq(emailVerificationTokens.id, row.id), isNull(emailVerificationTokens.usedAt))).returning({ id: emailVerificationTokens.id });
  if (!updated.length) return null;
  return { userId: row.userId, newEmail: row.newEmail };
}
