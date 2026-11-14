import { randomBytes, randomInt } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { toDataURL } from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mfaRecoveryCodes, pendingMfaSessions, users } from "@/db/schema";
import { decryptSecret, digest, encryptSecret } from "@/lib/local-secrets";
import type { AppUser } from "@/lib/auth";

const MFA_PURPOSE = "mfa-secret-v1";
export const mfaRequiredRoles = ["super_admin", "province_admin", "county_admin"] as const;
export function mfaRequiredForRole(role: AppUser["role"]) {
  return (mfaRequiredRoles as readonly string[]).includes(role);
}

export async function createPendingSecret(email: string) {
  const secret = generateSecret();
  const uri = generateURI({ issuer: "Noor Quranic Activists System", label: email, secret });
  const qrDataUrl = await toDataURL(uri, { margin: 1, width: 220 });
  return { secret, qrDataUrl };
}

export async function verifyTotp(secret: string, token: string) {
  if (!/^\d{6}$/.test(token)) return false;
  const result = await verify({ secret, token, epochTolerance: 30 });
  return result.valid;
}

export async function enableMfa(userId: string, secret: string) {
  const cipher = await encryptSecret(secret, MFA_PURPOSE);
  const codes = Array.from({ length: 8 }, () => randomInt(0, 1_000_000).toString().padStart(6, "0") + "-" + randomInt(0, 1_000_000).toString().padStart(6, "0"));
  await db.transaction(async (tx) => {
    await tx.update(users).set({ mfaSecretCipher: cipher, mfaEnabled: true, mfaEnabledAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.insert(mfaRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: digest(code) })));
  });
  return codes;
}

export async function disableMfa(userId: string) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ mfaSecretCipher: null, mfaEnabled: false, mfaEnabledAt: null }).where(eq(users.id, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  });
}

export async function getDecryptedMfaSecret(user: Pick<AppUser, "mfaSecretCipher">) {
  if (!user.mfaSecretCipher) return null;
  return decryptSecret(user.mfaSecretCipher, MFA_PURPOSE);
}

export async function consumeRecoveryCode(userId: string, code: string) {
  const normalized = code.trim();
  if (!/^\d{6}-\d{6}$/.test(normalized)) return false;
  const hash = digest(normalized);
  const result = await db.update(mfaRecoveryCodes).set({ usedAt: new Date() })
    .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hash), isNull(mfaRecoveryCodes.usedAt)))
    .returning({ id: mfaRecoveryCodes.id });
  return result.length > 0;
}

export async function createPendingMfaToken(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(pendingMfaSessions).values({ tokenHash: digest(token), userId, expiresAt });
  return token;
}

export async function resolvePendingMfaToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = digest(token);
  const [row] = await db.select({ userId: pendingMfaSessions.userId, expiresAt: pendingMfaSessions.expiresAt }).from(pendingMfaSessions).where(eq(pendingMfaSessions.tokenHash, hash)).limit(1);
  if (!row || row.expiresAt < new Date()) return null;
  return row.userId;
}

export async function clearPendingMfaToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  await db.delete(pendingMfaSessions).where(eq(pendingMfaSessions.tokenHash, digest(token)));
}
