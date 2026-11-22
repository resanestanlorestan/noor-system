// موتور قفل مراحل ثبت اطلاعات (الحاقیهٔ ۲.۱۰.۰)
// -----------------------------------------------------------
// منبع یگانهٔ حقیقت زنجیرهٔ مراحل: هم صفحات ویزارد و هم همهٔ
// اکشن‌های سرور از همین ماژول وضعیت مراحل را می‌خوانند تا هیچ
// مسیری (تغییر URL، فراخوانی مستقیم اکشن، یا ورود با لینک) نتواند
// بدون تکمیل و ذخیرهٔ مراحل قبلی به مرحلهٔ بعدی برسد.
//
// الحاقیهٔ ۲.۲۵.۰ — مراحل پویا: ترتیب، عنوان و فعال‌بودن مراحل از جدول
// case_step_definitions خوانده می‌شود (مراحل پایهٔ سامانه با مایگریشن ۰۰۳۱
// seed شده‌اند و مراحل سفارشی مدیر از UI افزوده می‌شوند). فیلدهای سفارشیِ
// هر مرحله در form_definitions با entity_type='case_step' نگهداری می‌شود و
// پاسخ‌های الزامیِ بی‌جواب در محاسبهٔ تکمیل همان مرحله لحاظ می‌گردد. اگر
// جدول تعریف مراحل خالی یا در دسترس نباشد، موتور با ترتیب ثابت ۲.۱۰.۰
// کار می‌کند تا هیچ‌گاه زنجیره از دست نرود.
//
// هر مرحله یکی از چهار وضعیت را دارد: completed (تکمیل‌شده)،
// in_progress (در حال تکمیل)، incomplete (تکمیل‌نشده) و locked
// (قفل‌شده). وضعیت‌ها هر بار از دادهٔ واقعی پایگاه‌داده محاسبه
// می‌شوند؛ بنابراین اگر ویرایش بعدی باعث ناقص شدن مرحله‌ای شود،
// وضعیت همان مرحله و مراحل بعدی بی‌درنگ اصلاح می‌شود.

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, caseStepDefinitions, documents, formAnswers, formDefinitions, specialties } from "@/db/schema";
import { isFieldVisible, type FormAnswers, type FormConfig } from "@/lib/form-config";
import { specialtyDetailSpec } from "@/lib/constants";
import type { AppStatus } from "@/lib/constants";
import type { activists } from "@/db/schema";

export type SystemCaseStepKey = "identity" | "location" | "specialties" | "documents" | "review";
export type CaseStepKey = string;
export type CaseStepStatus = "completed" | "in_progress" | "incomplete" | "locked";

export const caseStepStatusLabel: Record<CaseStepStatus, string> = {
  completed: "تکمیل‌شده",
  in_progress: "در حال تکمیل",
  incomplete: "تکمیل‌نشده",
  locked: "قفل‌شده",
};

export const CASE_STEPS: ReadonlyArray<{ key: SystemCaseStepKey; title: string; hint: string }> = [
  { key: "identity", title: "اطلاعات هویتی و تماس", hint: "مشخصات فردی، شناسنامه‌ای و شماره‌های تماس" },
  { key: "location", title: "سکونت و محل فعالیت", hint: "استان و شهرستان سکونت و فعالیت قرآنی" },
  { key: "specialties", title: "تخصص‌ها، تحصیلات و سوابق", hint: "حداقل یک تخصص با جزئیات کامل؛ تحصیلات و سوابق اختیاری" },
  { key: "documents", title: "مدارک و تصویر پرسنلی", hint: "حداقل یک مدرک پشتیبان و تصویر پرسنلی معتبر" },
  { key: "review", title: "بازبینی و ارسال", hint: "بازبینی نهایی، کنترل آمادگی و ارسال برای بررسی" },
];

/** الحاقیهٔ ۲.۲۵.۰ — یک مرحله در ترتیب فعال: کلید سیستم یا کد مرحلهٔ سفارشی
 * (custom_<شناسه>)؛ definitionId=0 فقط در fallback ثابت (بدون جدول) رخ می‌دهد. */
export type OrderedCaseStep = { key: CaseStepKey; title: string; hint: string; definitionId: number; kind: "system" | "custom" };

