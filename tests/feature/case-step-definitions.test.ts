// آزمون‌های الحاقیهٔ ۲.۲۵.۰ — مدیریت پویای مراحل ثبت پرونده روی دیتابیس واقعی
// noor_feature: مراحل پایهٔ seed‌شده، افزودن/ویرایش/ترتیب/فعال‌سازی/حذف مراحل
// سفارشی، گارد «بازبینی همیشه آخرین»، فرم سفارشی مرحله و ذخیرهٔ نسخه‌بندی‌شدهٔ
// پاسخ‌ها در ویزارد با گارد زنجیرهٔ مراحل.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./env";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { initialActionState } from "@/lib/action-state";
import { closeDb, featureSeed, form, loginAs, nationalId, redirectOf, resetCaseData, completeProfile, type Fixture } from "./helpers";
import { loadActiveCaseSteps, computeCaseSteps } from "@/lib/case-steps";
import { listCaseStepsForAdmin, createCaseStepAction, saveCaseStepMetaAction, toggleCaseStepAction, deleteCaseStepAction, reorderCaseStepsAction } from "@/app/actions/case-steps-admin";
import { saveFormDraftAction, publishFormAction } from "@/app/actions/forms";
import { saveIdentityStepAction, saveCaseStepAnswersAction } from "@/app/actions/case-steps";

let f: Fixture;
beforeAll(async () => {
  await resetCaseData();
  f = await featureSeed();
  // پاک‌سازی بقایای اجراهای پیشین این جدول تازه (resetCaseData آن را نمی‌شناسد):
  // مراحل سفارشی، فرم‌های سفارشی مراحل و پاسخ‌های آن‌ها حذف می‌شوند.
  const stepDefs = await db.select({ id: s.formDefinitions.id }).from(s.formDefinitions).where(eq(s.formDefinitions.entityType, "case_step"));
  if (stepDefs.length) await db.delete(s.formAnswers).where(inArray(s.formAnswers.definitionId, stepDefs.map((row) => row.id)));
  await db.delete(s.formDefinitions).where(eq(s.formDefinitions.entityType, "case_step"));
  await db.delete(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.kind, "custom"));
}, 30_000);
afterAll(async () => {
  // بازگرداندن وضعیت پاک برای فایل‌های آزمون دیگر که همین DB مشترک را می‌خوانند:
  // حذف مراحل سفارشی + فرم‌ها + پاسخ‌ها و بازنشانی ترتیب مراحل پایه به seed ۰۰۳۱.
  try {
    const stepDefs = await db.select({ id: s.formDefinitions.id }).from(s.formDefinitions).where(eq(s.formDefinitions.entityType, "case_step"));
    if (stepDefs.length) await db.delete(s.formAnswers).where(inArray(s.formAnswers.definitionId, stepDefs.map((row) => row.id)));
    await db.delete(s.formDefinitions).where(eq(s.formDefinitions.entityType, "case_step"));
    await db.delete(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.kind, "custom"));
    const seeds: Record<string, number> = { identity: 10, location: 20, specialties: 30, documents: 40, review: 50 };
    for (const [code, sortOrder] of Object.entries(seeds)) {
      await db.update(s.caseStepDefinitions).set({ sortOrder }).where(eq(s.caseStepDefinitions.code, code));
    }
  } finally {
    await closeDb();
  }
});

let customStepId = 0;
const FLD_REQ = "fld_req001";
const CHANGE_REASON = "ثبت آزمونی الحاقیهٔ ۲.۲۵.۰";

const orderedCodes = async () => (await loadActiveCaseSteps()).map((step) => step.key);
const allIds = async () => (await db.select({ id: s.caseStepDefinitions.id, code: s.caseStepDefinitions.code }).from(s.caseStepDefinitions).orderBy(asc(s.caseStepDefinitions.sortOrder), asc(s.caseStepDefinitions.id)));

