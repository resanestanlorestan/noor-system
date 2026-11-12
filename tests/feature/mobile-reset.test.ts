// Feature tests for the mobile (SMS OTP) password reset flow (مرحله دوم):
// request code → hashed code + queued SMS → verify + set new password →
// sessions invalidated + audit entry + login with the new password.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { form, redirectOf, closeDb } from "./helpers";
import { hashPassword } from "@/lib/auth";
import { digest } from "@/lib/local-secrets";
import { requestMobileResetAction, resetWithMobileAction } from "@/app/actions/password";
import { loginAction } from "@/app/actions/auth";

// Local (no-gateway) mode: the OTP is returned as devCode instead of being sent.
// Other feature suites activate a stubbed SMS gateway in the same worker, so the
// keys are cleared before every test to guarantee the local branch here.
beforeEach(() => {
  delete process.env.PAYAMAK_PANEL_USERNAME;
  delete process.env.PAYAMAK_PANEL_PASSWORD;
  delete process.env.PAYAMAK_PANEL_API_KEY;
  delete process.env.KAVENEGAR_API_KEY;
});
vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network must not be touched in local mode"); }));

const PHONE = "09351110900";
const OLD_PASSWORD = "OldPassw0rd";
let userId = "";
let oldHash = "";

/** Fresh account for every test: same phone, original password, no codes/sessions.
 *  The per-identity throttle rows are cleared too — the suite intentionally
 *  issues more than 5 requests within 15 minutes against one phone. */
async function resetFixture() {
  await cleanup();
  await clearThrottle();
  const [created] = await db.insert(s.users).values({
    fullName: "بازیاب آزمونی", firstName: "بازیاب", lastName: "آزمونی",
    passwordHash: oldHash, role: "activist", phone: PHONE,
    active: true, mobileVerifiedAt: new Date(),
  }).returning({ id: s.users.id });
  userId = created.id;
}

const TEST_IP = "127.0.0.1"; // matches the mocked x-forwarded-for header in helpers
async function clearThrottle() {
  const keys = [`pwresetm:${PHONE}`, `pwapplym:${PHONE}`].map((id) => digest(`${id}|${TEST_IP}`));
  await db.delete(s.loginAttempts).where(inArray(s.loginAttempts.identityHash, keys));
}

async function cleanup() {
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, PHONE)).limit(1);
  if (!u) return;
  await db.delete(s.messageOutbox).where(eq(s.messageOutbox.userId, u.id));
  await db.delete(s.mobileResetCodes).where(eq(s.mobileResetCodes.userId, u.id));
  await db.delete(s.auditLogs).where(eq(s.auditLogs.actorId, u.id));
  await db.delete(s.sessions).where(eq(s.sessions.userId, u.id));
  await db.delete(s.users).where(eq(s.users.id, u.id));
}

beforeAll(async () => {
  oldHash = await hashPassword(OLD_PASSWORD);
  await resetFixture();
}, 30_000);
beforeEach(resetFixture);
afterAll(async () => { vi.unstubAllGlobals(); await cleanup(); await closeDb(); });

