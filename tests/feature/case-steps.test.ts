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
  loadCaseStepFacts, collectReadinessIssues, readinessHint, readinessFlagSections,
  READINESS_FALLBACK_HINT, CORRECTION_REQUEST_LABEL, DOC_REQUESTS_LABEL,
  identityMissing, locationMissing, specialtiesMissing, documentsMissing,
  type CaseStepFacts, type CaseStepPlan,
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

// ---------------- الحاقیهٔ ۲.۱۹.۳ — بررسی هوشمند آمادگی ارسال ----------------

describe("بررسی هوشمند آمادگی ارسال — موتور ناب", () => {
  it("پروندهٔ خالی: چهار گروه نقص به‌ترتیب مراحل با بخش‌های درست و راهنمای هر مورد", () => {
    const issues = collectReadinessIssues(facts());
    expect(issues.map((issue) => issue.step)).toEqual([1, 2, 3, 4]);
    expect(issues.map((issue) => issue.stepKey)).toEqual(["identity", "location", "specialties", "documents"]);
    expect(issues[0].items).toHaveLength(identityMissing(person()).length);
    expect(issues[0].items.every((item) => item.section === "identity-fields")).toBe(true);
    expect(issues[0].items.every((item) => item.hint && item.hint !== READINESS_FALLBACK_HINT)).toBe(true);
    expect(issues[1].items[0]).toMatchObject({ label: "استان و شهرستان سکونت", section: "residence" });
    expect(issues[2].items[0]).toMatchObject({ label: "حداقل یک تخصص قرآنی", section: "specialty-grid" });
    expect(issues[3].items.map((item) => item.section)).toEqual(["sec-evidence", "sec-photo"]);
  });

  it("جزئیات ناقص تخصص‌ها: برچسب پیشوندی با راهنمای اختصاصی و پرچم کارت جزئیات", () => {
    const partial = facts({ status: "completing", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 1, specialtyDetailMissing: ["حافظ جزء ۳۰"], evidenceCount: 1, photoOk: true });
    const issues = collectReadinessIssues(partial);
    expect(issues).toHaveLength(1);
    expect(issues[0].step).toBe(3);
    expect(issues[0].items[0].label).toBe("جزئیات تخصص‌ها: حافظ جزء ۳۰");
    expect(issues[0].items[0].section).toBe("specialty-details");
    expect(issues[0].items[0].hint).not.toBe(READINESS_FALLBACK_HINT);
  });

  it("پروندهٔ کامل بدون گارد باز: هیچ موردی گزارش نمی‌شود", () => {
    const done = facts({ status: "completing", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2, evidenceCount: 1, photoOk: true });
    expect(collectReadinessIssues(done)).toEqual([]);
    expect(collectReadinessIssues(done, { openCorrection: false, openDocRequests: 0 })).toEqual([]);
  });

  it("گاردهای باز: اصلاح روی مرحلهٔ ۵ و مدارک درخواستی روی مرحلهٔ ۴", () => {
    const done = facts({ status: "needs_correction", person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 2, evidenceCount: 1, photoOk: true });
    const issues = collectReadinessIssues(done, { openCorrection: true, openDocRequests: 2 });
    expect(issues).toHaveLength(2);
    expect(issues[0].step).toBe(4);
    expect(issues[0].items[issues[0].items.length - 1].label).toBe(DOC_REQUESTS_LABEL);
    expect(issues[0].items[issues[0].items.length - 1].section).toBe("sec-evidence");
    expect(issues[1].step).toBe(5);
    expect(issues[1].items[0].label).toBe(CORRECTION_REQUEST_LABEL);
  });

  it("پوشش راهنما: هر برچسبی که موتور مراحل تولید می‌کند راهنمای اختصاصی دارد", () => {
    const labels = [
      ...identityMissing(person()),
      ...locationMissing(person()),
      ...specialtiesMissing(facts({ specialtyDetailMissing: ["حافظ جزء ۳۰"] })),
      ...documentsMissing(facts()),
      CORRECTION_REQUEST_LABEL, DOC_REQUESTS_LABEL,
    ];
    for (const label of labels) expect(readinessHint(label)).not.toBe(READINESS_FALLBACK_HINT);
  });

  it("پرچم بخش‌ها: از دید هر مرحلهٔ ویزارد", () => {
    const plan = computeCaseSteps(facts());
    expect(readinessFlagSections(plan.steps[0])).toEqual(["identity-fields"]);
    expect(readinessFlagSections(plan.steps[1])).toEqual(["residence"]);
    expect(readinessFlagSections(plan.steps[2])).toEqual(["specialty-grid"]);
    expect(readinessFlagSections(plan.steps[3])).toEqual(["sec-evidence", "sec-photo"]);
    const partial = computeCaseSteps(facts({ person: fullPerson({ provinceId: 5, countyId: 7 }), specialtyCount: 1, specialtyDetailMissing: ["حافظ جزء ۳۰"] }));
    expect(readinessFlagSections(partial.steps[2])).toEqual(["specialty-details"]);
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

  it("الحاقیهٔ ۲.۱۹.۴ — رشته/نوع/نام دانشگاه ذخیره می‌شود و نوع نامعتبر رد می‌شود", async () => {
    const edu = JSON.stringify([{ type: "university", level: "کارشناسی", field: "علوم قرآن و حدیث", universityType: "دانشگاه آزاد اسلامی", centerName: "واحد تهران مرکز", certificate: "", docKey: "" }]);
    await loginAs("act");
    const url = await redirectOf(() => saveIdentityStepAction({}, completeProfile(f, { educationRecords: edu })));
    expect(url).toMatch(/^\/cases\/[\w-]+\/steps\/2$/);
    const [row] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.centerName, "واحد تهران مرکز"));
    expect(row?.level).toBe("کارشناسی");
    expect(row?.field).toBe("علوم قرآن و حدیث");
    expect(row?.universityType).toBe("دانشگاه آزاد اسلامی");
    expect(row?.centerName).toBe("واحد تهران مرکز");
  });

  it("الحاقیهٔ ۲.۱۹.۴ — نوع دانشگاه خارج از فهرست ثابت از سمت سرور رد می‌شود", async () => {
    await loginAs("act");
    const bad = await saveIdentityStepAction({}, completeProfile(f, {
      educationRecords: JSON.stringify([{ type: "university", level: "کارشناسی", universityType: "دانشگاه ناموجود" }]),
    }));
    expect(bad.error).toContain("تحصیلات");
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
