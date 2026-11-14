// Feature tests for الحاقیهٔ ۲.۱۰.۰ — قفل مراحل ثبت اطلاعات.
// بخش نخست: موتور ناب وضعیت مراحل (computeCaseSteps / stepGateError /
// firstIncompleteMessage) بدون پایگاه‌داده؛ بخش دوم: زنجیرهٔ واقعی ویزارد با
// اکشن‌های سرور روی پایگاه‌دادهٔ noor_feature — فراخوانی مستقیم اکشن مرحلهٔ بعد،
// آپلود زودهنگام مدرک/تصویر و ارسال ناقص باید از سمت سرور رد شود و ذخیرهٔ
// موفق هر مرحله فقط گام بعدی را باز کند.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, form, pdfFile, pngFile, completeProfile,
  featureSeed, loginAs, resetCaseData, closeDb, type Fixture,
} from "./helpers";
import {
  CASE_STEPS, computeCaseSteps, firstIncompleteMessage, stepGateError,
  loadCaseStepFacts, type CaseStepFacts, type CaseStepPlan,
} from "@/lib/case-steps";
import { saveIdentityStepAction, saveLocationStepAction, saveSpecialtiesStepAction } from "@/app/actions/case-steps";
import { prepareCaseAction, submitCaseAction, uploadDocumentAction, uploadPhotoAction } from "@/app/actions/cases";

// ---------------- بخش نخست: موتور ناب وضعیت مراحل ----------------

type Person = CaseStepFacts["person"];

const person = (overrides: Partial<Person> = {}): Person => ({
  firstName: "", lastName: "", fatherName: null, nationalIdHash: null, idCardNumber: null,
  idIssuePlace: null, birthDate: null, gender: null, phone: null, alternatePhone: null,
  provinceId: null, countyId: null, photoDocumentId: null, ...overrides,
});

const facts = (overrides: Partial<Omit<CaseStepFacts, "person">> & { person?: Partial<Person> } = {}): CaseStepFacts => {
  const { person: personOverrides, ...rest } = overrides;
  return {
    status: "draft", person: person(personOverrides), specialtyCount: 0,
    specialtyDetailMissing: [], evidenceCount: 0, photoOk: false, ...rest,
  };
};

/** هویت کامل — هر ۹ قلم الزامی مرحلهٔ ۱ موجود است. */
const fullPerson = (overrides: Partial<Person> = {}) => person({
  firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", nationalIdHash: "a".repeat(64),
  idCardNumber: "1234567", idIssuePlace: "تهران", birthDate: "1375-01-01",
  gender: "female", phone: "09121110001", alternatePhone: "09351110001", ...overrides,
});

const statuses = (plan: CaseStepPlan) => plan.steps.map((step) => step.status);

