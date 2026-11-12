// Feature tests for مرحله چهارم: multi-select Quranic specialties with
// structured per-specialty details (memorizer juz range, reciter level,
// checklist specialties) plus the author's multiple book/article entries —
// form payloads, validation, replacement-on-edit, detail-page add/delete and
// the printable dossier.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, type Fixture,
} from "./helpers";
import { saveCaseAction } from "@/app/actions/cases";
import { addWritingAction, deleteWritingAction } from "@/app/actions/records";
import { loadDossier } from "@/lib/dossier";

let f: Fixture;
let ids: Record<string, number> = {};

beforeAll(async () => {
  f = await featureSeed();
  const rows = await db.select().from(s.specialties).where(inArray(s.specialties.code, ["memorizer", "reciter", "judge", "author", "commentator", "trainer"]));
  ids = Object.fromEntries(rows.map((row) => [row.code, row.id]));
}, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const DETAILS = JSON.stringify([
  { code: "memorizer", value: "15" },
  { code: "reciter", value: "5" },
  { code: "judge", options: ["tajvid", "hifz"] },
]);
// Computed lazily (after beforeAll fills `ids`) — module-level evaluation
// would run before the fixture lookup and produce an empty list.
const specialtiesList = () => [ids.memorizer, ids.reciter, ids.judge].filter(Boolean).map(String);
const WRITINGS = JSON.stringify([
  { workType: "book", title: "نگاهی به فضایل قرآن", topic: "تفسیر موضوعی" },
  { workType: "article", title: "تدبر در سوره کهف", topic: "تدبر" },
]);

describe("ثبت جزئیات تخصص‌ها از فرم پرونده", () => {
  it("حافظ/قاری/داور با جزئیات ساختاریافته ذخیره می‌شوند", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: DETAILS, writings: WRITINGS })));
    expect(caseIdOf(url)).toBeTruthy();
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const rows = await db.select().from(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, person.id));
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((row) => [row.specialtyId, row]));
    expect(byId.get(ids.memorizer)!.detailValue).toBe("15");
    expect(byId.get(ids.reciter)!.detailValue).toBe("5");
    expect(byId.get(ids.judge)!.detailOptions).toEqual(["tajvid", "hifz"]);
    // آثار مؤلف هم با همان ذخیره ثبت می‌شوند
    const writings = await db.select().from(s.activistWritings).where(eq(s.activistWritings.activistId, person.id));
    expect(writings).toHaveLength(2);
  });

  it("تخصص انتخاب‌شده بدون جزئیات، خطا با عنوان تخصص می‌دهد", async () => {
    await loginAs("act");
    const state = await saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: "[]" }));
    expect(state.error).toContain("کامل نشده");
    expect(state.error).toContain("حافظ قرآن");
    expect(await db.select().from(s.activistSpecialtyDetails)).toHaveLength(0);
  });

  it("مقدار نامعتبر (جزء ۳۵) خطا می‌دهد و چیزی ذخیره نمی‌شود", async () => {
    await loginAs("act");
    const badValue = await saveCaseAction({}, completeProfile(f, {
      specialties: specialtiesList(),
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "35" }]),
    }));
    expect(badValue.error).toContain("معتبر نیست");
    const badOption = await saveCaseAction({}, completeProfile(f, {
      specialties: specialtiesList(),
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "15" }, { code: "judge", options: ["nope"] }]),
    }));
    expect(badOption.error).toBeTruthy();
    expect(await db.select().from(s.activistSpecialtyDetails)).toHaveLength(0);
  });

  it("جزئیات برای تخصص انتخاب‌نشده پذیرفته نمی‌شود", async () => {
    await loginAs("act");
    const state = await saveCaseAction({}, completeProfile(f, {
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "15" }]),
    }));
    expect(state.error).toContain("انتخاب نشده");
  });

  it("ویرایش بعدی جزئیات را جایگزین می‌کند (۱۵ جزء ← کل قرآن)", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: DETAILS })));
    const caseId = caseIdOf(url);
    await redirectOf(() => saveCaseAction({}, completeProfile(f, {
      caseId,
      specialties: specialtiesList(),
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "complete" }, { code: "reciter", value: "7" }, { code: "judge", options: ["waqf"] }]),
    })));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const rows = await db.select().from(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, person.id));
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((row) => [row.specialtyId, row]));
    expect(byId.get(ids.memorizer)!.detailValue).toBe("complete");
    expect(byId.get(ids.reciter)!.detailValue).toBe("7");
    expect(byId.get(ids.judge)!.detailOptions).toEqual(["waqf"]);
  });

  it("عنوان کوتاه اثر خطا می‌دهد", async () => {
    await loginAs("act");
    const state = await saveCaseAction({}, completeProfile(f, {
      specialties: specialtiesList(),
      specialtyDetails: DETAILS,
      writings: JSON.stringify([{ workType: "book", title: "ک" }]),
    }));
    expect(state.error).toContain("آثار مؤلف");
  });
});

