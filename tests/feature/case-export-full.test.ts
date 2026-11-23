// الحاقیهٔ ۲.۲۷.۰ — آزمون‌های خروجی اکسل کامل پرونده‌ها
// -----------------------------------------------------------
// ۱) شیت «اطلاعات کامل» خروجی فهرست: ترتیب فرم، برچسب override-آگاه فیلدهای
//    ثابت، ستون‌های پویای فیلدهای سفارشی مراحل فعال با برچسب فارسی گزینه‌ها.
// ۲) خروجی تک‌پرونده (/api/cases/[id]/export): گارد دسترسی (۴۰۱/۴۰۴/۲۰۰)،
//    پوشش کامل بخش‌ها و پاسخ‌های سفارشی، پوشاندن کد ملی برای غیرمدیر و
//    کد ملی کامل برای مدیر، و رویداد ممیزی export_case_detail.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import ExcelJS from "exceljs";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { protectNationalId } from "@/lib/local-secrets";
import { GET as exportCases } from "@/app/api/cases/export/route";
import { GET as exportCaseDetail } from "@/app/api/cases/[id]/export/route";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
// جدول‌های مراحل/فرم‌ها/override در truncate عمومی نیستند؛ جداگانه پاک می‌شوند
beforeEach(async () => {
  await resetCaseData();
  await db.delete(s.formAnswers);
  await db.delete(s.formDefinitions).where(eq(s.formDefinitions.entityType, "case_step"));
  await db.delete(s.caseStepDefinitions).where(eq(s.caseStepDefinitions.kind, "custom"));
  await db.delete(s.caseFieldOverrides);
});
afterAll(closeDb);

const STEP_TITLE = "گواهی‌های مکمل آزمون";
const CONFIG = {
  fields: [
    { key: "fld_sk111111", type: "select", label: "سطح مهارت", required: false, options: [{ key: "opt_beginner", label: "مبتدی" }, { key: "opt_advanced", label: "پیشرفته" }] },
    { key: "fld_ck222222", type: "checkbox", label: "حوزه‌های علاقه", required: false, options: [{ key: "opt_teach", label: "تدریس" }, { key: "opt_recite", label: "تلاوت" }] },
    { key: "fld_tx333333", type: "textarea", label: "توضیح تکمیلی", required: false },
  ],
};
const ANSWERS = { "fld_sk111111": "opt_advanced", "fld_ck222222": ["opt_teach", "opt_recite"], "fld_tx333333": "متن آزمونی توضیحات" };

async function seedFullCase() {
  const sealed = await protectNationalId("0123456789");
  const [activist] = await db.insert(s.activists).values({
    userId: f.users.act.id, firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", gender: "female",
    phone: "09121110001", nationalIdLast4: "6789", nationalIdCipher: sealed.cipher,
    provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران", address: "تهران، خیابان آزمون",
    notes: "توضیحات تکمیلی آزمون",
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "draft", source: "self", createdBy: f.users.act.id,
  }).returning();
  const [trainer] = await db.select().from(s.specialties).where(eq(s.specialties.code, "trainer")).limit(1);
  await db.insert(s.activistSpecialties).values({ activistId: activist.id, specialtyId: trainer.id });
  await db.insert(s.activistSpecialtyDetails).values({ activistId: activist.id, specialtyId: trainer.id, detailOptions: ["rokhani", "tajvid"] });
  await db.insert(s.educationRecords).values({ activistId: activist.id, type: "university", level: "کارشناسی", field: "علوم قرآن و حدیث", universityType: "دانشگاه دولتی", centerName: "دانشگاه تهران", createdBy: f.users.act.id });
  await db.insert(s.documents).values({
    applicationId: application.id, storageKey: "test-export-doc-1", originalName: "madrak.pdf",
    title: "مدرک دورهٔ تجوید", docType: "certificate", mimeType: "application/pdf", size: 2048, uploadedBy: f.users.act.id,
  });
  const [step] = await db.insert(s.caseStepDefinitions).values({ code: "custom_export", title: STEP_TITLE, kind: "custom", sortOrder: 90, active: true, updatedBy: f.users.super.id }).returning();
  const [definition] = await db.insert(s.formDefinitions).values({
    entityType: "case_step", entityId: step.id, status: "published", version: 1, publishedConfig: CONFIG, updatedBy: f.users.super.id,
  }).returning();
  await db.insert(s.formAnswers).values({ definitionId: definition.id, version: 1, applicationId: application.id, activistId: activist.id, answers: ANSWERS });
  // override عنوان فیلد ثابت — خروجی باید همان برچسب ویرایش‌شده را نشان دهد
  await db.insert(s.caseFieldOverrides).values({ stepCode: "identity", fieldKey: "fatherName", label: "نام پدر (برچسب ویرایش‌شده)", updatedBy: f.users.super.id });
  return { activist, application };
}

