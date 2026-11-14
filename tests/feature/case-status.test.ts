// Feature tests for مرحله هشتم: صفحهٔ مستقل «وضعیت پرونده‌ها» —
// مدل هشت‌مرحله‌ای، ساخت تایم‌لاین از روی status_history، شمارش مراحل
// در محدودهٔ مجاز و حریم خصوصی نقش‌ها.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  redirectOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, pdfFile, pngFile, nationalId, type Fixture, type UserKey,
} from "./helpers";
import { prepareCaseAction, submitCaseAction, uploadDocumentAction, uploadPhotoAction, assignExpertAction, decisionAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { referSpecialistAction, specialistOpinionAction } from "@/app/actions/workflow";
import {
  CASE_STAGES, buildCaseTimeline, listCaseStatus, stageKeyForStatus, totalsFromGroups,
  type CaseTimeline,
} from "@/lib/case-status";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const minute = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n));

describe("مدل هشت‌مرحله‌ای (واحد)", () => {
  it("هر نه وضعیت پایگاه‌داده به یکی از هشت مرحله می‌رسد", () => {
    expect(stageKeyForStatus("initial")).toBe("initial");
    expect(stageKeyForStatus("draft")).toBe("draft");
    expect(stageKeyForStatus("completing")).toBe("completing");
    expect(stageKeyForStatus("ready")).toBe("ready");
    expect(stageKeyForStatus("pending")).toBe("pending");
    expect(stageKeyForStatus("specialist_review")).toBe("specialist_review");
    expect(stageKeyForStatus("needs_correction")).toBe("needs_correction");
    // هر دو وضعیت پایانی در مرحلهٔ «نتیجه نهایی» جمع می‌شوند
    expect(stageKeyForStatus("approved")).toBe("final");
    expect(stageKeyForStatus("rejected")).toBe("final");
    expect(CASE_STAGES).toHaveLength(8);
  });

  it("تایم‌لاین، آخرین ورود به هر مرحله و مرحلهٔ جاری را درمی‌یابد", () => {
    const timeline = buildCaseTimeline({
      caseId: "case-1", activistName: "فعال آزمون", province: "تهران", county: "تهران",
      status: "pending", statusLabel: "در انتظار بررسی",
      createdAt: minute(0), updatedAt: minute(90), submittedAt: minute(60),
      history: [
        { toStatus: "initial", createdAt: minute(0) },
        { toStatus: "draft", createdAt: minute(10) },
        { toStatus: "ready", createdAt: minute(30) },
        { toStatus: "pending", createdAt: minute(60) },
        { toStatus: "specialist_review", createdAt: minute(70) },
        { toStatus: "pending", createdAt: minute(80) },
      ],
    });
    expect(timeline.stages.initial.reachedAt).toEqual(minute(0));
    expect(timeline.stages.draft.reachedAt).toEqual(minute(10));
    expect(timeline.stages.ready.reachedAt).toEqual(minute(30));
    expect(timeline.stages.pending.reachedAt).toEqual(minute(80)); // آخرین ورود، نه اولین
    expect(timeline.stages.specialist_review.reachedAt).toEqual(minute(70));
    expect(timeline.stages.completing.reached).toBe(false);
    expect(timeline.stages.needs_correction.reached).toBe(false);
    expect(timeline.stages.final.reached).toBe(false);
    expect(timeline.stages.pending.isCurrent).toBe(true);
    expect(timeline.stages.specialist_review.isCurrent).toBe(false);
    expect(timeline.outcome).toBeNull();
    expect(timeline.submittedAt).toEqual(minute(60));
  });

  it("حلقهٔ اصلاح و نتیجهٔ نهایی: مرحلهٔ «نیازمند اصلاح» با تاریخ آخرین چرخه ثبت می‌شود", () => {
    const timeline = buildCaseTimeline({
      caseId: "case-2", activistName: "فعال آزمون", province: null, county: null,
      status: "approved", statusLabel: "تأییدشده",
      createdAt: minute(0), updatedAt: minute(200), submittedAt: minute(60),
      history: [
        { toStatus: "draft", createdAt: minute(10) },
        { toStatus: "ready", createdAt: minute(20) },
        { toStatus: "pending", createdAt: minute(30) },
        { toStatus: "needs_correction", createdAt: minute(40) },
        { toStatus: "completing", createdAt: minute(50) },
        { toStatus: "ready", createdAt: minute(60) },
        { toStatus: "pending", createdAt: minute(70) },
        { toStatus: "approved", createdAt: minute(200) },
      ],
    });
    expect(timeline.stages.needs_correction.reachedAt).toEqual(minute(40));
    expect(timeline.stages.completing.reachedAt).toEqual(minute(50));
    expect(timeline.stages.final.reached).toBe(true);
    expect(timeline.stages.final.reachedAt).toEqual(minute(200));
    expect(timeline.stages.final.isCurrent).toBe(true);
    expect(timeline.outcome).toBe("approved");
    // ثبت‌نام اولیه بدون ردیف history هم از زمان ساخت در دسترس است
    expect(timeline.stages.initial.reached).toBe(true);
    expect(timeline.stages.initial.reachedAt).toEqual(minute(0));
    expect(timeline.waitingDays).toBeGreaterThanOrEqual(0);
  });

  it("پروندهٔ تازه بدون history: پیش‌نویس مرحلهٔ جاری است و بقیه طی نشده", () => {
    const timeline = buildCaseTimeline({
      caseId: "case-3", activistName: "فعال آزمون", province: null, county: null,
      status: "draft", statusLabel: "پیش‌نویس",
      createdAt: minute(0), updatedAt: minute(5), submittedAt: null,
      history: [],
    });
    expect(timeline.stages.initial.reached).toBe(true);
    expect(timeline.stages.draft.isCurrent).toBe(true);
    for (const stage of CASE_STAGES) {
      if (stage.key !== "initial" && stage.key !== "draft") expect(timeline.stages[stage.key].reached).toBe(false);
    }
    expect(timeline.outcome).toBeNull();
  });

  it("شمارش مراحل، تأییدشده و ردشده را در «نتیجه نهایی» جمع می‌کند", () => {
    const totals = totalsFromGroups([
      { status: "initial", total: 2 },
      { status: "pending", total: 3 },
      { status: "approved", total: 4 },
      { status: "rejected", total: 1 },
    ]);
    expect(totals.initial).toBe(2);
    expect(totals.pending).toBe(3);
    expect(totals.final).toBe(5);
    expect(totals.draft).toBe(0);
    expect(totals.completing).toBe(0);
  });
});

