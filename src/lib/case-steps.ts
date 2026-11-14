// موتور قفل مراحل ثبت اطلاعات (الحاقیهٔ ۲.۱۰.۰)
// -----------------------------------------------------------
// منبع یگانهٔ حقیقت زنجیرهٔ مراحل: هم صفحات ویزارد و هم همهٔ
// اکشن‌های سرور از همین ماژول وضعیت مراحل را می‌خوانند تا هیچ
// مسیری (تغییر URL، فراخوانی مستقیم اکشن، یا ورود با لینک) نتواند
// بدون تکمیل و ذخیرهٔ مراحل قبلی به مرحلهٔ بعدی برسد.
//
// زنجیرهٔ پنج‌مرحله‌ای:
//   ۱) اطلاعات هویتی و تماس
//   ۲) سکونت و محل فعالیت
//   ۳) تخصص‌ها، تحصیلات و سوابق
//   ۴) مدارک و تصویر پرسنلی
//   ۵) بازبینی و ارسال
//
// هر مرحله یکی از چهار وضعیت را دارد: completed (تکمیل‌شده)،
// in_progress (در حال تکمیل)، incomplete (تکمیل‌نشده) و locked
// (قفل‌شده). وضعیت‌ها هر بار از دادهٔ واقعی پایگاه‌داده محاسبه
// می‌شوند؛ بنابراین اگر ویرایش بعدی باعث ناقص شدن مرحله‌ای شود،
// وضعیت همان مرحله و مراحل بعدی بی‌درنگ اصلاح می‌شود.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, documents, specialties } from "@/db/schema";
import { specialtyDetailSpec } from "@/lib/constants";
import type { AppStatus } from "@/lib/constants";
import type { activists } from "@/db/schema";

export type CaseStepKey = "identity" | "location" | "specialties" | "documents" | "review";
export type CaseStepStatus = "completed" | "in_progress" | "incomplete" | "locked";

export const caseStepStatusLabel: Record<CaseStepStatus, string> = {
  completed: "تکمیل‌شده",
  in_progress: "در حال تکمیل",
  incomplete: "تکمیل‌نشده",
  locked: "قفل‌شده",
};

export const CASE_STEPS: ReadonlyArray<{ key: CaseStepKey; title: string; hint: string }> = [
  { key: "identity", title: "اطلاعات هویتی و تماس", hint: "مشخصات فردی، شناسنامه‌ای و شماره‌های تماس" },
  { key: "location", title: "سکونت و محل فعالیت", hint: "استان و شهرستان سکونت و فعالیت قرآنی" },
  { key: "specialties", title: "تخصص‌ها، تحصیلات و سوابق", hint: "حداقل یک تخصص با جزئیات کامل؛ تحصیلات و سوابق اختیاری" },
  { key: "documents", title: "مدارک و تصویر پرسنلی", hint: "حداقل یک مدرک پشتیبان و تصویر پرسنلی معتبر" },
  { key: "review", title: "بازبینی و ارسال", hint: "بازبینی نهایی، کنترل آمادگی و ارسال برای بررسی" },
];

const caseStepIndex = Object.fromEntries(CASE_STEPS.map((step, index) => [step.key, index])) as Record<CaseStepKey, number>;

type ActivistRow = typeof activists.$inferSelect;

/** Data facts the step engine needs; loaded once per request by
 *  loadCaseStepFacts() or assembled directly by the feature tests. */
export type CaseStepFacts = {
  status: AppStatus;
  person: Pick<ActivistRow, "firstName" | "lastName" | "fatherName" | "nationalIdHash" | "idCardNumber" | "idIssuePlace" | "birthDate" | "gender" | "phone" | "alternatePhone" | "provinceId" | "countyId" | "photoDocumentId">;
  specialtyCount: number;
  /** Titles of selected specialties whose structured detail is missing. */
  specialtyDetailMissing: string[];
  evidenceCount: number;
  photoOk: boolean;
};

/** Loads the facts for one case. Callers already hold the application and
 *  activist rows (getCaseForUser), so only the small aggregate queries run. */
