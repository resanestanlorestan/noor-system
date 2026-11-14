import { describe, expect, it } from "vitest";
import { digest, encryptSecret, decryptSecret, protectNationalId } from "@/lib/local-secrets";
import { validEmailFormat, validPasswordFormat, validResetTokenFormat, PASSWORD_RESET_TTL_MS, EMAIL_VERIFICATION_TTL_MS } from "@/lib/validation";
import { passwordResetEmail, emailVerificationEmail, emailChangeEmail, passwordChangedEmail, localDeliveryMode } from "@/lib/messaging";
import { notificationRows, isUuid } from "@/lib/workflow-utils";

describe("local-secrets crypto", () => {
  it("digest is a 64-char hex sha256 and stable", () => {
    const value = digest("noor-test");
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(digest("noor-test")).toBe(value);
  });
  it("encrypt/decrypt roundtrip restores the secret", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const cipher = await encryptSecret(secret, "test-purpose");
    expect(cipher).not.toContain(secret);
    expect(await decryptSecret(cipher, "test-purpose")).toBe(secret);
  });
  it("decryption with the wrong purpose fails safely", async () => {
    const cipher = await encryptSecret("payload", "purpose-a");
    expect(await decryptSecret(cipher, "purpose-b")).toBeNull();
  });
  it("garbage ciphertext returns null instead of throwing", async () => {
    expect(await decryptSecret("not-a-cipher", "x")).toBeNull();
  });
  it("protectNationalId produces unique ciphertext with stable HMAC", async () => {
    const first = await protectNationalId("0079279902");
    const second = await protectNationalId("0079279902");
    expect(first.hash).toBe(second.hash); // deterministic lookup key
    expect(first.last4).toBe("9902");
    expect(first.cipher).not.toBe(second.cipher); // randomized encryption
    expect(first.cipher).not.toContain("0079279902");
  });
});

describe("validation helpers", () => {
  it("validates the password policy: 8+ chars, lower, upper and digit", () => {
    expect(validPasswordFormat("Abcdefg1")).toBe(true);
    expect(validPasswordFormat("Abcdef12")).toBe(true);
    expect(validPasswordFormat("Passw0rd! secure")).toBe(true);
    expect(validPasswordFormat("abcdefgh1")).toBe(false); // no uppercase
    expect(validPasswordFormat("ABCDEFG1")).toBe(false); // no lowercase
    expect(validPasswordFormat("Abcdefgh")).toBe(false); // no digit
    expect(validPasswordFormat("Ab1")).toBe(false); // too short
    expect(validPasswordFormat("a".repeat(12))).toBe(false); // lowercase only
    expect(validPasswordFormat(`Abcdefg1${"a".repeat(121)}`)).toBe(false); // > 128
  });
  it("validates e-mail format", () => {
    expect(validEmailFormat("user@example.com")).toBe(true);
    expect(validEmailFormat("no-at-sign")).toBe(false);
    expect(validEmailFormat("a b@example.com")).toBe(false);
  });
  it("validates token format", () => {
    expect(validResetTokenFormat("a".repeat(64))).toBe(true);
    expect(validResetTokenFormat("A".repeat(64))).toBe(false);
    expect(validResetTokenFormat("abc")).toBe(false);
  });
  it("token TTLs are conservative", () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60 * 1000);
    expect(EMAIL_VERIFICATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("message templates", () => {
  it("reset e-mail contains the link and expiry hint", () => {
    const mail = passwordResetEmail("https://x.test/reset-password/abc");
    expect(mail.subject).toContain("بازیابی گذرواژه");
    expect(mail.body).toContain("https://x.test/reset-password/abc");
    expect(mail.body).toContain("۳۰ دقیقه");
  });
  it("verification e-mail contains the link", () => {
    const mail = emailVerificationEmail("https://x.test/verify-email/tok");
    expect(mail.body).toContain("/verify-email/tok");
    expect(mail.body).toContain("۲۴ ساعت");
  });
  it("change-of-e-mail shows the new address", () => {
    const mail = emailChangeEmail("https://x.test/verify-email/tok", "new@example.com");
    expect(mail.body).toContain("new@example.com");
  });
  it("password-changed notice does not include secrets", () => {
    const mail = passwordChangedEmail();
    expect(mail.body).not.toMatch(/https?:\/\//);
  });
  it("local mode is on while no SMTP host is configured", () => {
    const hadHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    expect(localDeliveryMode()).toBe(true);
    process.env.SMTP_HOST = hadHost;
  });
});

describe("workflow utils", () => {
  it("notificationRows deduplicates and drops empty ids", () => {
    const rows = notificationRows(["a", "a", null, undefined, "b"], "title", "body", "app-1");
    expect(rows.map((row) => row.userId)).toEqual(["a", "b"]);
    expect(rows.every((row) => row.applicationId === "app-1" && row.title === "title" && row.body === "body")).toBe(true);
  });
  it("isUuid checks versioned uuids", () => {
    expect(isUuid("6f9619ff-8b86-4d01-b42d-00c04fc964ff")).toBe(true);
    expect(isUuid("6f9619ff-8b86-d011-b42d-00c04fc964ff")).toBe(false); // unsupported version nibble
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
