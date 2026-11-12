// Feature tests for مرحله پنجم: the work-history records (سابقه شغلی) —
// JSON payload rows from the profile form + detail-page add/delete actions
// + audit trail + dossier appearance.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, type Fixture,
} from "./helpers";
import { saveCaseAction } from "@/app/actions/cases";
import { addWorkHistoryAction, deleteWorkHistoryAction } from "@/app/actions/records";
import { loadDossier } from "@/lib/dossier";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const WORK_ROWS = JSON.stringify([
  { title: "دبیری آموزش و پرورش", employer: "اداره آموزش و پرورش", position: "دبیر", startDate: "1395/06/01" },
  { title: "کارشناس فرهنگی", employer: "سازمان تبلیغات اسلامی", position: "کارشناس", startDate: "1398/01/15", endDate: "1401/03/30" },
]);

describe("ثبت سابقه شغلی از فرم پرونده", () => {
  it("ردیف‌های سابقه شغلی JSON با پرونده ذخیره می‌شوند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { workHistory: WORK_ROWS })));
    const caseId = caseIdOf(url);
    expect(caseId).toBeTruthy();
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const rows = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id));
    expect(rows).toHaveLength(2);
    const titles = rows.map((row) => row.title);
    expect(titles).toEqual(expect.arrayContaining(["دبیری آموزش و پرورش", "کارشناس فرهنگی"]));
    const [current] = rows.filter((row) => row.title === "دبیری آموزش و پرورش");
    expect(current.employer).toBe("اداره آموزش و پرورش");
    expect(current.position).toBe("دبیر");
    expect(current.startDate).toBe("2016-08-22");
    expect(current.endDate).toBeNull();
  });

  it("ویرایش بعدی فقط ردیف تازه را می‌افزاید و رکوردهای قبلی را حذف نمی‌کند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { workHistory: WORK_ROWS })));
    const caseId = caseIdOf(url);
    await redirectOf(() => saveCaseAction({}, completeProfile(f, {
      caseId,
      workHistory: JSON.stringify([{ title: "مدیر فرهنگسرا", employer: "شهرداری", position: "مدیر", startDate: "1400/01/10" }]),
    })));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const rows = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id));
    expect(rows).toHaveLength(3);
  });

  it("JSON نامعتبر یا تاریخ شمسی ناسازگار، خطا می‌دهد و چیزی ذخیره نمی‌شود", async () => {
    await loginAs("act");
    const badJson = await saveCaseAction({}, completeProfile(f, { workHistory: "not-json" }));
    expect(badJson.error).toContain("سوابق شغلی");
    const badDate = await saveCaseAction({}, completeProfile(f, {
      workHistory: JSON.stringify([{ title: "کارمند فروش", startDate: "نامعتبر" }]),
    }));
    expect(badDate.error).toContain("سوابق شغلی");
    const endDateBeforeStart = await saveCaseAction({}, completeProfile(f, {
      workHistory: JSON.stringify([{ title: "کارمند فروش", startDate: "1400/01/01", endDate: "1399/01/01" }]),
    }));
    expect(endDateBeforeStart.error).toContain("سوابق شغلی");
    expect(await db.select().from(s.workHistory)).toHaveLength(0);
  });

  it("ردیف بدون عنوان نادیده گرفته می‌شود", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, {
      workHistory: JSON.stringify([{ title: "", employer: "بدون عنوان" }]),
    })));
    expect(caseIdOf(url)).toBeTruthy();
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    expect(await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id))).toHaveLength(0);
  });
});

describe("مدیریت سابقه شغلی از صفحه پرونده", () => {
  it("افزودن و حذف سابقه با اعتبارسنجی تاریخ و ثبت در دفتر تغییرات", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f)));
    const caseId = caseIdOf(url);
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));

    const shortTitle = await redirectOf(() => addWorkHistoryAction(form({ caseId, title: "م", employer: "", position: "", startDate: "", endDate: "", description: "" })));
    expect(messageOf(shortTitle)).toContain("عنوان سابقه شغلی");

    const badDates = await redirectOf(() => addWorkHistoryAction(form({ caseId, title: "دبیر ریاضی", employer: "", position: "", startDate: "۱۴۰۰/۱۳/۰۱", endDate: "", description: "" })));
    expect(messageOf(badDates)).toContain("شمسی معتبر");

    const added = await redirectOf(() => addWorkHistoryAction(form({ caseId, title: "دبیر ریاضی", employer: "دبیرستان شهید بهشتی", position: "دبیر", startDate: "1397/07/01", endDate: "1400/06/30", description: "" })));
    expect(messageOf(added)).toContain("ثبت شد");
    const [row] = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id));
    expect(row.title).toBe("دبیر ریاضی");
    expect(row.startDate).toBe("2018-09-23");

    const removed = await redirectOf(() => deleteWorkHistoryAction(form({ caseId, recordId: row.id })));
    expect(messageOf(removed)).toContain("حذف شد");
    expect(await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id))).toHaveLength(0);
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "add_work_history"));
    expect(audit.targetId).toBe(caseId);
  });
});

describe("دوزیه رسمی", () => {
  it("سابقه شغلی در داده دوزیه ظاهر می‌شود", async () => {
    const user = await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { workHistory: WORK_ROWS })));
    const caseId = caseIdOf(url);
    const data = await loadDossier(user, caseId);
    expect(data).toBeTruthy();
    if (!data) return;
    expect(data.workHistory).toHaveLength(2);
    expect(data.workHistory[0].main).toBeTruthy();
    expect(data.workHistory.some((item) => item.period.includes("تا"))).toBe(true);
  });
});
