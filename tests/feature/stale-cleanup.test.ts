// Feature tests for الحاقیهٔ ۲.۱۷.۱ — پاکسازی داده‌های جاماندهٔ حذف‌های کد قدیمی:
// حسابی که پیش از ۲.۱۷.۰ حذف/گمنام شده ولی رکورد فعال و پروندهٔ او پاک نشده،
// با اجرای دوبارهٔ «حذف حساب کاربر» کامل پاک می‌شود و کد ملی/موبایل آزاد می‌ماند؛
// حسابِ حذف‌شدهٔ بی‌دادهٔ جامانده همچنان رد می‌شود تا ممیزی دست‌نخورد؛ و جاروب
// «سweep» رکوردهای فعالِ بدون مالکِ زنده و بدون پروندهٔ فعال فقط همان‌ها را
// نرم‌حذفِ قابل بازیابی می‌کند تا قید یکتای کد ملی رکوردهای تازه را نپذیرد.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, nationalId, FEATURE_PASSWORD, type Fixture,
} from "./helpers";
import { registerAction } from "@/app/actions/auth";
import { deleteUserAction, sweepStaleActivistsAction } from "@/app/actions/management";
import { saveCaseCore } from "@/lib/case-save";

let f: Fixture;
beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  // حساب‌های ساخته‌شده در مسیر موفق با خودِ حذف یکپارچه پاک شده‌اند؛ فقط
  // باقی‌مانده‌های مسیر ردشده (در صورت شکست میانهٔ آزمون) پاک می‌شوند.
  if (trackedIds.length) {
    await db.delete(s.auditLogs).where(or(inArray(s.auditLogs.actorId, trackedIds), inArray(s.auditLogs.targetId, trackedIds)));
    await db.delete(s.sessions).where(inArray(s.sessions.userId, trackedIds));
    await db.delete(s.notifications).where(inArray(s.notifications.userId, trackedIds));
    await db.delete(s.users).where(inArray(s.users.id, trackedIds));
  }
  await closeDb();
});

const trackedIds: string[] = [];
const track = (id: string) => { trackedIds.push(id); return id; };

const SCENARIO_PHONE = "09357778899";
const SCENARIO_NI = nationalId("556677881");
const STALE_NO_DATA_PHONE = "09358889900";
const ORPHAN_NI = nationalId("667788990");
const OWNED_LIVE_NI = nationalId("778899101");
const ACTIVE_CASE_NI = nationalId("889910112");

const accountForm = (phone = SCENARIO_PHONE) => form({
  firstName: "سعید", lastName: "جامانده", mobile: phone,
  password: FEATURE_PASSWORD, confirmation: FEATURE_PASSWORD,
});

/** ثبت‌نام عمومی و برگرداندن شناسهٔ حساب تازه. */
async function registerScenarioUser(phone = SCENARIO_PHONE): Promise<string> {
  const url = await redirectOf(() => registerAction({}, accountForm(phone)));
  expect(url.startsWith("/dashboard")).toBe(true);
  const [row] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, phone)).orderBy(s.users.createdAt);
  return track(row.id);
}