export async function loadCaseStepFacts(person: ActivistRow, status: AppStatus, applicationId: string): Promise<CaseStepFacts> {
  const [specRows, detailRows, evidenceRows] = await Promise.all([
    db.select({ specialtyId: activistSpecialties.specialtyId, code: specialties.code, title: specialties.title })
      .from(activistSpecialties)
      .innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id))
      .where(eq(activistSpecialties.activistId, person.id)),
    db.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions })
      .from(activistSpecialtyDetails)
      .where(eq(activistSpecialtyDetails.activistId, person.id)),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "evidence"))),
  ]);
  const detailBySpecialty = new Map(detailRows.map((row) => [row.specialtyId, row]));
  const specialtyDetailMissing: string[] = [];
  for (const spec of specRows) {
    const specDef = specialtyDetailSpec[spec.code];
    if (!specDef || (specDef.kind !== "juz" && specDef.kind !== "level" && specDef.kind !== "checklist")) continue;
    const detail = detailBySpecialty.get(spec.specialtyId);
    const ok = specDef.kind === "checklist" ? (detail?.detailOptions?.length ?? 0) > 0 : Boolean(detail?.detailValue);
    if (!ok) specialtyDetailMissing.push(spec.title);
  }
  return { status, person, specialtyCount: specRows.length, specialtyDetailMissing, evidenceCount: evidenceRows.length, photoOk: Boolean(person.photoDocumentId) };
}

/** Missing identity items (step 1). Same field set the submit gate
 *  (missingRequired) has always enforced — kept in sync by tests. */
export function identityMissing(person: CaseStepFacts["person"]): string[] {
  const missing: string[] = [];
  if (!person.firstName || !person.lastName) missing.push("نام و نام خانوادگی");
  if (!person.fatherName) missing.push("نام پدر");
  if (!person.nationalIdHash) missing.push("کد ملی معتبر");
  if (!person.idCardNumber) missing.push("شماره شناسنامه");
  if (!person.idIssuePlace) missing.push("محل صدور شناسنامه");
  if (!person.birthDate) missing.push("تاریخ تولد شمسی");
  if (!person.gender) missing.push("جنسیت");
  if (!person.phone) missing.push("شماره تماس");
  if (!person.alternatePhone) missing.push("شماره همراه جایگزین");
  return missing;
}

/** Missing location items (step 2). */
export function locationMissing(person: CaseStepFacts["person"]): string[] {
  const missing: string[] = [];
  if (!person.provinceId || !person.countyId) missing.push("استان و شهرستان سکونت");
  return missing;
}

/** Missing specialty items (step 3). */
export function specialtiesMissing(facts: Pick<CaseStepFacts, "specialtyCount" | "specialtyDetailMissing">): string[] {
  const missing: string[] = [];
  if (!facts.specialtyCount) missing.push("حداقل یک تخصص قرآنی");
  if (facts.specialtyDetailMissing.length) missing.push(`جزئیات تخصص‌ها: ${facts.specialtyDetailMissing.join("، ")}`);
  return missing;
}

/** Missing documents items (step 4). */
export function documentsMissing(facts: Pick<CaseStepFacts, "evidenceCount" | "photoOk">): string[] {
  const missing: string[] = [];
  if (!facts.evidenceCount) missing.push("حداقل یک مدرک پشتیبان");
  if (!facts.photoOk) missing.push("تصویر پرسنلی");
  return missing;
}

const SUBMITTED_STATUSES: ReadonlyArray<AppStatus> = ["pending", "specialist_review", "approved", "rejected"];

/** Missing review items (step 5) — the case must have been sent for review. */
export function reviewMissing(facts: Pick<CaseStepFacts, "status">): string[] {
  return SUBMITTED_STATUSES.includes(facts.status) ? [] : ["کنترل آمادگی و ارسال پرونده برای بررسی"];
}

type StepCompletion = { missing: string[]; started: boolean };