describe("موتور قفل مراحل — وضعیت‌های چهارگانه", () => {
  it("پیش‌نویس خالی: مرحلهٔ ۱ تکمیل‌نشده و مراحل بعدی قفل است", () => {
    const plan = computeCaseSteps(facts());
    expect(statuses(plan)).toEqual(["incomplete", "locked", "locked", "locked", "locked"]);
    expect(plan.completedCount).toBe(0);
    expect(plan.activeIndex).toBe(0);
    expect(stepGateError(plan, 1)).toContain("اطلاعات هویتی و تماس");
  });

  it("تکمیل جزئی هویتی: «در حال تکمیل» و پیشرفت ۰ از ۵", () => {
    const plan = computeCaseSteps(facts({ person: { firstName: "زهرا", lastName: "موسوی" } }));
    expect(plan.steps[0].status).toBe("in_progress");
    expect(plan.steps[1].status).toBe("locked");
    expect(plan.completedCount).toBe(0);
  });

  it("ذخیرهٔ موفق مرحلهٔ ۱: مرحلهٔ ۲ فعال و مراحل ۳ به بعد قفل می‌مانند", () => {
    const plan = computeCaseSteps(facts({ person: fullPerson() }));
    expect(statuses(plan)).toEqual(["completed", "incomplete", "locked", "locked", "locked"]);
    expect(stepGateError(plan, 1)).toBeNull();
    expect(stepGateError(plan, 2)).toContain("سکونت و محل فعالیت");
    expect(plan.completedCount).toBe(1);
  });

  it("پیمایش کامل زنجیره: هر ذخیرهٔ موفق فقط گام بعدی را باز می‌کند", () => {
    const second = facts({ person: fullPerson({ provinceId: 5, countyId: 7 }) });
    expect(statuses(computeCaseSteps(second))).toEqual(["completed", "completed", "incomplete", "locked", "locked"]);
    expect(stepGateError(computeCaseSteps(second), 3)).toContain("تخصص‌ها، تحصیلات و سوابق");

    const third = facts({ status: "completing", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2 });
    expect(statuses(computeCaseSteps(third))).toEqual(["completed", "completed", "completed", "incomplete", "locked"]);
    expect(stepGateError(computeCaseSteps(third), 4)).toContain("مدارک و تصویر پرسنلی");

    // مدرک بارگذاری شده ولی تصویر پرسنلی نیست: مرحلهٔ ۴ «در حال تکمیل» و گام ۵ هنوز قفل است
    const fourth = facts({ status: "completing", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2, evidenceCount: 1 });
    expect(statuses(computeCaseSteps(fourth))[3]).toBe("in_progress");
    expect(stepGateError(computeCaseSteps(fourth), 4)).toContain("مدارک و تصویر پرسنلی");

    const fifth = facts({ status: "ready", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2, evidenceCount: 1, photoOk: true });
    const finalPlan = computeCaseSteps(fifth);
    expect(statuses(finalPlan)).toEqual(["completed", "completed", "completed", "completed", "in_progress"]);
    expect(firstIncompleteMessage(finalPlan)).toContain("بازبینی و ارسال");
  });

  it("همهٔ مراحل کامل: هر پنج مرحله «تکمیل‌شده» و پیام گارد تهی", () => {
    const plan = computeCaseSteps(facts({ status: "pending", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2, evidenceCount: 1, photoOk: true }));
    expect(statuses(plan)).toEqual(["completed", "completed", "completed", "completed", "completed"]);
    expect(plan.completedCount).toBe(5);
    expect(firstIncompleteMessage(plan)).toBeNull();
    expect(firstIncompleteMessage(plan, "review")).toBeNull();
    expect(stepGateError(plan, 4)).toBeNull();
  });

  it("ویرایش مخل: نقص در مرحلهٔ اول مراحل بعدیِ کامل را «تکمیل‌شده» نگه می‌دارد ولی عبور به جلو قفل می‌شود", () => {
    // دادهٔ قدیمی: پرونده ارسال‌شده و همهٔ مراحل کامل بودند؛ حالا شمارهٔ همراه جایگزین حذف شده است
    const broken = facts({ status: "pending", person: fullPerson({ provinceId: 5, countyId: 7, alternatePhone: null }), specialtyCount: 2, evidenceCount: 1, photoOk: true });
    const plan = computeCaseSteps(broken);
    expect(plan.steps[0].status).toBe("in_progress");
    expect(statuses(plan).slice(1)).toEqual(["completed", "completed", "completed", "completed"]);
    expect(plan.activeIndex).toBe(0);
    // زنجیرهٔ عبور به جلو تا رفع نقص بسته است
    expect(stepGateError(plan, 1)).toContain("ابتدا مرحلهٔ «اطلاعات هویتی و تماس»");
    expect(stepGateError(plan, 4)).toContain("ابتدا مرحلهٔ «اطلاعات هویتی و تماس»");
    expect(firstIncompleteMessage(plan)).toContain("اطلاعات هویتی و تماس");
  });

  it("پیام گارد سروری: نام مرحلهٔ مقصد، نام اولین مرحلهٔ ناقص و موارد ناقص", () => {
    const plan = computeCaseSteps(facts({ person: fullPerson({ fatherName: null }) }));
    const gate = stepGateError(plan, 3, CASE_STEPS[3].title);
    expect(gate).toContain("برای ورود به مرحلهٔ «مدارک و تصویر پرسنلی»");
    expect(gate).toContain("ابتدا مرحلهٔ «اطلاعات هویتی و تماس»");
    expect(gate).toContain("نام پدر");
  });

  it("شمارهٔ مرحلهٔ نامعتبر رد می‌شود", () => {
    const plan = computeCaseSteps(facts());
    expect(stepGateError(plan, -1)).toContain("معتبر نیست");
    expect(stepGateError(plan, 5)).toContain("معتبر نیست");
  });
});

// ---------------- بخش دوم: زنجیرهٔ واقعی روی سرور ----------------