/** ترتیب ثابت ۲.۱۰.۰ — seed مایگریشن ۰۰۳۱ و fallback امن موتور */
export const DEFAULT_ORDERED_STEPS: ReadonlyArray<OrderedCaseStep> = CASE_STEPS.map((step) => ({ key: step.key, title: step.title, hint: step.hint, definitionId: 0, kind: "system" as const }));

/** خواندن ترتیب فعال مراحل از DB؛ خالی/خطا → ترتیب ثابت (هیچ‌گاه زنجیره نمی‌میرد) */
export async function loadActiveCaseSteps(): Promise<OrderedCaseStep[]> {
  try {
    const rows = await db.select({ id: caseStepDefinitions.id, code: caseStepDefinitions.code, title: caseStepDefinitions.title, description: caseStepDefinitions.description, kind: caseStepDefinitions.kind })
      .from(caseStepDefinitions)
      .where(eq(caseStepDefinitions.active, true))
      .orderBy(asc(caseStepDefinitions.sortOrder), asc(caseStepDefinitions.id));
    if (!rows.length) return [...DEFAULT_ORDERED_STEPS];
    return rows.map((row) => ({ key: row.code, title: row.title, hint: row.description || "", definitionId: row.id, kind: row.kind }));
  } catch {
    return [...DEFAULT_ORDERED_STEPS];
  }
}

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
  /** الحاقیهٔ ۲.۲۵.۰ — ترتیب فعال مراحل (اختیاری؛ فقط خروجی واقعی loader) */
  steps?: ReadonlyArray<OrderedCaseStep>;
  /** فیلدهای الزامیِ بی‌پاسخِ هر تعریف مرحله (شناسهٔ تعریف ← برچسب‌ها) */
  stepFormMissing?: Record<number, string[]>;
  /** آیا برای تعریف مرحله، دست‌کم یک پاسخ ثبت شده است */
  stepFormStarted?: Record<number, boolean>;
};

/** پاسخ پرشده: رشتهٔ ناخالی یا آرایهٔ دارای عضو معنادار */
function answerFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => String(item).trim() !== "");
  return typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined && value !== "";
}

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
  // الحاقیهٔ ۲.۲۵.۰ — ترتیب فعال مراحل + فیلدهای الزامیِ بی‌پاسخِ فرم سفارشی هر مرحله
  const steps = await loadActiveCaseSteps();
  const stepFormMissing: Record<number, string[]> = {};
  const stepFormStarted: Record<number, boolean> = {};
  const defIds = steps.filter((step) => step.definitionId > 0).map((step) => step.definitionId);
  if (defIds.length) {
    const defs = await db.select({ id: formDefinitions.id, entityId: formDefinitions.entityId, publishedConfig: formDefinitions.publishedConfig })
      .from(formDefinitions)
      .where(and(eq(formDefinitions.entityType, "case_step"), inArray(formDefinitions.entityId, defIds), eq(formDefinitions.status, "published")));
    const withConfig = defs.filter((def) => def.publishedConfig);
    if (withConfig.length) {
      const answerRows = await db.select({ definitionId: formAnswers.definitionId, answers: formAnswers.answers })
        .from(formAnswers)
        .where(and(eq(formAnswers.applicationId, applicationId), inArray(formAnswers.definitionId, withConfig.map((def) => def.id))));
      const answersByDef = new Map(answerRows.map((row) => [row.definitionId, (row.answers || {}) as FormAnswers]));
      for (const def of withConfig) {
        const answers = answersByDef.get(def.id) || {};
        const missing: string[] = [];
        let started = false;
        for (const field of (def.publishedConfig as FormConfig).fields) {
          const filled = answerFilled(answers[field.key]);
          if (filled) started = true;
          else if (field.required && isFieldVisible(field, answers)) missing.push(field.label);
        }
        if (missing.length) stepFormMissing[def.entityId] = missing;
        if (started) stepFormStarted[def.entityId] = true;
      }
    }
  }
  return { status, person, specialtyCount: specRows.length, specialtyDetailMissing, evidenceCount: evidenceRows.length, photoOk: Boolean(person.photoDocumentId), steps, stepFormMissing, stepFormStarted };
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

