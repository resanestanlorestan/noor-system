import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const privateDir = path.join(process.cwd(), ".private-app");
async function localSecret(filename: string, bytes: number) {
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const filenamePath = path.join(privateDir, filename);
  try { await writeFile(filenamePath, randomBytes(bytes).toString("hex"), { mode: 0o600, flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return (await readFile(filenamePath, "utf8")).trim();
}
export async function bootstrapCode() { return process.env.BOOTSTRAP_SETUP_CODE || localSecret("bootstrap-code", 24); }
async function masterKey() {
  const configured = process.env.APP_ENCRYPTION_KEY;
  const value = configured || await localSecret("encryption-key", 32);
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("APP_ENCRYPTION_KEY must be 64 hexadecimal characters");
  return Buffer.from(value, "hex");
}
export async function protectNationalId(value: string) {
  const key = await masterKey();
  const encryptionKey = createHmac("sha256", key).update("national-id-encryption-v1").digest();
  const lookupKey = createHmac("sha256", key).update("national-id-lookup-v1").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { cipher: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url"), hash: createHmac("sha256", lookupKey).update(value).digest("hex"), last4: value.slice(-4) };
}
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function encryptSecret(value: string, purpose: string) {
  const key = await masterKey();
  const encryptionKey = createHmac("sha256", key).update(purpose).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export async function decryptSecret(cipherText: string, purpose: string): Promise<string | null> {
  try {
    const key = await masterKey();
    const encryptionKey = createHmac("sha256", key).update(purpose).digest();
    const raw = Buffer.from(cipherText, "base64url");
    const iv = raw.subarray(0, 12), authTag = raw.subarray(12, 28), encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch { return null; }
}