describe("قفل مراحل روی سرور — ویزارد واقعی", () => {
  let f: Fixture;
  beforeAll(async () => { f = await featureSeed(); }, 30_000);
  beforeEach(resetCaseData);
  afterAll(closeDb);

  /** پیش‌نویس تازه با ذخیرهٔ مرحلهٔ هویتی؛ شناسهٔ پرونده را برمی‌گرداند. */
  async function freshCase() {
    await loginAs("act");
    const url = await redirectOf(() => saveIdentityStepAction({}, completeProfile(f)));
    expect(url).toMatch(/^\/cases\/[\w-]+\/steps\/2$/);
    return url.split("/")[2];
  }

  const locationForm = (caseId: string) => form({ caseId, provinceId: String(f.tehranProvinceId), countyId: String(f.tehranCountyId), city: "تهران", address: "تهران، خیابان آزمون" });
  const specialtiesForm = (caseId: string) => form({ caseId, specialties: [String(f.specialtyId)], specialtyDetails: JSON.stringify([{ code: "commentator", options: ["tafsir"] }]) });

  it("فراخوانی مستقیم اکشن مرحلهٔ ۳ پیش از ذخیرهٔ مرحلهٔ ۲ رد می‌شود", async () => {
    const caseId = await freshCase();
    const state = await saveSpecialtiesStepAction({}, specialtiesForm(caseId));
    expect(state.error).toContain("سکونت و محل فعالیت");
    expect(state.error).toContain("تکمیل و ذخیره");
  });

  it("بارگذاری مدرک و تصویر پیش از تکمیل مراحل ۲ و ۳ از سمت سرور رد می‌شود", async () => {
    const caseId = await freshCase();
    const doc = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
    expect(doc.error).toContain("سکونت و محل فعالیت");
    const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photo.error).toContain("سکونت و محل فعالیت");
  });

  it("خطای اعتبارسنجی مرحلهٔ ۲ عبور نمی‌دهد؛ ذخیرهٔ موفق به مرحلهٔ ۳ می‌رود", async () => {
    const caseId = await freshCase();
    const bad = await saveLocationStepAction({}, form({ caseId }));
    expect(bad.error).toContain("استان و شهرستان");
    const url = await redirectOf(() => saveLocationStepAction({}, locationForm(caseId)));
    expect(url).toBe(`/cases/${caseId}/steps/3`);
    const [row] = await db.select({ status: s.applications.status }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(row.status).toBe("draft");
  });

  it("آماده‌سازی و ارسال با مراحل ناقص با پیام موارد ناقص رد می‌شود", async () => {
    const caseId = await freshCase();
    const blocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(blocked)).toContain("برای ارسال تکمیل کنید");
    expect(messageOf(blocked)).toContain("استان و شهرستان");
  });

  it("ذخیرهٔ مرحلهٔ ۳ مسیر مرحلهٔ ۴ را باز می‌کند؛ ویرایش مخل دوباره قفل و ذخیرهٔ مجدد باز می‌کند", async () => {
    const caseId = await freshCase();
    await redirectOf(() => saveLocationStepAction({}, locationForm(caseId)));
    const url = await redirectOf(() => saveSpecialtiesStepAction({}, specialtiesForm(caseId)));
    expect(url).toBe(`/cases/${caseId}/steps/4`);

    // با مراحل ۱ تا ۳ کامل، بارگذاری مدرک و تصویر باید موفق باشد
    const ok = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
    expect(ok.error).toBeUndefined();
    const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photo.error).toBeUndefined();

    // ویرایش مخل: جزئیات تخصص حذف می‌شود → مرحلهٔ ۳ ناقص و بارگذاری بعدی قفل
    const [app] = await db.select({ activistId: s.applications.activistId }).from(s.applications).where(eq(s.applications.id, caseId));
    await db.delete(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, app.activistId));
    const blocked = await uploadDocumentAction(caseId, {}, form({ title: "مدرک دوم", docType: "national_card", docNumber: "67890", file: pdfFile() }));
    expect(blocked.error).toContain("تخصص‌ها، تحصیلات و سوابق");
    const sendBlocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(sendBlocked)).toContain("تخصص‌ها، تحصیلات و سوابق");

    // ذخیرهٔ دوبارهٔ مرحلهٔ ۳ زنجیره را باز می‌کند و آماده‌سازی ممکن می‌شود
    await redirectOf(() => saveSpecialtiesStepAction({}, specialtiesForm(caseId)));
    const again = await uploadDocumentAction(caseId, {}, form({ title: "مدرک سوم", docType: "national_card", docNumber: "11111", file: pdfFile() }));
    expect(again.error).toBeUndefined();
    const ready = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(ready)).toContain("آماده ارسال");
  });

  it("پیمایش کامل زنجیره تا ارسال موفق و پنج مرحلهٔ تکمیل‌شده", async () => {
    const caseId = await freshCase();
    await redirectOf(() => saveLocationStepAction({}, locationForm(caseId)));
    await redirectOf(() => saveSpecialtiesStepAction({}, specialtiesForm(caseId)));
    const doc = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
    expect(doc.error).toBeUndefined();
    const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photo.error).toBeUndefined();

    // حتی با مراحل ۱ تا ۴ کامل، ارسال ممکن است — گام بازبینی روی خودش قفل نمی‌ماند
    const ready = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(ready)).toContain("آماده ارسال");
    const submitted = await redirectOf(() => submitCaseAction(form({ caseId })));
    expect(messageOf(submitted)).toContain("ارسال شد");

    const [row] = await db.select({ status: s.applications.status }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(row.status).toBe("pending");

    // موتور روی دادهٔ واقعی سرور: هر پنج مرحله تکمیل‌شده
    const [app] = await db.select({ application: s.applications, activist: s.activists }).from(s.applications).innerJoin(s.activists, eq(s.applications.activistId, s.activists.id)).where(eq(s.applications.id, caseId));
    const plan = computeCaseSteps(await loadCaseStepFacts(app.activist, row.status, caseId));
    expect(statuses(plan)).toEqual(["completed", "completed", "completed", "completed", "completed"]);
    expect(plan.completedCount).toBe(5);
  });
});
