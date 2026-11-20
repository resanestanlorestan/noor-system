// Feature tests for الحاقیهٔ ۲.۱۷.۰ — حذف یکپارچهٔ حساب کاربر از مدیریت کاربران:
// با حذف حساب، پرونده و همهٔ اطلاعات و مدارک وابسته در یک تراکنش کامل حذف
// می‌شود، فایل‌های فیزیکی پاک می‌شوند، کد ملی و شمارهٔ موبایل آزاد می‌شود و
// ثبت‌نام مجدد با همان کد ملی و موبایل بدون خطای تکراری انجام می‌شود.
// اگر کاربر در پروندهٔ «دیگران» نقش داشته باشد، دادهٔ خودش کامل پاک ولی ردیف
// حساب با حفظ زنجیرهٔ ممیزی گمنام می‌شود.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, pdfFile, pngFile, FEATURE_PASSWORD, nationalId,
  type Fixture, type UserKey,
} from "./helpers";
import { hashPassword } from "@/lib/auth";
import { registerAction } from "@/app/actions/auth";
import { deleteUserAction } from "@/app/actions/management";
import { uploadDocumentAction, uploadPhotoAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { privateDir } from "@/lib/local-secrets";

let f: Fixture;
beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  // حساب‌های ساخته‌شده در این آزمون‌ها با خودِ حذف یکپارچه پاک شده‌اند؛ فقط
  // باقی‌مانده‌های مسیر گمنام (در صورت شکست میانهٔ آزمون) پاک می‌شوند.
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

const SCENARIO_PHONE = "09354445566";
const SCENARIO_NI = nationalId("445556677");

const accountForm = () => form({
  firstName: "مریم", lastName: "پاک‌شو", mobile: SCENARIO_PHONE,
  password: FEATURE_PASSWORD, confirmation: FEATURE_PASSWORD,
});

/** ثبت‌نام عمومی و برگرداندن شناسهٔ حساب تازه. */
async function registerScenarioUser(): Promise<string> {
  const url = await redirectOf(() => registerAction({}, accountForm()));
  expect(url.startsWith("/dashboard")).toBe(true);
  const [row] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.phone, SCENARIO_PHONE)).orderBy(s.users.createdAt);
  return track(row.id);
}