/** Pure per-step computation — unit-testable without a database. */
export function stepCompletions(facts: CaseStepFacts): Record<CaseStepKey, StepCompletion> {
  const identity = identityMissing(facts.person);
  const location = locationMissing(facts.person);
  const specialties = specialtiesMissing(facts);
  const documents = documentsMissing(facts);
  const review = reviewMissing(facts);
  return {
    identity: { missing: identity, started: identity.length < 9 },
    location: { missing: location, started: Boolean(facts.person.provinceId || facts.person.countyId) },
    specialties: { missing: specialties, started: facts.specialtyCount > 0 },
    documents: { missing: documents, started: facts.evidenceCount > 0 || facts.photoOk },
    review: { missing: review, started: facts.status === "ready" || SUBMITTED_STATUSES.includes(facts.status) },
  };
}

export type CaseStepView = {
  key: CaseStepKey;
  index: number;
  title: string;
  hint: string;
  status: CaseStepStatus;
  missing: string[];
};

export type CaseStepPlan = {
  steps: CaseStepView[];
  /** Zero-based index of the first incomplete step (the one the user works on). */
  activeIndex: number;
  completedCount: number;
  totalCount: number;
};

/** Computes the full step plan. The chain rule: a step is unlocked only when
 *  every step before it is completed; the first incomplete step is the active
 *  one ("در حال تکمیل" یا "تکمیل‌نشده") و مراحل بعد از آن قفل هستند. Steps
 *  after the active one that are already complete (legacy data) keep their
 *  completed status — the chain gates forward movement, not existing data. */
export function computeCaseSteps(facts: CaseStepFacts): CaseStepPlan {
  const completions = stepCompletions(facts);
  const keys = CASE_STEPS.map((step) => step.key);
  const activeIndex = keys.findIndex((key) => completions[key].missing.length > 0);
  const resolvedIndex = activeIndex === -1 ? keys.length - 1 : activeIndex;
  const steps = CASE_STEPS.map((step, index) => {
    const completion = completions[step.key];
    const complete = completion.missing.length === 0;
    let status: CaseStepStatus;
    if (complete) status = "completed";
    else if (index < resolvedIndex) status = "completed";
    else if (index === resolvedIndex) status = completion.started ? "in_progress" : "incomplete";
    else status = "locked";
    return { key: step.key, index, title: step.title, hint: step.hint, status, missing: completion.missing };
  });
  const completedCount = steps.filter((step) => step.status === "completed").length;
  return { steps, activeIndex: resolvedIndex, completedCount, totalCount: steps.length };
}

/** Server-side chain guard for actions and pages: returns the Persian error
 *  naming the first incomplete step, or null when the requested step may be
 *  entered. `step` is zero-based. */
export function stepGateError(plan: CaseStepPlan, step: number, requestedStepTitle?: string): string | null {
  if (step < 0 || step >= plan.totalCount) return "مرحلهٔ درخواستی معتبر نیست.";
  const previousIncomplete = plan.steps.filter((item) => item.index < step && item.status !== "completed");
  if (!previousIncomplete.length) return null;
  const first = previousIncomplete[0];
  const detail = first.missing.length ? ` (موارد ناقص: ${first.missing.join("، ")})` : "";
  const target = requestedStepTitle ? ` برای ورود به مرحلهٔ «${requestedStepTitle}»` : "";
  return `مراحل قبلی هنوز کامل نشده‌اند${target}؛ ابتدا مرحلهٔ «${first.title}» را تکمیل و ذخیره کنید${detail}.`;
}

/** Builds the friendly block message for prepare/submit gates. The review
 *  step is the act of preparing/submitting itself — pass "review" to exclude
 *  it, otherwise prepare would deadlock on its own unfinished step. */
export function firstIncompleteMessage(plan: CaseStepPlan, skipKey?: CaseStepKey): string | null {
  const first = plan.steps.find((step) => step.key !== skipKey && step.status !== "completed");
  if (!first) return null;
  const detail = first.missing.length ? ` موارد ناقص: ${first.missing.join("، ")}.` : "";
  return `مرحلهٔ «${first.title}» هنوز کامل نشده است.${detail} از ویزارد ثبت اطلاعات برای تکمیل آن استفاده کنید.`;
}