describe("بازیابی گذرواژه با شماره موبایل", () => {
  it("درخواست کد در حالت محلی، کد آزمایشی می‌دهد و در صندوق ثبت می‌شود", async () => {
    const state = await requestMobileResetAction({}, form({ mobile: PHONE }));
    expect(state.error).toBeUndefined();
    expect(state.devCode).toMatch(/^\d{6}$/);
    expect(state.mobile).toBe(PHONE);
    const [sms] = await db.select().from(s.messageOutbox).where(and(eq(s.messageOutbox.userId, userId), eq(s.messageOutbox.channel, "sms")));
    expect(sms.recipient).toBe(PHONE);
    expect(sms.body).toContain(state.devCode!);
    const [code] = await db.select().from(s.mobileResetCodes).where(eq(s.mobileResetCodes.userId, userId));
    expect(code.usedAt).toBeNull();
    expect(code.attempts).toBe(0);
  });

  it("شماره ثبت‌نشده پیام عمومی می‌دهد و کدی صادر نمی‌شود", async () => {
    const state = await requestMobileResetAction({}, form({ mobile: "09351110999" }));
    expect(state.success).toContain("اگر این شماره");
    expect(state.devCode).toBeUndefined();
  });

  it("کد نادرست تلاش می‌شمارد و بعد از پنج تلاش قفل می‌شود", async () => {
    const { devCode } = await requestMobileResetAction({}, form({ mobile: PHONE }));
    const wrong = devCode === "111111" ? "222222" : "111111";
    for (let i = 0; i < 4; i++) {
      const state = await resetWithMobileAction({}, form({ mobile: PHONE, code: wrong, password: "NewPassw0rd", confirmation: "NewPassw0rd" }));
      expect(state.error).toContain("نادرست");
    }
    const locked = await resetWithMobileAction({}, form({ mobile: PHONE, code: wrong, password: "NewPassw0rd", confirmation: "NewPassw0rd" }));
    expect(locked.error).toContain("باطل");
    // Even the correct code no longer passes after the lock-out.
    const correct = await resetWithMobileAction({}, form({ mobile: PHONE, code: devCode!, password: "NewPassw0rd", confirmation: "NewPassw0rd" }));
    expect(correct.error).toBeTruthy();
    const [row] = await db.select().from(s.mobileResetCodes).where(eq(s.mobileResetCodes.userId, userId));
    expect(row.attempts).toBe(5);
  });

  it("کد درست گذرواژه را عوض می‌کند، نشست‌ها را باطل و ورود جدید را ممکن می‌کند", async () => {
    const { devCode } = await requestMobileResetAction({}, form({ mobile: PHONE }));
    // A stale session must die after the reset.
    const { createSession, getCurrentUser } = await import("@/lib/auth");
    await createSession(userId);
    expect((await getCurrentUser())?.id).toBe(userId);
    const url = await redirectOf(() => resetWithMobileAction({}, form({ mobile: PHONE, code: devCode!, password: "NewPassw0rd", confirmation: "NewPassw0rd" })));
    expect(url).toBe("/login?reset=1");
    expect(await getCurrentUser()).toBeNull();
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.passwordHash).not.toBe(oldHash);
    // Login with the old password fails, with the new one succeeds (by mobile).
    const badLogin = await loginAction({}, form({ identifier: PHONE, password: OLD_PASSWORD }));
    expect(badLogin.error).toBeTruthy();
    const goodLogin = await redirectOf(() => loginAction({}, form({ identifier: PHONE, password: "NewPassw0rd" })));
    expect(goodLogin).toBe("/dashboard");
    const events = await db.select().from(s.auditLogs).where(eq(s.auditLogs.actorId, userId));
    expect(events.some((e) => e.action === "reset_password")).toBe(true);
    const [code] = await db.select().from(s.mobileResetCodes).where(eq(s.mobileResetCodes.userId, userId));
    expect(code.usedAt).not.toBeNull();
  });

  it("کد مصرف‌شده دوباره پذیرفته نمی‌شود و گذرواژه دوم را نمی‌سازد", async () => {
    const { devCode } = await requestMobileResetAction({}, form({ mobile: PHONE }));
    await redirectOf(() => resetWithMobileAction({}, form({ mobile: PHONE, code: devCode!, password: "NewPassw0rd", confirmation: "NewPassw0rd" })));
    const second = await resetWithMobileAction({}, form({ mobile: PHONE, code: devCode!, password: "AnotherPass1", confirmation: "AnotherPass1" }));
    expect(second.error).toBeTruthy();
    // The password stayed the first new one — "AnotherPass1" does not work.
    const wrongNew = await loginAction({}, form({ identifier: PHONE, password: "AnotherPass1" }));
    expect(wrongNew.error).toBeTruthy();
    const rightNew = await redirectOf(() => loginAction({}, form({ identifier: PHONE, password: "NewPassw0rd" })));
    expect(rightNew).toBe("/dashboard");
  });

  it("درفاصله خنک، کد دومی صادر نمی‌شود", async () => {
    const first = await requestMobileResetAction({}, form({ mobile: PHONE }));
    const second = await requestMobileResetAction({}, form({ mobile: PHONE }));
    expect(second.devCode).toBeUndefined(); // cooldown: no fresh code yet
    // Age the pending code past the cooldown, then a new code replaces it.
    await db.update(s.mobileResetCodes).set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) }).where(inArray(s.mobileResetCodes.userId, [userId]));
    const third = await requestMobileResetAction({}, form({ mobile: PHONE }));
    expect(third.devCode).toMatch(/^\d{6}$/);
    expect(third.devCode).not.toBe(first.devCode);
  });
});