describe("حذف یکپارچهٔ حساب کاربر و ثبت‌نام مجدد (الحاقیهٔ ۲.۱۷.۰)", () => {
  it("سناریوی کامل: ثبت‌نام → پرونده با اطلاعات و مدارک → حذف حساب → پاک‌شدن همهٔ داده‌ها و فایل‌ها → ثبت‌نام مجدد با همان کد ملی و موبایل", async () => {
    // گام ۱ — ثبت‌نام کاربر با شمارهٔ موبایل مشخص
    const first = await registerScenarioUser();
    // گام ۲ — پروندهٔ او با اطلاعات هویتی و مدارک مختلف (مدرک + تصویر پرسنلی)
    const caseUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: SCENARIO_NI, phone: SCENARIO_PHONE })));
    const caseId = caseIdOf(caseUrl);
    const doc = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile("madark.pdf") }));
    expect(doc.error).toBeUndefined();
    const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photo.error).toBeUndefined();
    const docRows = await db.select({ id: s.documents.id, key: s.documents.storageKey }).from(s.documents).where(eq(s.documents.applicationId, caseId));
    expect(docRows.length).toBe(2);
    const filePaths = docRows.map((row) => path.join(privateDir, "uploads", row.key));
    expect(filePaths.every((file) => existsSync(file))).toBe(true);
    // گام ۳ — مدیر کل حساب را از مدیریت کاربران حذف می‌کند
    await loginAs("super");
    const url = await redirectOf(() => deleteUserAction(form({ userId: first })));
    expect(messageOf(url)).toContain("کامل حذف شد");
    expect(messageOf(url)).toContain("ثبت‌نام مجدد");
    // گام ۴ — همهٔ اطلاعات وابسته در بخش‌های دیگر پاک شده‌اند
    expect((await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, first)))).toHaveLength(0);
    expect((await db.select({ id: s.activists.id }).from(s.activists).where(eq(s.activists.userId, first)))).toHaveLength(0);
    expect((await db.select({ id: s.applications.id }).from(s.applications).where(eq(s.applications.id, caseId)))).toHaveLength(0);
    expect((await db.select({ id: s.documents.id }).from(s.documents).where(eq(s.documents.applicationId, caseId)))).toHaveLength(0);
    expect((await db.select({ token: s.sessions.tokenHash }).from(s.sessions).where(eq(s.sessions.userId, first)))).toHaveLength(0);
    expect((await db.select({ id: s.messageOutbox.id }).from(s.messageOutbox).where(eq(s.messageOutbox.userId, first)))).toHaveLength(0);
    // فایل‌های فیزیکی مدارک هم از دیسک پاک شده‌اند
    expect(filePaths.some((file) => existsSync(file))).toBe(false);
    // گام ۵ و ۶ — ثبت‌نام مجدد با همان موبایل و پروندهٔ تازه با همان کد ملی، بدون خطای تکراری
    const reRegistered = await redirectOf(() => registerAction({}, accountForm()));
    expect(reRegistered.startsWith("/dashboard")).toBe(true);
    const rows = await db.select({ id: s.users.id, createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.phone, SCENARIO_PHONE)).orderBy(s.users.createdAt);
    expect(rows.length).toBe(1); // ردیف قبلی کامل حذف شده؛ فقط حساب تازه هست
    const second = track(rows[0].id);
    expect(second).not.toBe(first);
    const reCaseUrl = await redirectOf(() => saveCaseCore(completeProfile(f, { nationalId: SCENARIO_NI, phone: SCENARIO_PHONE })));
    expect(caseIdOf(reCaseUrl)).not.toBe(caseId);
    // پاک‌سازی نهایی سناریو برای شفافیت بانک آزمون
    await loginAs("super");
    const cleanupUrl = await redirectOf(() => deleteUserAction(form({ userId: second })));
    expect(messageOf(cleanupUrl)).toContain("کامل حذف شد");
  }, 90_000);

  it("کاربر نقش‌داشته در پروندهٔ دیگران: دادهٔ خودش کامل پاک، حساب گمنام، دادهٔ دیگران دست‌نخورده و ثبت‌نام مجدد ممکن", async () => {
    // پروندهٔ متعلق به کاربر «act» فیکسچر
    await loginAs("act");
    const caseUrl = await redirectOf(() => saveCaseCore(completeProfile(f)));
    const caseId = caseIdOf(caseUrl);
    // کاربر آزمونی به‌عنوان کارشناس همان پرونده منصوب می‌شود — زنجیرهٔ کاری دیگران
    const phone2 = "09355556677";
    const [target] = await db.insert(s.users).values({
      fullName: "کارشناس آزمون", firstName: "کارشناس", lastName: "آزمون",
      phone: phone2, role: "reviewer", passwordHash: await hashPassword(FEATURE_PASSWORD),
    }).returning({ id: s.users.id });
    track(target.id);
    await db.update(s.applications).set({ assignedExpertId: target.id }).where(eq(s.applications.id, caseId));
    // دادهٔ شخصی حساب کارشناس که باید با حذف کامل پاک شود
    await db.insert(s.notifications).values({ userId: target.id, title: "اعلان آزمون", body: "بدنهٔ اعلان آزمون" });
    await loginAs("super");
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(url)).toContain("محو");
    const [row] = await db.select().from(s.users).where(eq(s.users.id, target.id));
    expect(row.deletedAt).not.toBeNull();
    expect(row.phone).toBeNull();
    expect(row.active).toBe(false);
    // دادهٔ شخصی و اعلان‌های او کامل پاک شده است
    expect((await db.select({ id: s.notifications.id }).from(s.notifications).where(eq(s.notifications.userId, target.id)))).toHaveLength(0);
    // پروندهٔ کاربر دیگر و ارجاع کارشناسی آن دست‌نخورده مانده‌اند
    const [app] = await db.select({ expert: s.applications.assignedExpertId }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(app.expert).toBe(target.id);
    // ثبت‌نام مجدد با همان شمارهٔ موبایل ممکن است (حساب گمنام شماره ندارد)
    const reUrl = await redirectOf(() => registerAction({}, form({
      firstName: "کارشناس", lastName: "تازه", mobile: phone2,
      password: FEATURE_PASSWORD, confirmation: FEATURE_PASSWORD,
    })));
    expect(reUrl.startsWith("/dashboard")).toBe(true);
    const twins = await db.select({ id: s.users.id, phone: s.users.phone }).from(s.users).where(eq(s.users.phone, phone2));
    expect(twins.length).toBe(1); // فقط حساب تازه شماره دارد؛ گمنام شماره‌اش پاک شده
    track(twins[0].id);
    // آزادسازی ارجاع کاری پروندهٔ فیکسچر به حساب گمنام‌شده برای پاک‌سازی امن
    await db.update(s.applications).set({ assignedExpertId: null }).where(eq(s.applications.id, caseId));
  }, 90_000);
});