describe("پاکسازی داده‌های جاماندهٔ حذف‌های کد قدیمی (الحاقیهٔ ۲.۱۷.۱)", () => {
  it("حساب حذف‌شده با رکورد فعالِ جامانده: اجرای دوبارهٔ حذف، همهٔ داده را پاک و کد ملی را برای ثبت‌نام مجدد آزاد می‌کند", async () => {
    // گام ۱ — ثبت‌نام و پرونده با کد ملی مشخص
    const first = await registerScenarioUser();
    const caseUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: SCENARIO_NI, phone: SCENARIO_PHONE })));
    const caseId = caseIdOf(caseUrl);
    // گام ۲ — شبیه‌سازی کد قدیمی (پیش از ۲.۱۷.۰): فقط گمنام‌سازی حساب، بدون پاکسازی داده
    await db.update(s.users).set({
      fullName: "حساب حذف‌شده (stale01)", email: null, phone: null, active: false, deletedAt: new Date(),
    }).where(eq(s.users.id, first));
    // گام ۳ — مدیر ارشد همان اکشن «حذف حساب کاربر» را برای حساب stale اجرا می‌کند
    await loginAs("super");
    const url = await redirectOf(() => deleteUserAction(form({ userId: first })));
    expect(messageOf(url)).toContain("جامانده");
    expect(messageOf(url)).toContain("ثبت‌نام مجدد");
    // گام ۴ — حساب و همهٔ داده‌های جامانده کامل پاک شده‌اند
    expect((await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, first)))).toHaveLength(0);
    expect((await db.select({ id: s.activists.id }).from(s.activists).where(eq(s.activists.userId, first)))).toHaveLength(0);
    expect((await db.select({ id: s.applications.id }).from(s.applications).where(eq(s.applications.id, caseId)))).toHaveLength(0);
    // گام ۵ — ثبت‌نام مجدد با همان موبایل و پروندهٔ تازه با همان کد ملی
    const reUrl = await redirectOf(() => registerAction({}, accountForm()));
    expect(reUrl.startsWith("/dashboard")).toBe(true);
    const [fresh] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, SCENARIO_PHONE));
    track(fresh.id);
    const reCaseUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: SCENARIO_NI, phone: SCENARIO_PHONE })));
    expect(caseIdOf(reCaseUrl)).not.toBe(caseId);
    // پاک‌سازی نهایی سناریو
    await loginAs("super");
    const cleanupUrl = await redirectOf(() => deleteUserAction(form({ userId: fresh.id })));
    expect(messageOf(cleanupUrl)).toContain("کامل حذف شد");
  }, 60_000);

  it("حساب حذف‌شده بدون دادهٔ جامانده: پیام رد با ذکر نبود دادهٔ جامانده و حفظ ردیف ممیزی", async () => {
    const second = await registerScenarioUser(STALE_NO_DATA_PHONE);
    await db.update(s.users).set({ deletedAt: new Date(), active: false, phone: null }).where(eq(s.users.id, second));
    await loginAs("super");
    const url = await redirectOf(() => deleteUserAction(form({ userId: second })));
    expect(messageOf(url)).toContain("برای پاکسازی ندارد");
    // ردیف حساب همچنان حفظ شده است
    const [row] = await db.select({ deletedAt: s.users.deletedAt }).from(s.users).where(eq(s.users.id, second));
    expect(row.deletedAt).not.toBeNull();
  }, 30_000);

  it("جاروب: فقط رکورد فعالِ بدون مالکِ زنده و بدون پروندهٔ فعال نرم‌حذف می‌شود و کد ملی‌اش آزاد می‌ماند", async () => {
    await loginAs("super");
    // رکورد بدون مالک (ایجادشدهٔ مدیر) با پروندهٔ نرم‌حذف‌شده — بازماندهٔ کد قدیمی
    // هر پرونده نام و موبایل یکتا دارد تا هشدار تکراری‌یاب مسیر را قطع نکند.
    const orphUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: ORPHAN_NI, phone: "09357111001", firstName: "بی", lastName: "مالک" })));
    const orphCaseId = caseIdOf(orphUrl);
    await db.update(s.applications).set({ deletedAt: new Date() }).where(eq(s.applications.id, orphCaseId));
    // رکورد با مالکِ زنده و پروندهٔ نرم‌حذف‌شده — نباید جاروب شود
    await loginAs("act");
    const ownedUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: OWNED_LIVE_NI, phone: "09357111002", firstName: "مالک", lastName: "زنده" })));
    const ownedCaseId = caseIdOf(ownedUrl);
    await db.update(s.applications).set({ deletedAt: new Date() }).where(eq(s.applications.id, ownedCaseId));
    // رکورد بدون مالک با پروندهٔ فعال — نباید جاروب شود
    await loginAs("super");
    const activeUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: ACTIVE_CASE_NI, phone: "09357111003", firstName: "پرونده", lastName: "فعال" })));
    const activeCaseId = caseIdOf(activeUrl);
    // جاروب
    const url = await redirectOf(() => sweepStaleActivistsAction(form({})));
    expect(messageOf(url)).toContain("نرم‌حذفِ قابل بازیابی");
    // فقط رکورد بدون مالک و بدون پروندهٔ فعال نرم‌حذف شده است
    const [orphanRow] = await db.select({ deletedAt: s.activists.deletedAt }).from(s.activists).where(eq(s.activists.nationalIdLast4, ORPHAN_NI.slice(-4)));
    expect(orphanRow.deletedAt).not.toBeNull();
    const [ownedRow] = await db.select({ deletedAt: s.activists.deletedAt }).from(s.activists).where(eq(s.activists.nationalIdLast4, OWNED_LIVE_NI.slice(-4)));
    expect(ownedRow.deletedAt).toBeNull();
    const [activeRow] = await db.select({ deletedAt: s.activists.deletedAt }).from(s.activists).where(eq(s.activists.nationalIdLast4, ACTIVE_CASE_NI.slice(-4)));
    expect(activeRow.deletedAt).toBeNull();
    // آزاد شدن کد ملی: ثبت پروندهٔ تازه با همان کد ملی ممکن است
    const reUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: ORPHAN_NI, phone: "09357111004", firstName: "بی", lastName: "دوم" })));
    expect(caseIdOf(reUrl)).not.toBe(orphCaseId);
    // جاروب دوباره: چیزی برای پاکسازی نمانده است
    const againUrl = await redirectOf(() => sweepStaleActivistsAction(form({})));
    expect(messageOf(againUrl)).toContain("پیدا نشد");
    // باقی‌مانده‌ها بی‌ضررند: resetCaseData فایل‌های بعدی و setup-feature-db.js
    // در هر اجرا از صفر می‌سازند.
  }, 60_000);
});
