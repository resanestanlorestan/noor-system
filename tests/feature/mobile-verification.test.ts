// Feature tests for registration mobile (SMS OTP) verification:
// register → inactive account + queued SMS → verify code → active account +
// session. Also covers wrong/expired/locked codes, resend cooldown, the login
// recovery path for pending accounts and the no-gateway (local) fallback.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { form, redirectOf, featureSeed, closeDb, type Fixture } from "./helpers";
import { registerAction, loginAction } from "@/app/actions/auth";
import { throttleKey } from "@/lib/auth";
import { verifyRegistrationMobileAction, resendRegistrationMobileAction } from "@/app/actions/mobile-verification";
import { maskMobile } from "@/lib/mobile-verification";
import { validIranMobile } from "@/lib/validation";
import { mobileVerificationSms } from "@/lib/messaging";
import { getCurrentUser } from "@/lib/auth";

// SMS provider present ⇒ the OTP gate is active for this suite. The gateway
// itself is stubbed so deliverOutbox() never leaves the process.
delete process.env.PAYAMAK_PANEL_API_KEY;
delete process.env.KAVENEGAR_API_KEY;
process.env.PAYAMAK_PANEL_USERNAME = "feature-test";
process.env.PAYAMAK_PANEL_PASSWORD = "feature-test-pass";
vi.stubGlobal("fetch", (async () => Response.json({ RetStatus: 1, Value: "ok", StrRetStatus: "Successful" })) as typeof fetch);

const EMAIL_DOMAIN = "@mverify.test";
let f: Fixture;
const unique = (() => { let n = 0; return () => `reg${++n}-${Date.now()}${EMAIL_DOMAIN}`; })();

async function myUserIds() {
  return (await db.select({ id: s.users.id }).from(s.users).where(like(s.users.email, `%${EMAIL_DOMAIN}`))).map((r) => r.id);
}
async function cleanup() {
  const ids = await myUserIds();
  if (!ids.length) return;
  await db.delete(s.messageOutbox).where(inArray(s.messageOutbox.userId, ids));
  await db.delete(s.mobileVerificationCodes).where(inArray(s.mobileVerificationCodes.userId, ids));
  await db.delete(s.pendingMobileVerifications).where(inArray(s.pendingMobileVerifications.userId, ids));
  await db.delete(s.emailVerificationTokens).where(inArray(s.emailVerificationTokens.userId, ids));
  await db.delete(s.sessions).where(inArray(s.sessions.userId, ids));
  await db.delete(s.auditLogs).where(inArray(s.auditLogs.actorId, ids));
  await db.delete(s.users).where(inArray(s.users.id, ids));
}
async function outboxSms(userId: string) {
  return (await db.select().from(s.messageOutbox).where(and(eq(s.messageOutbox.userId, userId), eq(s.messageOutbox.channel, "sms")))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
const codeOf = (body: string) => body.match(/(\d{6})/)?.[1] ?? "";

/** Drives a full registration and returns { userId, url, code, token }. */
async function register(mobile: string, email = unique()) {
  const url = await redirectOf(() => registerAction({}, form({ firstName: "فعال", lastName: "آزمونی", email, password: "Passw0rd! secure", confirmation: "Passw0rd! secure", mobile })));
  const token = url.split("/").pop()!;
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);
  const messages = await outboxSms(user.id);
  return { email, mobile, userId: user.id, url, token, code: codeOf(messages.at(-1)!.body), messages };
}

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(cleanup);
afterAll(async () => { vi.unstubAllGlobals(); await cleanup(); await closeDb(); });

describe("ثبت‌نام با دروازه تأیید موبایل", () => {
  it("حساب جدید غیرفعال می‌ماند و کد ۶ رقمی به صندوق پیامک می‌رود", async () => {
    const { userId, url, code, messages } = await register("09121110000");
    expect(url).toMatch(/^\/register\/verify\/[a-f0-9]{64}$/);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
    expect(user.phone).toBe("09121110000");
    expect(user.mobileVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(messages.at(-1)!.recipient).toBe("09121110000");
    expect(messages.at(-1)!.body).toContain(code);
    expect(f).toBeDefined();
  });

  it("موبایل با +98 و فاصله هم نرمال‌سازی و ذخیره می‌شود", async () => {
    const { userId } = await register("+98 912 111 0001");
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.phone).toBe("09121110001");
  });

  it("شماره نامعتبر ثبت‌نام را رد می‌کند و حسابی ساخته نمی‌شود", async () => {
    const before = (await myUserIds()).length;
    const state = await registerAction({}, form({ firstName: "فعال", lastName: "آزمونی", email: unique(), password: "Passw0rd! secure", confirmation: "Passw0rd! secure", mobile: "12345" }));
    expect(state.error).toContain("موبایل");
    expect((await myUserIds()).length).toBe(before);
  });

  it("کد نادرست حساب را فعال نمی‌کند و تلاش‌ها را می‌شمارد", async () => {
    const { userId, token, code } = await register("09121110002");
    const state = await verifyRegistrationMobileAction({}, form({ token, code: code === "111111" ? "222222" : "111111" }));
    expect(state.error).toContain("نادرست");
    expect(state.error).toContain("۴");
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
    const [row] = await db.select().from(s.mobileVerificationCodes).where(eq(s.mobileVerificationCodes.userId, userId));
    expect(row.attempts).toBe(1);
  });

  it("کد درست حساب را فعال می‌کند، نشست می‌سازد و به داشبورد می‌رود", async () => {
    const { userId, token, code } = await register("09121110003");
    const url = await redirectOf(() => verifyRegistrationMobileAction({}, form({ token, code })));
    expect(url).toBe("/dashboard?welcome=1");
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(true);
    expect(user.mobileVerifiedAt).not.toBeNull();
    const session = await getCurrentUser();
    expect(session?.id).toBe(userId);
  });

  it("کد مصرف‌شده دوباره پذیرفته نمی‌شود؛ حساب فعال به ورود می‌رود", async () => {
    const { token, code } = await register("09121110004");
    await redirectOf(() => verifyRegistrationMobileAction({}, form({ token, code })));
    const url = await redirectOf(() => verifyRegistrationMobileAction({}, form({ token, code })));
    expect(url).toBe("/login");
    const [row] = await db.select().from(s.mobileVerificationCodes).where(and(eq(s.mobileVerificationCodes.userId, (await myUserIds())[0]), eq(s.mobileVerificationCodes.mobile, "09121110004")));
    expect(row.usedAt).not.toBeNull();
  });

  it("کد منقضی‌شده پذیرفته نمی‌شود", async () => {
    const { userId, token, code } = await register("09121110005");
    await db.update(s.mobileVerificationCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.mobileVerificationCodes.userId, userId));
    const state = await verifyRegistrationMobileAction({}, form({ token, code }));
    expect(state.error).toContain("منقضی");
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
  });

  it("پنج تلاش ناموفق کد را قفل می‌کند", async () => {
    const { userId, token, code } = await register("09121110006");
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 4; i++) {
      const state = await verifyRegistrationMobileAction({}, form({ token, code: wrong }));
      expect(state.error).toContain("نادرست");
    }
    const state = await verifyRegistrationMobileAction({}, form({ token, code: wrong }));
    expect(state.error).toContain("غیرفعال شد");
    // Even the correct code no longer passes after the lock-out.
    const locked = await verifyRegistrationMobileAction({}, form({ token, code }));
    expect(locked.error).toBeTruthy();
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
  });
});

