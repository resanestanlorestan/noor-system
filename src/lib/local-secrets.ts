// AES-256-GCM encryption of the national ID + deterministic lookup hash.
// The plaintext never touches the database: cipher + search hash + last4 only.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.NOOR_DATA_DIR || path.join(process.cwd(), ".private");
const KEY_FILE = path.join(DATA_DIR, "secret.key");

let cachedKey: Buffer | null = null;

/** Loads (or creates) the 32-byte app secret key from the private dir. */
function appKey(): Buffer {
  if (cachedKey) return cachedKey;
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
  return cachedKey;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", appKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${enc.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptField(cipherText: string | null | undefined): string | null {
  if (!cipherText) return null;
  const [version, ivB64, dataB64, tagB64] = cipherText.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", appKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Deterministic keyed hash for duplicate search (never reversible to the ID). */
export function keyedHash(value: string): string {
  return createHmac("sha256", appKey()).update(value).digest("hex");
}

export type ProtectedNationalId = { cipher: string; hash: string; last4: string };

/** One-call protection: encrypt + hash + last4 extraction. */
export function protectNationalId(nationalId: string): ProtectedNationalId {
  return {
    cipher: encryptField(nationalId),
    hash: keyedHash(nationalId),
    last4: nationalId.slice(-4),
  };
}

/** Recovers the plaintext national ID for managers who hold the permission. */
export function revealNationalId(cipher: string | null): string | null {
  return decryptField(cipher);
}

/** Upload storage directory (documents/photos), always outside public/. */
export const privateDir = path.isAbsolute(DATA_DIR) ? DATA_DIR : path.join(process.cwd(), DATA_DIR);
