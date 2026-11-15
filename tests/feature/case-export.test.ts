// Feature tests for مرحله نهم (Excel exports with RTL): the case-list export
// (/api/cases/export) and the statistics report export (/api/reports/export)
// — auth guards, workbook structure, RTL sheet view, masked national IDs and
// the audit trail. The overdue export has its own suite (exports.test.ts).
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import ExcelJS from "exceljs";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { protectNationalId } from "@/lib/local-secrets";
import { GET as exportCases } from "@/app/api/cases/export/route";
import { GET as exportReport } from "@/app/api/reports/export/route";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

async function seedCase() {
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", gender: "female", phone: "09121110000",
    nationalIdLast4: "1234", provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "draft", source: "self", createdBy: f.users.act.id,
  }).returning();
  return { activist, application };
}

async function exportCasesWorkbook(query = "") {
  const request = new Request(`http://feature.local/api/cases/export${query}`);
  return exportCases(request);
}

async function loadWorkbook(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

describe("گارد خروجی فهرست پرونده‌ها", () => {
  it("بدون نشست → ۴۰۱؛ فعال قرآنی → ۴۰۳", async () => {
    await seedCase();
    expect((await exportCasesWorkbook()).status).toBe(401);
    await loginAs("act");
    expect((await exportCasesWorkbook()).status).toBe(403);
  });

  it("مدیر استان خروجی می‌گیرد و رویداد ممیزی ثبت می‌شود", async () => {
    await seedCase();
    await loginAs("prov");
    const response = await exportCasesWorkbook();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "export_case_list"));
    expect(audit).toBeTruthy();
    expect(audit.detail).toContain("1 rows");
  });
});

describe("ساخت کتاب اکسل فهرست پرونده‌ها", () => {
  it("نمای راست‌به‌چپ، سرستون‌ها، کد ملی پوشانده‌شده و سطر داده", async () => {
    await seedCase();
    await loginAs("prov");
    const workbook = await loadWorkbook(await exportCasesWorkbook());
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("فهرست پرونده‌ها");
    expect(sheet.views[0]?.rightToLeft).toBe(true);
    expect(String(sheet.getCell("A1").value)).toContain("فهرست پرونده‌های سامانه");
    const headerRow = sheet.getRow(6).values as string[];
    expect(headerRow.slice(1)).toContain("نام خانوادگی");
    expect(headerRow.slice(1)).toContain("کد ملی");
    const dataRow = sheet.getRow(7).values as (string | number)[];
    expect(dataRow[2]).toBe("زهرا");
    expect(dataRow[3]).toBe("موسوی");
    expect(dataRow[4]).toBe("••••••1234"); // بدون رمزنگاری — همان ۴ رقم آخر پوشانده می‌ماند
    expect(sheet.rowCount).toBe(7);
  });

  // الحاقیهٔ ۲.۱۴.۲ — کد ملی کامل برای مدیران + ستون مستقل رشته‌های معلمی/مدرسی
  it("کد ملی کامل رمزگشایی‌شده و ستون رشته‌های معلمی و مدرسی در شیت اطلاعات کامل", async () => {
    const sealed = await protectNationalId("0123456789");
    const [activist] = await db.insert(s.activists).values({
      firstName: "زهرا", lastName: "موسوی", gender: "female", phone: "09121110001",
      nationalIdLast4: "6789", nationalIdCipher: sealed.cipher, provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
    }).returning();
    const [application] = await db.insert(s.applications).values({
      activistId: activist.id, status: "draft", source: "self", createdBy: f.users.act.id,
    }).returning();
    const [trainer] = await db.select().from(s.specialties).where(eq(s.specialties.code, "trainer")).limit(1);
    await db.insert(s.activistSpecialties).values({ activistId: activist.id, specialtyId: trainer.id });
    await db.insert(s.activistSpecialtyDetails).values({ activistId: activist.id, specialtyId: trainer.id, detailOptions: ["rokhani", "tajvid"], // کلیدهای گزینهٔ معلمی — نمایش با برچسب فارسی
    });;
    await loginAs("prov");
    const workbook = await loadWorkbook(await exportCasesWorkbook());
    const full = workbook.worksheets.find((sheet) => sheet.name === "اطلاعات کامل")!;
    const header = full.getRow(2).values as string[]; // ردیف ۱ عنوان، ردیف ۲ سرستون‌ها
    const headerCells = header.slice(1);
    expect(headerCells).toContain("کد ملی");
    expect(headerCells).toContain("رشته‌های معلمی و مدرسی");
    const row = full.getRow(3).values as (string | number)[];
    expect(row[5]).toBe("0123456789"); // کد ملی کامل برای مدیر (پس از نام پدر)
    const teachIndex = headerCells.indexOf("رشته‌های معلمی و مدرسی") + 1;
    expect(String(row[teachIndex])).toContain("معلم قرآن");
    expect(String(row[teachIndex])).toContain("روخوانی و روان‌خوانی");
    expect(String(row[teachIndex])).toContain("تجوید");
  });

  it("بدون پرونده در محدوده، کتاب خالی از سطر داده ساخته می‌شود", async () => {
    await loginAs("provFars"); // استان فارس — پرونده‌ای در این محدوده نیست
    const workbook = await loadWorkbook(await exportCasesWorkbook());
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(6); // فقط سطرهای متادیتا
  });
});

describe("خروجی اکسل گزارش آماری", () => {
  it("بدون نشست → ۴۰۱؛ فعال → ۴۰۳؛ مدیر → ۲۰۰ با نمای RTL و شاخص‌ها", async () => {
    await seedCase();
    expect((await exportReport(new Request("http://feature.local/api/reports/export?format=xlsx"))).status).toBe(401);
    await loginAs("act");
    expect((await exportReport(new Request("http://feature.local/api/reports/export?format=xlsx"))).status).toBe(403);
    await loginAs("prov");
    const response = await exportReport(new Request("http://feature.local/api/reports/export?format=xlsx"));
    expect(response.status).toBe(200);
    const workbook = await loadWorkbook(response);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("گزارش آماری");
    expect(sheet.views[0]?.rightToLeft).toBe(true);
    const body = sheet.getSheetValues().join(" ");
    expect(body).toContain("کل پرونده‌ها");
    expect(body).toContain("وضعیت پرونده‌ها");
    expect(body).toContain("استان‌ها");
  });
});