async function loadWorkbook(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

function sheetText(sheet: ExcelJS.Worksheet): string {
  return JSON.stringify(sheet.getSheetValues());
}

describe("شیت اطلاعات کامل فهرست پرونده‌ها (الحاقیهٔ ۲.۲۷.۰)", () => {
  it("برچسب override فیلد ثابت و ستون پویای فیلد سفارشی با برچسب فارسی گزینه‌ها", async () => {
    const { application } = await seedFullCase();
    await loginAs("prov");
    const workbook = await loadWorkbook(await exportCases(new Request("http://feature.local/api/cases/export")));
    const full = workbook.worksheets.find((sheet) => sheet.name === "اطلاعات کامل")!;
    const header = (full.getRow(2).values as string[]).slice(1);
    // ترتیب فرم: ستون‌های پایه با عنوان فارسی خوانا
    expect(header.indexOf("نام")).toBeLessThan(header.indexOf("کد ملی"));
    expect(header.indexOf("کد ملی")).toBeLessThan(header.indexOf("استان سکونت"));
    expect(header.indexOf("استان سکونت")).toBeLessThan(header.indexOf("تخصص‌های قرآنی"));
    expect(header).toContain("ایمیل تماس");
    expect(header).toContain("توضیحات تکمیلی");
    // override ۲.۲۶ — برچسب ویرایش‌شدهٔ مدیر جای برچسب پیش‌فرض می‌نشیند
    expect(header).toContain("نام پدر (برچسب ویرایش‌شده)");
    expect(header).not.toContain("نام پدر");
    // ستون پویای فیلد سفارشی مرحلهٔ فعال: «عنوان مرحله – عنوان فیلد»
    const skillColumn = header.indexOf(`${STEP_TITLE} – سطح مهارت`);
    expect(skillColumn).toBeGreaterThan(-1);
    expect(header).toContain(`${STEP_TITLE} – حوزه‌های علاقه`);
    const row = full.getRow(3).values as (string | number)[];
    expect(row[header.indexOf("نام پدر (برچسب ویرایش‌شده)") + 1]).toBe("حسین");
    expect(String(row[skillColumn + 1])).toBe("پیشرفته"); // کلید opt_ هرگز خام نمی‌آید
    expect(String(row[header.indexOf(`${STEP_TITLE} – حوزه‌های علاقه`) + 1])).toBe("تدریس، تلاوت");
    expect(String(row[header.indexOf(`${STEP_TITLE} – توضیح تکمیلی`) + 1])).toBe("متن آزمونی توضیحات");
    expect(String(row[header.indexOf("رشته‌های معلمی و مدرسی") + 1])).toContain("روخوانی و روان‌خوانی");
    expect(row[header.indexOf("توضیحات تکمیلی") + 1]).toBe("توضیحات تکمیلی آزمون");
    expect(row[header.indexOf("مقطع تحصیلی") + 1]).toBe("کارشناسی");
    expect(row[header.indexOf("نوع دانشگاه") + 1]).toBe("دانشگاه دولتی");
    expect(application).toBeTruthy();
  });
});

describe("خروجی اکسل تک‌پرونده (/api/cases/[id]/export)", () => {
  it("بدون نشست → ۴۰۱؛ پروندهٔ خارج از محدوده → ۴۰۴", async () => {
    const { application } = await seedFullCase();
    expect((await exportCaseDetail(new Request(`http://feature.local/api/cases/${application.id}/export`), { params: Promise.resolve({ id: application.id }) })).status).toBe(401);
    await loginAs("provFars"); // مدیر استان فارس — پرونده در محدودهٔ او نیست
    expect((await exportCaseDetail(new Request(`http://feature.local/api/cases/${application.id}/export`), { params: Promise.resolve({ id: application.id }) })).status).toBe(404);
  });

  it("مدیر استان: همهٔ بخش‌ها، پاسخ سفارشی با برچسب فارسی، شیت‌های تخصص/رکورد/مدارک و ممیزی", async () => {
    const { application } = await seedFullCase();
    await loginAs("prov");
    const response = await exportCaseDetail(new Request(`http://feature.local/api/cases/${application.id}/export`), { params: Promise.resolve({ id: application.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(`noor-case-${application.id.slice(0, 8)}`);
    const workbook = await loadWorkbook(response);
    const main = workbook.worksheets.find((sheet) => sheet.name === "مشخصات پرونده")!;
    expect(main.views[0]?.rightToLeft).toBe(true);
    const text = sheetText(main);
    // بخش‌های فرم به ترتیب + برچسب override-شده
    expect(text).toContain("اطلاعات هویتی و تماس");
    expect(text).toContain("نام پدر (برچسب ویرایش‌شده)");
    expect(text).toContain("تحصیلات دانشگاهی");
    expect(text).toContain("محل سکونت");
    expect(text).toContain("تخصص‌های قرآنی");
    // بخش فیلدهای سفارشی مرحله + پاسخ‌ها با برچسب فارسی گزینه‌ها
    expect(text).toContain(`فیلدهای سفارشی مرحلهٔ «${STEP_TITLE}»`);
    expect(text).toContain("پیشرفته");
    expect(text).toContain("تدریس، تلاوت");
    expect(text).toContain("متن آزمونی توضیحات");
    // کد ملی کامل برای مدیر
    expect(text).toContain("0123456789");
    // شیت‌های جزئی
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("تخصص‌ها و جزئیات");
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("رکوردهای ثبت‌شده");
    const docsSheet = workbook.worksheets.find((sheet) => sheet.name === "مدارک بارگذاری‌شده")!;
    expect(sheetText(docsSheet)).toContain("مدرک دورهٔ تجوید");
    // ممیزی خروجی تک‌پرونده
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "export_case_detail"));
    expect(audit).toBeTruthy();
    expect(audit.targetId).toBe(application.id);
  });

  it("فعال قرآنی: پروندهٔ خودش → ۲۰۰ با کد ملی پوشانده‌شده", async () => {
    const { application } = await seedFullCase();
    await loginAs("act");
    const response = await exportCaseDetail(new Request(`http://feature.local/api/cases/${application.id}/export`), { params: Promise.resolve({ id: application.id }) });
    expect(response.status).toBe(200);
    const workbook = await loadWorkbook(response);
    const main = workbook.worksheets.find((sheet) => sheet.name === "مشخصات پرونده")!;
    expect(sheetText(main)).toContain("••••••6789");
    expect(sheetText(main)).not.toContain("0123456789");
  });
});