describe("مدیریت آثار مؤلف از صفحه پرونده", () => {
  it("افزودن و حذف اثر با ثبت در دفتر تغییرات", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: DETAILS })));
    const caseId = caseIdOf(url);
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));

    const bad = await redirectOf(() => addWritingAction(form({ caseId, workType: "thesis", title: "بدون نوع معتبر" })));
    expect(messageOf(bad)).toContain("نوع اثر معتبر نیست");

    const added = await redirectOf(() => addWritingAction(form({ caseId, workType: "book", title: "قرآن و عصمت", topic: "علوم قرآنی" })));
    expect(messageOf(added)).toContain("ثبت شد");
    const [row] = await db.select().from(s.activistWritings).where(eq(s.activistWritings.activistId, person.id));
    expect(row.title).toBe("قرآن و عصمت");
    expect(row.topic).toBe("علوم قرآنی");

    const removed = await redirectOf(() => deleteWritingAction(form({ caseId, recordId: row.id })));
    expect(messageOf(removed)).toContain("حذف شد");
    expect(await db.select().from(s.activistWritings).where(eq(s.activistWritings.activistId, person.id))).toHaveLength(0);
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "add_writing"));
    expect(audit.targetId).toBe(caseId);
  });

  it("ذخیره بعدی فرم، آثار قبلی را حذف نمی‌کند (فقط افزودنی)", async () => {
    await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: DETAILS, writings: WRITINGS })));
    const caseId = caseIdOf(url);
    await redirectOf(() => saveCaseAction({}, completeProfile(f, {
      caseId,
      specialties: specialtiesList(),
      specialtyDetails: DETAILS,
      writings: JSON.stringify([{ workType: "article", title: "مقاله تازه", topic: "" }]),
    })));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const writings = await db.select().from(s.activistWritings).where(eq(s.activistWritings.activistId, person.id));
    expect(writings).toHaveLength(3);
  });
});

describe("دوزیه رسمی", () => {
  it("جزئیات تخصص‌ها و آثار در داده دوزیه ظاهر می‌شوند", async () => {
    const user = await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { specialties: specialtiesList(), specialtyDetails: DETAILS, writings: WRITINGS })));
    const caseId = caseIdOf(url);
    const data = await loadDossier(user, caseId);
    expect(data).toBeTruthy();
    if (!data) return;
    expect(data.specialtyTitles).toContain("حافظ قرآن");
    const memorizer = data.specialtyDetailLines.find((line) => line.title === "حافظ قرآن");
    expect(memorizer?.detail).toBe("جزء ۱۵");
    const judge = data.specialtyDetailLines.find((line) => line.title === "داور و ممتحن قرآنی");
    expect(judge?.detail).toContain("تجوید");
    expect(judge?.detail).toContain("حفظ");
    expect(data.writings).toHaveLength(2);
    expect(data.writings[0].extra).toContain("کتاب");
  });
});
