// Feature tests for the overdue-cases Excel export: auth guards, permission
// gating, scope-respecting rows, masked phones and the workbook structure —
// against the real noor_feature database.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import ExcelJS from "exceljs";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { OVERDUE_EXPORT_COLUMNS, buildOverdueRow, overdueFilename, overdueHeaderRows } from "@/lib/overdue-export";
import { GET as exportOverdue } from "@/app/api/exports/overdue/route";

let f: Fixture;

beforeAll(async () => {
  f = await featureSeed();
  // Staff phone used by the masked-phone assertion below.
  await db.update(s.users).set({ phone: "09121110222" }).where(eq(s.users.id, f.users.rev.id));
}, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const ago = (days: number) => new Date(Date.now() - days * 86400000);

async function overdueCase(options: { ageDays?: number; assigned?: boolean } = {}) {
  const { ageDays = 20, assigned = true } = options;
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", phone: "09121110222",
    provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "pending", source: "manager",
    createdBy: f.users.prov.id, assignedExpertId: assigned ? f.users.rev.id : null,
    submittedAt: ago(ageDays), createdAt: ago(ageDays), updatedAt: ago(ageDays),
  }).returning();
  return { activist, application };
}

async function exportWorkbook(days = "14") {
  const request = new Request(`http://feature.local/api/exports/overdue?days=${days}`);
  return exportOverdue(request);
}

describe("گارد خروجی معوق‌ها", () => {
  it("بدون نشست → ۴۰۱؛ فعال و کارشناس بررسی → ۴۰۳", async () => {
    await overdueCase();
    const anonymous = await exportWorkbook();
    expect(anonymous.status).toBe(401);
    await loginAs("act");
    expect((await exportWorkbook()).status).toBe(403);
    await loginAs("rev");
    expect((await exportWorkbook()).status).toBe(403);
  });

  it("سه نقش مدیریتی خروجی می‌گیرند", async () => {
    await overdueCase();
    await loginAs("prov");
    expect((await exportWorkbook()).status).toBe(200);
    await loginAs("county");
    expect((await exportWorkbook()).status).toBe(200);
    await loginAs("super");
    expect((await exportWorkbook()).status).toBe(200);
  });
});

describe("ساخت کتاب اکسل", () => {
  it("سطرهای متادیتا، ستون‌ها و فقط پرونده‌های واقعاً معوق", async () => {
    await overdueCase({ ageDays: 20 });
    await overdueCase({ ageDays: 25, assigned: false });
    await overdueCase({ ageDays: 5 }); // fresh — must not appear
    await loginAs("prov");
    const response = await exportWorkbook("14");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("A1").value).toContain("معوق");
    expect(String(sheet.getCell("A2").value)).toContain("تاریخ تولید:");
    expect(String(sheet.getCell("A4").value)).toContain("۲");

    const headerRow = sheet.getRow(6);
    expect((headerRow.values as string[]).slice(1)).toEqual([...OVERDUE_EXPORT_COLUMNS]);

    // oldest first: the 25-day unassigned case (responsible = staff creator),
    // then the 20-day assigned one (responsible = assigned expert)
    expect(sheet.rowCount).toBe(6 + 2);
    const oldest = sheet.getRow(7).values as (string | number)[];
    expect(oldest[2]).toBe("زهرا موسوی");
    expect(Number(oldest[5])).toBeGreaterThanOrEqual(25);
    expect(oldest[6]).toBe("ثبت‌کننده سازمانی");
    expect(oldest[7]).toBe("—"); // creator has no phone on file
    const second = sheet.getRow(8).values as (string | number)[];
    expect(second[6]).toBe("کارشناس ارجاع‌شده");
    expect(String(second[7])).toMatch(/^0912\*\*\*0222$/); // masked phone
  });

  it("آستانه ۷ روز پرونده جوان‌تر از ۱۴ روز را هم شامل می‌شود", async () => {
    await overdueCase({ ageDays: 10 });
    await loginAs("prov");
    const response = await exportWorkbook("7");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    expect(workbook.worksheets[0].rowCount).toBe(6 + 1);
    expect(String(workbook.worksheets[0].getCell("A3").value)).toContain("۷ روز");
  });
});

describe("توابع خالص خروجی", () => {
  it("نام فایل با الگوی زمانی و برچسب آستانه فارسی", () => {
    expect(overdueFilename(new Date("2026-11-09T10:20:00Z"))).toMatch(/^noor-overdue-cases-\d{8}-\d{4}\.xlsx$/);
    expect(overdueHeaderRows(30, 4)[2]).toContain("۳۰ روز");
    const row = buildOverdueRow({
      id: "case-1", status: "pending", updatedAt: ago(15),
      activistName: "زهرا موسوی", activistPhone: "09121110099", activistUserId: null, activistUserActive: null,
      province: "تهران", county: "تهران",
      expertId: null, expertName: null, expertPhone: null, expertActive: null,
      creatorId: "creator-1", creatorRole: "province_admin", creatorName: "مدیر استان", creatorPhone: null, creatorActive: true,
      lastReminderAt: null, waitingDays: 15, cooldownActive: false,
    }, 0);
    expect(row[5]).toBe("ثبت‌کننده سازمانی");
    expect(row[6]).toBe("—");
    expect(row[7]).toBe("—");
  });
});
