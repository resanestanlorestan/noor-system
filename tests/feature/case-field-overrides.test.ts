// آزمون‌های الحاقیهٔ ۲.۲۶.۰ — ویرایش کامل فیلدهای ثابت مراحل ثبت پرونده روی
// دیتابیس واقعی noor_feature: گارد مجوز، ویرایش عنوان/الزام/مخفی‌سازی، بازتاب
// در موتور زنجیره و اعتبارسنجی ویزارد، حفظ دادهٔ قبلی فیلد مخفی، بازنشانی و
// ممیزی. پس از پایان فایل، همهٔ overrideها حذف می‌شوند تا سایر فایل‌ها بدون
// اثر جانبی باشند (فایل‌ها ترتیبی اجرا می‌شوند: fileParallelism=false).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { initialActionState } from "@/lib/action-state";
import { closeDb, featureSeed, form, loginAs, redirectOf, resetCaseData, completeProfile, nationalId, type Fixture } from "./helpers";
import { identityChecks, identityMissing, loadCaseStepFacts } from "@/lib/case-steps";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import { saveFieldOverrideAction, resetFieldOverrideAction, listFixedFieldsForStep } from "@/app/actions/case-steps-admin";
import { saveIdentityStepAction } from "@/app/actions/case-steps";
import type { CaseStepFacts } from "@/lib/case-steps";

let f: Fixture;
beforeAll(async () => {
  await resetCaseData();
  f = await featureSeed();
  // پاک‌سازی بقایای اجراهای پیشین (resetCaseData جدول override را نمی‌شناسد)
  await db.delete(s.caseFieldOverrides);
}, 30_000);

afterAll(async () => {
  // بازگرداندن وضعیت پیش‌فرض کاتالوگ برای فایل‌های آزمون دیگر
  try {
    await db.delete(s.caseFieldOverrides);
  } finally {
    await closeDb();
  }
});

// جداسازی وضعیت بین آزمون‌ها: overrideهای الزام/مخفی‌سازی آزمون‌های پیشین
// حذف می‌شوند تا شکست یک expect حالت را به آزمون بعدی نشت ندهد؛ فقط override
// عنوان/الزامِ fatherName عمداً برای آزمون فهرست و بازنشانی باقی می‌ماند.
afterEach(async () => {
  await db.delete(s.caseFieldOverrides).where(eq(s.caseFieldOverrides.fieldKey, "contactEmail"));
  await db.delete(s.caseFieldOverrides).where(eq(s.caseFieldOverrides.fieldKey, "alternatePhone"));
});

const overrideRow = async (fieldKey: string) => (await db.select().from(s.caseFieldOverrides).where(eq(s.caseFieldOverrides.fieldKey, fieldKey)))[0];