/** تکمیل پایهٔ یک مرحلهٔ سیستم بر حسب کلید؛ کلید سفارشی → خالی (فیلدهای
 * سفارشی همان مرحله جداگانه در computeCaseSteps لحاظ می‌شوند). */
function systemCompletion(facts: CaseStepFacts, key: CaseStepKey): StepCompletion {
  switch (key) {
    case "identity": {
      const missing = identityMissing(facts.person);
      return { missing, started: missing.length < 9 };
    }
    case "location":
      return { missing: locationMissing(facts.person), started: Boolean(facts.person.provinceId || facts.person.countyId) };
    case "specialties":
      return { missing: specialtiesMissing(facts), started: facts.specialtyCount > 0 };
    case "documents":
      return { missing: documentsMissing(facts), started: facts.evidenceCount > 0 || facts.photoOk };
    case "review":
      return { missing: reviewMissing(facts), started: facts.status === "ready" || SUBMITTED_STATUSES.includes(facts.status) };
    default:
      return { missing: [], started: false };
  }
}

/** Pure per-step computation — unit-testable without a database.
 * (حفظ امضای قدیمی: کامل‌بودن پنج مرحلهٔ سیستم، بدون فیلدهای سفارشی) */
export function stepCompletions(facts: CaseStepFacts): Record<SystemCaseStepKey, StepCompletion> {
  return {
    identity: systemCompletion(facts, "identity"),
    location: systemCompletion(facts, "location"),
    specialties: systemCompletion(facts, "specialties"),
    documents: systemCompletion(facts, "documents"),
    review: systemCompletion(facts, "review"),
  };
}