describe("ارسال دوباره کد تأیید", () => {
  it("درفاصله خنک، کد جدید ارسال نمی‌شود", async () => {
    const { userId, token } = await register("09121110007");
    const before = (await outboxSms(userId)).length;
    const state = await resendRegistrationMobileAction({}, form({ token }));
    expect(state.success).toContain("چند لحظه");
    expect((await outboxSms(userId)).length).toBe(before);
  });

  it("پس از گذشت درفاصله، کد تازه جایگزین می‌شود و همان کد کار می‌کند", async () => {
    const { userId, token, code } = await register("09121110008");
    await db.update(s.mobileVerificationCodes).set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) }).where(eq(s.mobileVerificationCodes.userId, userId));
    const state = await resendRegistrationMobileAction({}, form({ token }));
    expect(state.success).toContain("جدید");
    const messages = await outboxSms(userId);
    expect(messages.length).toBe(2);
    const newCode = codeOf(messages.at(-1)!.body);
    expect(newCode).toMatch(/^\d{6}$/);
    // The old code is gone — replaced, not just consumed; the fresh one works.
    const oldTry = await verifyRegistrationMobileAction({}, form({ token, code }));
    expect(oldTry.error).toContain("نادرست");
    const url = await redirectOf(() => verifyRegistrationMobileAction({}, form({ token, code: newCode })));
    expect(url).toBe("/dashboard?welcome=1");
  });
});