describe("الحاقیهٔ ۲.۲۶.۰ — ویرایش کامل فیلدهای ثابت مراحل", () => {
  it("ویرایش فیلد ثابت بدون مجوز forms.manage رد می‌شود", async () => {
    await loginAs("act");
    const denied = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "fatherName", label: "نام پدر بزرگ" }));
    expect(denied.error).toContain("مجوز مدیریت مراحل ثبت پرونده");
    await loginAs("rev");
    const denied2 = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "fatherName", label: "نام پدر بزرگ ۲" }));
    expect(denied2.error).toContain("مجوز مدیریت مراحل ثبت پرونده");
  });

  it("کلید ناموجود در کاتالوگ و عنوان کوتاه رد می‌شود", async () => {
    await loginAs("super");
    const bad = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "notThere", label: "فیلد خیالی" }));
    expect(bad.error).toContain("فیلد ثابت یافت نشد");
    const short = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "fatherName", label: "پ" }));
    expect(short.error).toContain("عنوان فیلد");
  });

  it("ویرایش عنوان و برداشتن الزام ذخیره می‌شود و بلافاصله در موتور و اعتبارسنجی می‌آید", async () => {
    await loginAs("super");
    const saved = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "fatherName", label: "نام و نام خانوادگی پدر", help: "نام کامل پدر را بنویسید", required: "" }));
    expect(saved.success).toContain("نام و نام خانوادگی پدر");
    const meta = await loadCaseFieldMeta();
    expect(meta["identity.fatherName"]).toMatchObject({ label: "نام و نام خانوادگی پدر", required: false, overridden: true });
    // موتور: فیلد اختیاری‌شده در نقص‌ها نمی‌آید؛ برچسب تازه در دیگر موارد می‌آید
    const emptyPerson = { firstName: "", lastName: "", fatherName: null, nationalIdHash: null, idCardNumber: null, idIssuePlace: null, birthDate: null, gender: null, phone: null, alternatePhone: null, email: null, provinceId: null, countyId: null, photoDocumentId: null } as CaseStepFacts["person"];
    const withMeta = identityChecks(emptyPerson, meta);
    expect(withMeta.map((check) => check.key)).not.toContain("identity.fatherName");
    expect(identityMissing(emptyPerson, meta)).toContain("کد ملی");
    // همین نگاشت در facts واقعی هم می‌آید (loadCaseStepFacts از همان جدول می‌خواند)
    const fakePerson = { ...emptyPerson, id: "00000000-0000-0000-0000-000000000000", createdAt: new Date(), updatedAt: new Date(), job: null, notes: null, city: null, postalCode: null, address: null, activityPlace: null, organization: null, activityProvinceId: null, activityCountyId: null, nationalIdCipher: null, nationalIdLast4: null, universityLevel: null, seminaryLevel: null, universityDocumentId: null, seminaryDocumentId: null, universityType: null, deletedAt: null, deletedBy: null, userId: null } as unknown as typeof s.activists.$inferSelect;
    const facts = await loadCaseStepFacts(fakePerson, "draft", "00000000-0000-0000-0000-000000000000");
    expect(facts.fieldMeta?.["identity.fatherName"]?.label).toBe("نام و نام خانوادگی پدر");
    const row = await overrideRow("fatherName");
    expect(row?.label).toBe("نام و نام خانوادگی پدر");
  });

  it("اعتبارسنجی ویزارد از الزام جدید پیروی می‌کند: هویتی بدون نام پدر ذخیره می‌شود", async () => {
    await loginAs("act");
    const identity = completeProfile(f, { fatherName: "", nationalId: nationalId(`4${String(10000000 + ((Date.now() + 31) % 89000000)).slice(0, 8)}`), lastName: "موسوی‌فیلد ۲۶", phone: "09123450261", alternatePhone: "09354450261" });
    const url = await redirectOf(() => saveIdentityStepAction({}, identity));
    expect(url).toMatch(/\/cases\/[\w-]+\/steps\/\d+/);
  });

  it("الزامی‌کردن فیلد اختیاری: ایمیل خالی در موتور و اکشن خطا می‌دهد", async () => {
    await loginAs("super");
    const saved = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "contactEmail", label: "ایمیل تماس", required: "yes" }));
    expect(saved.success).toBeDefined();
    const meta = await loadCaseFieldMeta();
    expect(meta["identity.contactEmail"].required).toBe(true);
    const emptyPerson = { firstName: "الف", lastName: "ب", fatherName: "پ", nationalIdHash: "h", idCardNumber: "1", idIssuePlace: "تهران", birthDate: "1370-01-01", gender: "male", phone: "09120000001", alternatePhone: "09350000001", email: null, provinceId: 1, countyId: 1, photoDocumentId: null } as CaseStepFacts["person"];
    expect(identityMissing(emptyPerson, meta)).toContain("ایمیل تماس");
    // ثبت‌کنندهٔ تازه: مدیر استانی (فعال نمونه از آزمون پیش پروندهٔ خودش را دارد)
    await loginAs("prov");
    const identity = completeProfile(f, { contactEmail: "", changeReason: "کنترل الزامی‌شدن ایمیل در ویزارد", nationalId: nationalId(`5${String(10000000 + ((Date.now() + 53) % 89000000)).slice(0, 8)}`), lastName: "موسوی‌فیلد ۲۶ب", phone: "09123450271", alternatePhone: "09354450271" });
    const result = await saveIdentityStepAction({}, identity);
    expect(result.error).toContain("ایمیل تماس");
  });

  it("مخفی‌سازی: فیلد از کنترل خارج و دادهٔ قبلی هنگام ذخیره حفظ می‌شود", async () => {
    await loginAs("super");
    const hidden = await saveFieldOverrideAction(initialActionState, form({ stepCode: "identity", fieldKey: "alternatePhone", label: "شماره همراه جایگزین", hidden: "yes" }));
    expect(hidden.success).toBeDefined();
    const meta = await loadCaseFieldMeta();
    expect(meta["identity.alternatePhone"].hidden).toBe(true);
    const partialPerson = { firstName: "الف", lastName: "ب", fatherName: null, nationalIdHash: null, idCardNumber: null, idIssuePlace: null, birthDate: null, gender: null, phone: null, alternatePhone: null, email: null, provinceId: null, countyId: null, photoDocumentId: null } as CaseStepFacts["person"];
    expect(identityChecks(partialPerson, meta).map((check) => check.key)).not.toContain("identity.alternatePhone");
    // ذخیرهٔ هویتی پروندهٔ موجود بدون همراه جایگزین: خطا نمی‌دهد و شمارهٔ قبلی پاک نمی‌شود
    await loginAs("act");
    const [row] = await db.select({ applicationId: s.applications.id, activistId: s.activists.id, phone: s.activists.alternatePhone }).from(s.applications).innerJoin(s.activists, eq(s.applications.activistId, s.activists.id)).where(eq(s.activists.lastName, "موسوی‌فیلد ۲۶")).limit(1);
    expect(row?.phone).toBeTruthy();
    const identity = completeProfile(f, { caseId: row.applicationId, alternatePhone: "", changeReason: "به‌روزرسانی آزمونی مرحلهٔ هویتی" });
    const url = await redirectOf(() => saveIdentityStepAction({}, identity));
    expect(url).toContain(`/cases/${row.applicationId}`);
    const [after] = await db.select({ phone: s.activists.alternatePhone }).from(s.activists).where(eq(s.activists.id, row.activistId));
    expect(after?.phone).toBe(row.phone);
  });

  it("فهرست فیلدهای ثابت برای بی‌مجوز null و برای مدیر با وضعیت حل‌شده می‌آید", async () => {
    await loginAs("act");
    expect(await listFixedFieldsForStep("identity")).toBeNull();
    await loginAs("super");
    const fields = await listFixedFieldsForStep("identity");
    expect(fields?.some((field) => field.key === "identity.fatherName" && field.overridden)).toBe(true);
    expect(fields?.some((field) => field.key === "identity.firstName" && !field.canHide)).toBe(true);
    const reviewFields = await listFixedFieldsForStep("review");
    expect(reviewFields?.some((field) => field.key === "review.submit")).toBe(true);
  });

  it("بازنشانی فیلد به پیش‌فرض: ردیف override حذف و رفتار کاتالوگ برمی‌گردد", async () => {
    await loginAs("act");
    await redirectOf(() => resetFieldOverrideAction(form({ stepCode: "identity", fieldKey: "fatherName" })));
    await loginAs("super");
    await redirectOf(() => resetFieldOverrideAction(form({ stepCode: "identity", fieldKey: "fatherName" })));
    expect(await overrideRow("fatherName")).toBeUndefined();
    const meta = await loadCaseFieldMeta();
    expect(meta["identity.fatherName"]).toMatchObject({ label: "نام پدر", required: true, hidden: false, overridden: false });
    // afterEach دو کلید دیگر را پاک کرده است؛ کاتالوگ به‌طور کامل پیش‌فرض است
    const clean = await loadCaseFieldMeta();
    expect(clean["identity.alternatePhone"].hidden).toBe(false);
    expect(clean["identity.contactEmail"].required).toBe(false);
  });

  it("ردپای ممیزی ویرایش و بازنشانی فیلد ثبت می‌شود", async () => {
    const rows = await db.select({ action: s.auditLogs.action, targetId: s.auditLogs.targetId }).from(s.auditLogs).where(eq(s.auditLogs.action, "edit_case_field"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.targetId === "identity.fatherName")).toBe(true);
    const resets = await db.select({ targetId: s.auditLogs.targetId }).from(s.auditLogs).where(eq(s.auditLogs.action, "reset_case_field"));
    expect(resets.some((row) => row.targetId === "identity.fatherName")).toBe(true);
  });
});
