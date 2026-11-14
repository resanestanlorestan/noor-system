// Feature tests for مرحله سوم: mandatory identity fields (all but the email),
// the standalone job field and the multi-entry seminary/university education
// records (form JSON payload + detail-page add/delete actions + dossier).
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, type Fixture,
} from "./helpers";
import {  } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { addEducationRecordAction, deleteEducationRecordAction } from "@/app/actions/records";
import { loadDossier } from "@/lib/dossier";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const EDUCATION_ROWS = JSON.stringify([
  { type: "university", level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "مدرک کارشناسی" },
  { type: "seminary", level: "سطح ۲", field: "فقه", centerName: "حوزه علمیه قم", certificate: "گواهی سطح ۲" },
]);

describe("فیلدهای اجباری هویتی (همه به‌جز ایمیل)", () => {
  it("ذخیره بدون فیلدهای اجباری، فهرست کامل موارد خالی را برمی‌گرداند", async () => {
    await loginAs("super");
    const state = await saveCaseCore(form({ firstName: "علی", lastName: "رضایی" }));
    expect(state.error).toBeTruthy();
    for (const label of ["نام پدر", "کد ملی", "شماره شناسنامه", "محل صدور شناسنامه", "تاریخ تولد شمسی", "جنسیت", "شماره همراه", "شماره همراه جایگزین"]) {
      expect(state.error).toContain(label);
    }
    // The email stays optional: it is NOT listed as missing.
    expect(state.error).not.toContain("ایمیل");
  });

  it("ایمیل خالی مانع ذخیره نیست", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f)));
    expect(caseIdOf(url)).toBeTruthy();
  });
});

describe("ثبت شغل و تحصیلات از فرم پرونده", () => {
  it("شغل مستقل و ردیف‌های تحصیلی JSON با پرونده ذخیره می‌شوند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f, { job: "دانشجو", educationRecords: EDUCATION_ROWS })));
    const caseId = caseIdOf(url);
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    expect(person.job).toBe("دانشجو");
    const rows = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id));
    expect(rows).toHaveLength(2);
    const levels = rows.map((row) => row.level).sort();
    expect(levels).toEqual(["سطح ۲", "کارشناسی"]);
    const [university] = rows.filter((row) => row.type === "university");
    expect(university.centerName).toBe("دانشگاه تهران");
    expect(university.field).toBe("علوم قرآنی");
    const [seminary] = rows.filter((row) => row.type === "seminary");
    expect(seminary.centerName).toBe("حوزه علمیه قم");
    expect(caseId).toBeTruthy();
  });

  it("ویرایش بعدی فقط ردیف تازه را می‌افزاید و رکوردهای قبلی را حذف نمی‌کند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f, { educationRecords: EDUCATION_ROWS })));
    const caseId = caseIdOf(url);
    await redirectOf(() => saveCaseCore(completeProfile(f, {
      caseId,
      educationRecords: JSON.stringify([{ type: "university", level: "کارشناسی ارشد", field: "حقوق", centerName: "دانشگاه شهید بهشتی", certificate: "" }]),
    })));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const rows = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id));
    expect(rows).toHaveLength(3);
  });

  it("JSON نامعتبر یا مقطع ناسازگار با نوع، خطا می‌دهد و چیزی ذخیره نمی‌شود", async () => {
    await loginAs("act");
    const badJson = await saveCaseCore(completeProfile(f, { educationRecords: "not-json" }));
    expect(badJson.error).toContain("اطلاعات تحصیلی");
    const badLevel = await saveCaseCore(completeProfile(f, {
      educationRecords: JSON.stringify([{ type: "seminary", level: "کارشناسی" }]),
    }));
    expect(badLevel.error).toContain("اطلاعات تحصیلی");
    const remaining = await db.select().from(s.educationRecords);
    expect(remaining).toHaveLength(0);
  });

  it("ردیف‌های بدون نوع/مقطع نادیده گرفته می‌شوند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f, {
      educationRecords: JSON.stringify([{ type: "", level: "", field: "ناتمام" }]),
    })));
    const caseId = caseIdOf(url);
    expect(caseId).toBeTruthy();
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    expect(await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id))).toHaveLength(0);
  });
});

describe("مدیریت سابقه تحصیلی از صفحه پرونده", () => {
  it("افزودن و حذف سابقه با کنترل نوع/مقطع و ثبت در دفتر تغییرات", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f)));
    const caseId = caseIdOf(url);
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));

    const mismatch = await redirectOf(() => addEducationRecordAction(form({ caseId, type: "seminary", level: "دیپلم", field: "", centerName: "", certificate: "" })));
    expect(messageOf(mismatch)).toContain("سازگار");

    const added = await redirectOf(() => addEducationRecordAction(form({ caseId, type: "university", level: "دکتری", field: "علوم سیاسی", centerName: "دانشگاه تهران", certificate: "دکتری" })));
    expect(messageOf(added)).toContain("ثبت شد");
    const [row] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id));
    expect(row.level).toBe("دکتری");

    const removed = await redirectOf(() => deleteEducationRecordAction(form({ caseId, recordId: row.id })));
    expect(messageOf(removed)).toContain("حذف شد");
    expect(await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id))).toHaveLength(0);
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "add_education_record"));
    expect(audit.targetId).toBe(caseId);
  });
});

describe("دوزیه رسمی", () => {
  it("تحصیلات و شغل در داده دوزیه ظاهر می‌شوند", async () => {
    const user = await loginAs("act");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f, { job: "معلم", educationRecords: EDUCATION_ROWS })));
    const caseId = caseIdOf(url);
    const data = await loadDossier(user, caseId);
    expect(data).toBeTruthy();
    if (!data) return;
    expect(data.person.job).toBe("معلم");
    expect(data.education).toHaveLength(2);
    expect(data.education[0].main).toMatch(/حوزوی|دانشگاهی/);
  });
});