export type CaseStepView = {
  key: CaseStepKey;
  index: number;
  title: string;
  hint: string;
  status: CaseStepStatus;
  missing: string[];
  /** الحاقیهٔ ۲.۲۵.۰ — شناسهٔ تعریف مرحله (۰ در fallback ثابت) و نوع آن */
  definitionId?: number;
  kind?: "system" | "custom";
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
 *  completed status — the chain gates forward movement, not existing data.
 *  الحاقیهٔ ۲.۲۵.۰ — ترتیب از DB می‌آید (پارامتر یا facts.steps یا ثابت) و
 *  فیلدهای الزامیِ سفارشیِ هر مرحله در تکمیل همان مرحله لحاظ می‌شود. */
export function computeCaseSteps(facts: CaseStepFacts, orderedSteps?: ReadonlyArray<OrderedCaseStep>): CaseStepPlan {
  const steps = orderedSteps ?? facts.steps ?? DEFAULT_ORDERED_STEPS;
  const completions = steps.map((step) => {
    const base = systemCompletion(facts, step.key);
    const extra = step.definitionId && facts.stepFormMissing ? facts.stepFormMissing[step.definitionId] ?? [] : [];
    const missing = [...base.missing, ...extra];
    const started = base.started || Boolean(step.definitionId && facts.stepFormStarted?.[step.definitionId]);
    return { missing, started };
  });
  const activeIndex = completions.findIndex((completion) => completion.missing.length > 0);
  const resolvedIndex = activeIndex === -1 ? steps.length - 1 : activeIndex;
  const views = steps.map((step, index) => {
    const completion = completions[index];
    const complete = completion.missing.length === 0;
    let status: CaseStepStatus;
    if (complete) status = "completed";
    else if (index < resolvedIndex) status = "completed";
    else if (index === resolvedIndex) status = completion.started ? "in_progress" : "incomplete";
    else status = "locked";
    return { key: step.key, index, title: step.title, hint: step.hint, status, missing: completion.missing, definitionId: step.definitionId || undefined, kind: step.kind };
  });
  const completedCount = views.filter((step) => step.status === "completed").length;
  return { steps: views, activeIndex: resolvedIndex, completedCount, totalCount: views.length };
}

/** شمارهٔ ۱-پایهٔ یک مرحله در ترتیب فعال؛ -۱ اگر در زنجیره نباشد (الحاقیهٔ ۲.۲۵.۰) */
export function caseStepNumber(plan: CaseStepPlan, key: CaseStepKey): number {
  const index = plan.steps.findIndex((step) => step.key === key);
  return index === -1 ? -1 : index + 1;
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

// الحاقیهٔ ۲.۱۹.۳ — بررسی هوشمند آمادگی ارسال
// -----------------------------------------------------------
// دکمهٔ «بررسی آمادگی ارسال» در مرحلهٔ آخر همیشه فعال است: با کلیک، همهٔ
// مراحل از دادهٔ واقعی کنترل می‌شوند؛ در صورت نقص، کاربر مستقیماً به
// اولین مرحلهٔ مشکل‌دار هدایت می‌شود، فیلدها/بخش‌های ناقص با پرچم و
// راهنمای اختصاصی مشخص می‌شوند و پس از اصلاح، همان دکمه دوباره همه را
// از نو کنترل می‌کند. ارسال نهایی همچنان فقط پس از «آماده» بودن (ready)
// باز می‌شود و گارد سروری همان است که advanceCase اعمال می‌کند.

/** Guidance for one missing item — actionable, points at the exact field. */
export const READINESS_HINTS: Record<string, string> = {
  "نام و نام خانوادگی": "فیلدهای «نام» و «نام خانوادگی» در بخش «اطلاعات هویتی و تماس» خالی است؛ هر دو را پر کنید.",
  "نام پدر": "فیلد «نام پدر» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "کد ملی معتبر": "کد ملی ۱۰ رقمی معتبر در بخش «اطلاعات هویتی و تماس» ثبت نشده است؛ کد ملی را وارد کنید.",
  "شماره شناسنامه": "فیلد «شماره شناسنامه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "محل صدور شناسنامه": "فیلد «محل صدور شناسنامه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "تاریخ تولد شمسی": "تاریخ تولد را از تقویم شمسی در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "جنسیت": "گزینهٔ «جنسیت» را در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "شماره تماس": "فیلد «شماره همراه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "شماره همراه جایگزین": "فیلد «شماره همراه جایگزین» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "استان و شهرستان سکونت": "در بخش «محل سکونت» ابتدا استان و سپس شهرستان را از فهرست انتخاب و فرم را ذخیره کنید.",
  "حداقل یک تخصص قرآنی": "در بخش «تخصص‌های قرآنی» حداقل یک تخصص را تیک بزنید.",
  "حداقل یک مدرک پشتیبان": "در بخش «مدارک پشتیبان» حداقل یک مدرک (تصویر کارت ملی، مدرک تحصیلی یا گواهی) بارگذاری کنید.",
  "تصویر پرسنلی": "در بخش «تصویر پرسنلی» تصویر پرسنلی PNG یا JPEG با حداکثر حجم ۵۰۰ کیلوبایت بارگذاری کنید.",
  "پاسخ درخواست اصلاح پرونده": "ابتدا پاسخ درخواست اصلاح را در صفحهٔ جزئیات پرونده ثبت کنید.",
  "بارگذاری یا پاسخ مدارک درخواستی": "برای درخواست‌های مدرک باز، هنگام بارگذاری، درخواست مربوط را انتخاب کنید یا از صفحهٔ پرونده پاسخ ثبت کنید.",
};

/** Items raised by gates other than the four step engines. */
export const CORRECTION_REQUEST_LABEL = "پاسخ درخواست اصلاح پرونده";
export const DOC_REQUESTS_LABEL = "بارگذاری یا پاسخ مدارک درخواستی";

const SPECIALTY_DETAIL_PREFIX = "جزئیات تخصص‌ها";

export const READINESS_FALLBACK_HINT = "این مورد را در مرحلهٔ مربوط تکمیل و فرم همان مرحله را ذخیره کنید.";

/** Guidance lookup: exact match, then prefix match (تخصص‌های دارای جزئیات
 *  برچسب پیشوندی می‌سازند)، در نهایت پیام عمومی. */
export function readinessHint(label: string): string {
  const exact = READINESS_HINTS[label];
  if (exact) return exact;
  if (label.startsWith(SPECIALTY_DETAIL_PREFIX)) return "برای هر تخصص انتخاب‌شدهٔ دارای جزئیات (میزان حفظ، سطح قرائت یا نقش‌ها)، مقدار جزئیات را در کارت همان تخصص کامل کنید.";
  return READINESS_FALLBACK_HINT;
}

export type ReadinessItem = { label: string; hint: string; section?: string };
export type ReadinessIssue = { step: number; stepKey: CaseStepKey; stepTitle: string; items: ReadinessItem[] };

/** Section flag per missing label — the wizard pages highlight these
 *  containers when the readiness check redirects with ?check=1. */
function sectionForLabel(label: string): string | undefined {
  if (label === "حداقل یک تخصص قرآنی") return "specialty-grid";
  if (label.startsWith(SPECIALTY_DETAIL_PREFIX)) return "specialty-details";
  if (label === "تصویر پرسنلی") return "sec-photo";
  if (label === "حداقل یک مدرک پشتیبان") return "sec-evidence";
  if (label === DOC_REQUESTS_LABEL) return "sec-evidence";
  if (label === "استان و شهرستان سکونت") return "residence";
  if (READINESS_HINTS[label]) return "identity-fields";
  return undefined;
}

/** Structured readiness report: every incomplete item grouped under its
 *  step, each with a guidance hint and the section to flag. The extra
 *  gates (open correction / document requests) are the same two checks
 *  advanceCase enforces inside its transaction. الحاقیهٔ ۲.۲۵.۰ — شمارهٔ
 *  مراحل از ترتیب فعال DB محاسبه می‌شود و فیلدهای الزامیِ سفارشی هر مرحله
 *  هم در همین گزارش می‌آید (راهنمای عمومی fallback). */
export function collectReadinessIssues(facts: CaseStepFacts, extra: { openCorrection?: boolean; openDocRequests?: number } = {}, orderedSteps?: ReadonlyArray<OrderedCaseStep>): ReadinessIssue[] {
  const steps = orderedSteps ?? facts.steps ?? DEFAULT_ORDERED_STEPS;
  const issues: ReadinessIssue[] = [];
  steps.forEach((step, index) => {
    // موردِ خودِ مرحلهٔ بازبینی (کنشِ ارسال) در گزارش آمادگی نمی‌آید — همان
    // رفتار ۲.۱۹.۳؛ فقط گاردهای باز (اصلاح/مدارک درخواستی) به همان مرحله می‌چسبند.
    const base = step.key === "review" ? { missing: [] as string[] } : systemCompletion(facts, step.key);
    const items: ReadinessItem[] = base.missing.map((label) => ({ label, hint: readinessHint(label), section: sectionForLabel(label) }));
    const extraMissing = step.definitionId && facts.stepFormMissing ? facts.stepFormMissing[step.definitionId] ?? [] : [];
    for (const label of extraMissing) items.push({ label, hint: readinessHint(label) });
    if (step.key === "documents" && extra.openDocRequests) items.push({ label: DOC_REQUESTS_LABEL, hint: readinessHint(DOC_REQUESTS_LABEL), section: "sec-evidence" });
    if (items.length) issues.push({ step: index + 1, stepKey: step.key, stepTitle: step.title, items });
  });
  if (extra.openCorrection) {
    const reviewIndex = steps.findIndex((step) => step.key === "review");
    const step = reviewIndex === -1 ? steps.length : reviewIndex + 1;
    const stepTitle = reviewIndex === -1 ? "بازبینی و ارسال" : steps[reviewIndex].title;
    const stepKey = reviewIndex === -1 ? "review" : steps[reviewIndex].key;
    const existing = issues.find((issue) => issue.stepKey === stepKey && issue.step === step);
    const item: ReadinessItem = { label: CORRECTION_REQUEST_LABEL, hint: readinessHint(CORRECTION_REQUEST_LABEL) };
    if (existing) existing.items.push(item);
    else issues.push({ step, stepKey, stepTitle, items: [item] });
  }
  return issues;
}

/** Section flags for one wizard step view — used by the step pages to
 *  outline exactly the incomplete containers after a readiness redirect. */
export function readinessFlagSections(step: Pick<CaseStepView, "missing">): string[] {
  const sections = new Set<string>();
  for (const label of step.missing) {
    const section = sectionForLabel(label);
    if (section) sections.add(section);
  }
  return [...sections];
}