describe("الحاقیهٔ ۲.۲۵.۰ — مدیریت مراحل ثبت پرونده", () => {
  it("مراحل پایه با مایگریشن ۰۰۳۱ seed شده‌اند و ترتیب پیش‌فرض درست است", async () => {
    const codes = await orderedCodes();
    expect(codes).toEqual(["identity", "location", "specialties", "documents", "review"]);
    const rows = await allIds();
    expect(rows.map((row) => row.code)).toEqual(codes);
  });

  it("افزودن مرحله و مدیریت آن بدون مجوز forms.manage رد می‌شود", async () => {
    await loginAs("act");
    const denied = await createCaseStepAction(initialActionState, form({ title: "مرحلهٔ بی‌مجوز" }));
    expect(denied.error).toContain("مجوز مدیریت مراحل ثبت پرونده");
    await loginAs("rev");
    const denied2 = await createCaseStepAction(initialActionState, form({ title: "مرحلهٔ بی‌مجوز ۲" }));
    expect(denied2.error).toContain("مجوز مدیریت مراحل ثبت پرونده");
  });

  it("افزودن مرحلهٔ سفارشی: پیش از «بازبینی» درج و در ترتیب فعال ظاهر می‌شود", async () => {
    await loginAs("super");
    const added = await createCaseStepAction(initialActionState, form({ title: "مصاحبه و ارزیابی", description: "ارزیابی نهایی شعبه" }));
    expect(added.success).toBeDefined();
    const [row] = await db.select({ id: s.caseStepDefinitions.id }).from(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.title, "مصاحبه و ارزیابی"));
    customStepId = row.id;
    const codes = await orderedCodes();
    expect(codes[0]).toBe("identity");
    expect(codes[codes.length - 1]).toBe("review");
    expect(codes[codes.length - 2]).toMatch(/^cs/);
  });

  it("تغییر ترتیب: جابه‌جایی مرحلهٔ سفارشی ذخیره می‌شود؛ بازبینی نه‌آخر رد می‌شود", async () => {
    await loginAs("super");
    const ids = await allIds();
    const byCode = Object.fromEntries(ids.map((row) => [row.code, row.id]));
    const bad = await reorderCaseStepsAction(form({ order: JSON.stringify([byCode.review, byCode.identity, byCode.location, byCode.specialties, byCode.documents, customStepId]) }));
    expect(bad.error).toContain("بازبینی و ارسال» باید همیشه آخرین");
    const moved = await reorderCaseStepsAction(form({ order: JSON.stringify([byCode.identity, customStepId, byCode.location, byCode.specialties, byCode.documents, byCode.review]) }));
    expect(moved.success).toBeDefined();
    const codes = await orderedCodes();
    expect(codes[0]).toBe("identity");
    expect(codes[1]).toMatch(/^cs/);
    expect(codes[2]).toBe("location");
    expect(codes[codes.length - 1]).toBe("review");
  });

  it("غیرفعال‌سازی مرحلهٔ سفارشی مجاز و مرحلهٔ پایه رد می‌شود", async () => {
    await loginAs("super");
    const blocked = await toggleCaseStepAction(form({ caseStepId: String((await allIds()).find((row) => row.code === "identity")!.id) }));
    expect(blocked.error).toContain("مراحل پایهٔ سامانه");
    const off = await toggleCaseStepAction(form({ caseStepId: String(customStepId) }));
    expect(off.success).toBeDefined();
    expect((await orderedCodes())).not.toContain(expect.stringMatching(/^cs/));
    const on = await toggleCaseStepAction(form({ caseStepId: String(customStepId) }));
    expect(on.success).toBeDefined();
    expect((await orderedCodes())[1]).toMatch(/^cs/);
  });

  it("فرم سفارشی مرحله منتشر می‌شود و پاسخ ناقص/کامل در ویزارد کنترل می‌گردد", async () => {
    await loginAs("super");
    const draft = { fields: [{ key: FLD_REQ, type: "text", label: "نتیجهٔ مصاحبه", required: true }] };
    const saved = await saveFormDraftAction(initialActionState, form({ entityType: "case_step", entityId: String(customStepId), config: JSON.stringify(draft) }));
    expect(saved.success).toBeDefined();
    const published = await publishFormAction(initialActionState, form({ entityType: "case_step", entityId: String(customStepId) }));
    expect(published.success).toContain("نسخهٔ ۱");
    // پروندهٔ تازه برای act؛ پس از ذخیرهٔ هویتی، مرحلهٔ بعدی همان مرحلهٔ سفارشی است
    await loginAs("act");
    const identity = completeProfile(f, {
      nationalId: nationalId(`3${String(10000000 + ((Date.now() + 71) % 89000000)).slice(0, 8)}`),
      lastName: "موسوی‌مراحل ۲۵",
      phone: "09123450251",
      alternatePhone: "09354450251",
    });
    const url = await redirectOf(() => saveIdentityStepAction({}, identity));
    const caseId = url.split("/")[2];
    expect(caseId).toMatch(/^[\w-]+$/);
    expect(url.endsWith("/steps/2")).toBe(true);
    // پاسخ خالی برای فیلد الزامی رد می‌شود
    const bad = await saveCaseStepAnswersAction({}, form({ caseId, caseStepId: String(customStepId) }));
    expect(bad.error).toContain("نتیجهٔ مصاحبه");
    // پاسخ کامل ذخیره و با نسخهٔ ۱ ثبت می‌شود
    const ok = await redirectOf(() => saveCaseStepAnswersAction({}, form({ caseId, caseStepId: String(customStepId), [`cstep__${customStepId}__${FLD_REQ}`]: "مصاحبه انجام شد؛ تأیید شعبه" })));
    expect(ok).toContain("/steps/2");
    const [answer] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, caseId));
    expect(answer).toBeDefined();
    expect(answer.version).toBe(1);
    expect(answer.specialtyId).toBeNull();
    // مرحلهٔ سفارشی در محاسبهٔ موتور تکمیل‌شده است و در ترتیب فعال دیده می‌شود
    const steps = await loadActiveCaseSteps();
    expect(steps[1].definitionId).toBe(customStepId);
    const plan = computeCaseSteps({
      status: "completing",
      person: { firstName: "الف", lastName: "موسوی‌مراحل ۲۵", fatherName: "پ", nationalIdHash: "h", idCardNumber: "1", idIssuePlace: "تهران", birthDate: "1370-01-01", gender: "male", phone: "09123450251", alternatePhone: "09354450251", email: null, provinceId: null, countyId: null, photoDocumentId: null },
      specialtyCount: 0, specialtyDetailMissing: [], evidenceCount: 0, photoOk: false,
    }, steps);
    expect(plan.steps[1].key).toMatch(/^cs/);
    expect(plan.steps[1].status).toBe("completed");
    expect(plan.steps[2].key).toBe("location");
  });

  it("ویرایش عنوان مرحلهٔ پایه در ترتیب فعال منعکس می‌شود", async () => {
    await loginAs("super");
    const identityId = (await allIds()).find((row) => row.code === "identity")!.id;
    const saved = await saveCaseStepMetaAction(initialActionState, form({ caseStepId: String(identityId), title: "اطلاعات هویتی و تماس", description: "مشخصات فردی، شناسنامه‌ای و شماره‌های تماس" }));
    expect(saved.success).toBeDefined();
    const steps = await loadActiveCaseSteps();
    expect(steps[0].title).toBe("اطلاعات هویتی و تماس");
  });

  it("حذف: مرحلهٔ پایه رد می‌شود؛ مرحلهٔ سفارشی دارای پاسخ رد و بی‌وابسته حذف می‌شود", async () => {
    await loginAs("super");
    const identityId = (await allIds()).find((row) => row.code === "identity")!.id;
    const blocked = await redirectOf(() => deleteCaseStepAction(form({ caseStepId: String(identityId) })));
    expect(blocked.startsWith("/steps")).toBe(true);
    const [identityRow] = await db.select({ id: s.caseStepDefinitions.id }).from(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.id, identityId));
    expect(identityRow).toBeDefined();
    const blockedAnswers = await redirectOf(() => deleteCaseStepAction(form({ caseStepId: String(customStepId) })));
    expect(blockedAnswers.startsWith("/steps")).toBe(true);
    const [stillThere] = await db.select({ id: s.caseStepDefinitions.id }).from(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.id, customStepId));
    expect(stillThere).toBeDefined();
    // مرحلهٔ سفارشی دیگرِ بدون پاسخ: ساخته و حذف می‌شود
    const added = await createCaseStepAction(initialActionState, form({ title: "مرحلهٔ موقت آزمون" }));
    expect(added.success).toBeDefined();
    const [temp] = await db.select({ id: s.caseStepDefinitions.id }).from(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.title, "مرحلهٔ موقت آزمون"));
    const url = await redirectOf(() => deleteCaseStepAction(form({ caseStepId: String(temp.id) })));
    expect(url.startsWith("/steps")).toBe(true);
    const [gone] = await db.select({ id: s.caseStepDefinitions.id }).from(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.id, temp.id));
    expect(gone).toBeUndefined();
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(eq(s.auditLogs.action, "delete_case_step"));
    expect(auditRow).toBeDefined();
    const adminList = await listCaseStepsForAdmin();
    expect(adminList).not.toBeNull();
    expect(adminList!.rows.length).toBeGreaterThanOrEqual(5);
  });
});
