// آزمون‌های الحاقیهٔ ۲.۱۸.۷ — خروج خودکار در صورت عدم فعالیت (Idle Session Timeout):
// ۱) منطق سقف بی‌فعالیتی (مرز دقیق ۱۵ دقیقه)؛ ۲) بطلان سرسویی نشست کهنه در
// getCurrentUser با ممیزی؛ ۳) نبض pingSession (تمدید سالم / بطلان کهنه)؛
// ۴) خروج idleLogout با حذف امن نشست، پاک‌سازی کوکی و ثبت idle_logout؛
// ۵) آستانهٔ ۳۰ ثانیه‌ای تمدید: درخواست پیاپیِ تازه lastSeenAt را بازنویسی نمی‌کند.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { closeDb, featureSeed, type Fixture } from "./feature/helpers";
import { createSession, getCurrentUser, idleLogout, pingSession } from "@/lib/auth";
import { IDLE_TIMEOUT_MINUTES, IDLE_TIMEOUT_MS, isSessionIdle } from "@/lib/session-timeout";

let f: Fixture;
beforeAll(async () => { f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

const stale = (extraMs: number) => new Date(Date.now() - IDLE_TIMEOUT_MS - extraMs);

async function sessionRow(tokenHashOf?: string) {
  if (!tokenHashOf) return null;
  const [row] = await db.select().from(s.sessions).where(eq(s.sessions.tokenHash, tokenHashOf)).limit(1);
  return row ?? null;
}

describe("سقف بی‌فعالیتی — منطق پایه", () => {
  it("پیش‌فرض ۱۵ دقیقه است و مرز دقیق سقف، نشست را کهنه اعلام می‌کند", () => {
    expect(IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    const base = new Date("2026-01-01T10:00:00Z");
    expect(isSessionIdle(new Date(base.getTime() - IDLE_TIMEOUT_MS + 1), base)).toBe(false);
    expect(isSessionIdle(new Date(base.getTime() - IDLE_TIMEOUT_MS), base)).toBe(true);
    expect(isSessionIdle(new Date(base.getTime() - IDLE_TIMEOUT_MS - 1), base)).toBe(true);
  });
  it("سقف سفارشی هم پذیرفته می‌شود (آمادهٔ تنظیم از داشبورد در آینده)", () => {
    const base = new Date("2026-01-01T10:00:00Z");
    expect(isSessionIdle(new Date(base.getTime() - 30 * 60 * 1000), base, 30 * 60 * 1000)).toBe(true);
    expect(isSessionIdle(new Date(base.getTime() - 30 * 60 * 1000), base, 45 * 60 * 1000)).toBe(false);
  });
});

describe("بطلان سرسویی نشست کهنه و تمدید نشست تازه", () => {
  it("نشست تازه معتبر می‌ماند؛ نشستِ گذشته از سقف در getCurrentUser باطل و ممیزی می‌شود", async () => {
    const user = f.users.super;
    await createSession(user.id);
    expect(await getCurrentUser()).toBeTruthy();

    const [fresh] = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id)).orderBy(desc(s.sessions.createdAt)).limit(1);
    await db.update(s.sessions).set({ lastSeenAt: stale(60_000) }).where(eq(s.sessions.tokenHash, fresh!.tokenHash));

    expect(await getCurrentUser()).toBeNull();
    expect(await sessionRow(fresh!.tokenHash)).toBeNull();
    const [auditRow] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "idle_session_invalidated")).orderBy(desc(s.auditLogs.id)).limit(1);
    expect(auditRow?.actorId).toBe(user.id);
  });

  it("درخواست پیاپی زیر ۳۰ ثانیه، lastSeenAt را بازنویسی نمی‌کند (کاهش نوشتن با هر پیمایش)", async () => {
    const user = f.users.prov;
    await createSession(user.id);
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    const [row] = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id)).orderBy(desc(s.sessions.createdAt)).limit(1);
    await db.update(s.sessions).set({ lastSeenAt: tenSecondsAgo }).where(eq(s.sessions.tokenHash, row!.tokenHash));

    expect(await getCurrentUser()).toBeTruthy();
    const after = await sessionRow(row!.tokenHash);
    expect(after).toBeTruthy();
    expect(Math.abs(after!.lastSeenAt.getTime() - tenSecondsAgo.getTime())).toBeLessThan(5_000);
  });
});

describe("نبض نشست (pingSession)", () => {
  it("نشست سالم تمدید می‌شود و زمان باقی‌ماندهٔ نزدیک به سقف برمی‌گرداند", async () => {
    const user = f.users.rev;
    await createSession(user.id);
    const result = await pingSession();
    expect(result.ok).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(IDLE_TIMEOUT_MS - 10_000);
    expect(result.remainingMs).toBeLessThanOrEqual(IDLE_TIMEOUT_MS);
  });

  it("نشست گذشته از سقف در نبض هم باطل می‌شود و پاسخ ناموفق است", async () => {
    const user = f.users.spec;
    await createSession(user.id);
    const [row] = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id)).orderBy(desc(s.sessions.createdAt)).limit(1);
    await db.update(s.sessions).set({ lastSeenAt: stale(1_000) }).where(eq(s.sessions.tokenHash, row!.tokenHash));

    const result = await pingSession();
    expect(result).toEqual({ ok: false, remainingMs: 0 });
    expect(await sessionRow(row!.tokenHash)).toBeNull();
  });
});

describe("خروج خودکار (idleLogout)", () => {
  it("نشست حذف، کوکی پاک و idle_logout ممیزی می‌شود؛ دسترسی بعدی به ورود هدایت می‌شود", async () => {
    const user = f.users.act;
    await createSession(user.id);
    const [row] = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id)).orderBy(desc(s.sessions.createdAt)).limit(1);
    expect(row).toBeTruthy();

    const result = await idleLogout("idle");
    expect(result).toEqual({ ok: true });
    expect(await sessionRow(row!.tokenHash)).toBeNull();
    const [auditRow] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "idle_logout")).orderBy(desc(s.auditLogs.id)).limit(1);
    expect(auditRow?.actorId).toBe(user.id);
    expect(await getCurrentUser()).toBeNull();
  });

  it("خروج برای نشست ناموجود هم بی‌خطر است (پاک‌سازی کوکی)", async () => {
    expect(await idleLogout("manual")).toEqual({ ok: true });
    expect(await getCurrentUser()).toBeNull();
  });
});