describe("بازیابی حساب در انتظار تأیید از مسیر ورود", () => {
  it("ورود با گذرواژه درست، حساب در انتظار را به صفحه کد می‌برد", async () => {
    const { email, userId } = await register("09121110009");
    const url = await redirectOf(() => loginAction({}, form({ identifier: email, password: "Passw0rd! secure" })));
    expect(url).toMatch(/^\/register\/verify\/[a-f0-9]{64}$/);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
    const session = await getCurrentUser();
    expect(session).toBeNull();
  });

  it("ورود با شماره موبایل هم کار می‌کند (مسیر شناسه موبایل)", async () => {
    const { mobile, userId } = await register("09121110013");
    const url = await redirectOf(() => loginAction({}, form({ identifier: mobile, password: "Passw0rd! secure" })));
    expect(url).toMatch(/^\/register\/verify\/[a-f0-9]{64}$/);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
    expect(user.active).toBe(false);
  });

  it("درفاصله خنک پیامک تازه نمی‌رود ولی پس از آن می‌رود", async () => {
    const { mobile, userId } = await register("09121110010");
    await redirectOf(() => loginAction({}, form({ identifier: mobile, password: "Passw0rd! secure" })));
    expect((await outboxSms(userId)).length).toBe(1);
    await db.update(s.mobileVerificationCodes).set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) }).where(eq(s.mobileVerificationCodes.userId, userId));
    await redirectOf(() => loginAction({}, form({ identifier: mobile, password: "Passw0rd! secure" })));
    expect((await outboxSms(userId)).length).toBe(2);
  });

  it("حساب غیرفعال‌شدهٔ تأییدشده با همان پیام خطا روبه‌رو می‌شود", async () => {
    const email = unique();
    await db.insert(s.users).values({ fullName: "فعال متوقف", email, passwordHash: "scrypt$00000000000000000000000000000000$" + "00".repeat(64), role: "activist", phone: "09121110011", active: false, mobileVerifiedAt: new Date() });
    const state = await loginAction({}, form({ identifier: email, password: "whatever-long-password" }));
    expect(state.error).toContain("غیرفعال");
    expect(state.mfaToken).toBeUndefined();
  });
});

describe("حالت بدون دروازه پیامک (دمو/محلی)", () => {
  it("بدون سرویس پیامک، حساب فوراً فعال می‌شود و به داشبورد می‌رود", async () => {
    const { PAYAMAK_PANEL_USERNAME, PAYAMAK_PANEL_PASSWORD, PAYAMAK_PANEL_API_KEY } = process.env;
    delete process.env.PAYAMAK_PANEL_USERNAME;
    delete process.env.PAYAMAK_PANEL_PASSWORD;
    delete process.env.PAYAMAK_PANEL_API_KEY;
    // Registration without any e-mail at all (مرحله دوم: email is optional).
    const mobile = "09121110012";
    try {
      const url = await redirectOf(() => registerAction({}, form({ firstName: "فعال", lastName: "محلی", password: "Passw0rd! secure", confirmation: "Passw0rd! secure", mobile })));
      expect(url).toBe("/dashboard?welcome=1");
      const [user] = await db.select().from(s.users).where(eq(s.users.phone, mobile));
      expect(user.active).toBe(true);
      expect(user.email).toBeNull();
      expect(user.firstName).toBe("فعال");
      expect(user.lastName).toBe("محلی");
      expect(user.fullName).toBe("فعال محلی");
      expect(user.phone).toBe(mobile);
    } finally {
      // The email-less account cannot be found by the email-based cleanup, so
      // it is removed here — otherwise re-running the suite collides on the
      // unique phone index.
      const [leftover] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, mobile));
      if (leftover) {
        await db.delete(s.messageOutbox).where(eq(s.messageOutbox.userId, leftover.id));
        await db.delete(s.mobileVerificationCodes).where(eq(s.mobileVerificationCodes.userId, leftover.id));
        await db.delete(s.pendingMobileVerifications).where(eq(s.pendingMobileVerifications.userId, leftover.id));
        await db.delete(s.emailVerificationTokens).where(eq(s.emailVerificationTokens.userId, leftover.id));
        await db.delete(s.sessions).where(eq(s.sessions.userId, leftover.id));
        await db.delete(s.auditLogs).where(eq(s.auditLogs.actorId, leftover.id));
        await db.delete(s.loginAttempts).where(inArray(s.loginAttempts.identityHash, await Promise.all([throttleKey(`register:${mobile}`), throttleKey(`register-mobile:${mobile}`)])));
        await db.delete(s.users).where(eq(s.users.id, leftover.id));
      }
      process.env.PAYAMAK_PANEL_USERNAME = PAYAMAK_PANEL_USERNAME;
      if (PAYAMAK_PANEL_PASSWORD) process.env.PAYAMAK_PANEL_PASSWORD = PAYAMAK_PANEL_PASSWORD;
      if (PAYAMAK_PANEL_API_KEY) process.env.PAYAMAK_PANEL_API_KEY = PAYAMAK_PANEL_API_KEY;
    }
  });
});

describe("کمک‌تابع‌های نمایش و اعتبارسنجی", () => {
  it("maskMobile شماره را برای نمایش امن می‌کند", () => {
    expect(maskMobile("09121110000")).toBe("0912***000");
    expect(maskMobile("0912")).toBe("••••");
  });
  it("validIranMobile فقط قالب ۰۹xxxxxxxxx را می‌پذیرد", () => {
    expect(validIranMobile("09121110000")).toBe(true);
    expect(validIranMobile("0912111000")).toBe(false);
    expect(validIranMobile("989121110000")).toBe(false);
    expect(validIranMobile("")).toBe(false);
  });
  it("متن پیامک کد را همراه هشدار محرمانگی می‌فرستد", () => {
    const sms = mobileVerificationSms("۱۲۳۴۵۶".replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    expect(sms.body).toContain("123456");
    expect(sms.body).toContain("۱۰ دقیقه");
  });
});