/** Draft + evidence + prepare + submit → پرونده در «در انتظار بررسی». */
async function pendingCase(creator: UserKey = "act", overrides: Record<string, string | string[]> = {}) {
  await loginAs(creator);
  const url = await redirectOf(() => saveCaseCore(completeProfile(f, overrides)));
  const caseId = caseIdOf(url);
  await loginAs(creator);
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
  expect(photo.error).toBeUndefined();
  await redirectOf(() => prepareCaseAction(form({ caseId })));
  await redirectOf(() => submitCaseAction(form({ caseId })));
  return caseId;
}

const timelineOf = (bundle: Awaited<ReturnType<typeof listCaseStatus>>, caseId: string): CaseTimeline => {
  const timeline = bundle.timelines.find((row) => row.caseId === caseId);
  expect(timeline).toBeTruthy();
  return timeline!;
};

describe("تایم‌لاین زنده در طول گردش کار (Feature)", () => {
  it("از ثبت‌نام تا ارسال: مراحل طی‌شده با تاریخ واقعی ثبت می‌شوند", async () => {
    const caseId = await pendingCase("act");
    const bundle = await listCaseStatus(f.users.super);
    expect(bundle.total).toBe(1);
    const timeline = timelineOf(bundle, caseId);
    expect(timeline.activistName).toBe("زهرا موسوی");
    expect(timeline.status).toBe("pending");
    for (const key of ["initial", "draft", "ready", "pending"] as const) {
      expect(timeline.stages[key].reached).toBe(true);
    }
    expect(timeline.stages.pending.isCurrent).toBe(true);
    for (const key of ["completing", "specialist_review", "needs_correction", "final"] as const) {
      expect(timeline.stages[key].reached).toBe(false);
    }
    expect(timeline.stages.initial.reachedAt).toEqual(timeline.createdAt);
    expect(timeline.submittedAt).not.toBeNull();
    expect(bundle.totals.pending).toBe(1);
    expect(bundle.totals.final).toBe(0);
  });

  it("ارجاع تخصصی و بازگشت: مرحلهٔ «بررسی تخصصی» در مسیر ثبت می‌شود", async () => {
    const caseId = await pendingCase("act");
    await loginAs("prov");
    await redirectOf(() => assignExpertAction(form({ caseId, expertId: f.users.rev.id })));
    await redirectOf(() => referSpecialistAction(form({ caseId, specialistId: f.users.spec.id, specialtyId: String(f.specialtyId) })));
    let bundle = await listCaseStatus(f.users.super);
    let timeline = timelineOf(bundle, caseId);
    expect(timeline.status).toBe("specialist_review");
    expect(timeline.stages.specialist_review.isCurrent).toBe(true);
    expect(timeline.stages.specialist_review.reached).toBe(true);

    const [referral] = await db.select().from(s.expertReferrals).where(eq(s.expertReferrals.applicationId, caseId));
    expect(referral).toBeTruthy();
    await loginAs("spec");
    await redirectOf(() => specialistOpinionAction(form({ caseId, referralId: referral.id, outcome: "approved", opinion: "حوزه تخصصی متقاضی تأیید می‌شود." })));
    bundle = await listCaseStatus(f.users.super);
    timeline = timelineOf(bundle, caseId);
    expect(timeline.status).toBe("pending");
    expect(timeline.stages.specialist_review.isCurrent).toBe(false);
    expect(timeline.stages.specialist_review.reached).toBe(true);
    expect(timeline.stages.pending.isCurrent).toBe(true);
  });

  it("تأیید نهایی: پرونده به مرحلهٔ «نتیجه نهایی» با outcome تأیید می‌رسد", async () => {
    const caseId = await pendingCase("act");
    await loginAs("prov");
    await redirectOf(() => decisionAction(form({ caseId, decision: "approve", note: "تأیید نهایی کمیته" })));
    const bundle = await listCaseStatus(f.users.super);
    const timeline = timelineOf(bundle, caseId);
    expect(timeline.status).toBe("approved");
    expect(timeline.outcome).toBe("approved");
    expect(timeline.stages.final.isCurrent).toBe(true);
    expect(timeline.stages.final.reached).toBe(true);
    expect(bundle.totals.final).toBe(1);
    expect(bundle.totals.pending).toBe(0);
    // مرتب‌سازی: پروندهٔ پیش‌رفته‌تر در بالای فهرست
    expect(bundle.timelines[0].caseId).toBe(caseId);
  });

  it("حریم خصوصی: فعال فقط پرونده خودش را می‌بیند و مدیر استان دیگر محدوده چیزی نمی‌بیند", async () => {
    const caseA = await pendingCase("act");
    // پروندهٔ دوم: ثبت سازمانی توسط مدیر استان تهران با هویت متفاوت
    await loginAs("prov");
    const urlB = await redirectOf(() => saveCaseCore(completeProfile(f, {
      firstName: "محمد", lastName: "کریمی", nationalId: nationalId("234567890"), phone: "09121110002",
    })));
    const caseB = caseIdOf(urlB);
    expect(caseB).not.toBe(caseA);

    const asActivist = await listCaseStatus(f.users.act);
    expect(asActivist.total).toBe(1);
    expect(asActivist.timelines[0].caseId).toBe(caseA);

    const asFars = await listCaseStatus(f.users.provFars);
    expect(asFars.total).toBe(0);
    expect(asFars.timelines).toHaveLength(0);

    const asProvince = await listCaseStatus(f.users.prov);
    expect(asProvince.total).toBe(2);
    expect(asProvince.timelines.map((row) => row.caseId).sort()).toEqual([caseA, caseB].sort());
    // هر دو پرونده در محدودهٔ استان تهران — شمارش مرحلهٔ در انتظار بررسی = ۱ (فقط caseA ارسال شده)
    expect(asProvince.totals.pending).toBe(1);
    expect(asProvince.totals.draft).toBe(1); // caseB پیش‌نویس است (ثبت سازمانی با گذار اولیه به پیش‌نویس)
  });

  it("مرحلهٔ «نیازمند اصلاح» پس از اعلام نقص در تایم‌لاین زنده ثبت می‌شود", async () => {
    const caseId = await pendingCase("act");
    await loginAs("prov");
    await redirectOf(() => decisionAction(form({ caseId, decision: "correction", note: "مدرک سابقه فعالیت ناقص است." })));
    const bundle = await listCaseStatus(f.users.super);
    const timeline = timelineOf(bundle, caseId);
    expect(timeline.status).toBe("needs_correction");
    expect(timeline.stages.needs_correction.isCurrent).toBe(true);
    expect(timeline.stages.needs_correction.reached).toBe(true);
    expect(bundle.totals.needs_correction).toBe(1);
  });
});
