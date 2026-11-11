import { beforeAll, describe, expect, it } from "vitest";
import { protectNationalId, revealNationalId, encryptField, decryptField, keyedHash, privateDir } from "@/lib/local-secrets";

describe("national id protection (AES-256-GCM)", () => {
  it("produces cipher + deterministic hash + last4", () => {
    const a = protectNationalId("4310208396");
    const b = protectNationalId("4310208396");
    expect(a.cipher).toMatch(/^v1\./);
    expect(a.hash).toHaveLength(64);
    expect(a.last4).toBe("8396");
    expect(a.hash).toBe(b.hash);       // deterministic for duplicate search
    expect(a.cipher).not.toBe(b.cipher); // randomized encryption
  });
  it("round-trips through revealNationalId", () => {
    const p = protectNationalId("4310208396");
    expect(revealNationalId(p.cipher)).toBe("4310208396");
  });
  it("handles empty/invalid input safely", () => {
    expect(revealNationalId(null)).toBeNull();
    expect(revealNationalId("garbage")).toBeNull();
    expect(decryptField(undefined)).toBeNull();
  });
  it("keyedHash is stable and hex", () => {
    expect(keyedHash("test")).toBe(keyedHash("test"));
    expect(keyedHash("test")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("encryptField/decryptField generic round-trip", () => {
    const cipher = encryptField("متن فارسی 123");
    expect(decryptField(cipher)).toBe("متن فارسی 123");
  });
});

describe("private storage dir", () => {
  it("is absolute and outside public", () => {
    expect(privateDir).toMatch(/\//);
    expect(privateDir).not.toContain("public");
  });
});
