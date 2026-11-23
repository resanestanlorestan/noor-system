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
import { defaultSpecialtyDetailMeta, loadSpecialtyDetailMeta } from "@/lib/specialty-detail-meta";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import { resolvedCaseField, type CaseFieldMetaMap } from "@/lib/case-field-catalog";
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
  person: Pick<ActivistRow, "firstName" | "lastName" | "fatherName" | "nationalIdHash" | "idCardNumber" | "idIssuePlace" | "birthDate" | "gender" | "phone" | "alternatePhone" | "email" | "provinceId" | "countyId" | "photoDocumentId">;
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
  /** الحاقیهٔ ۲.۲۶.۰ — نگاشت حل‌شدهٔ فیلدهای ثابت (overrideهای مدیریت مراحل) */
  fieldMeta?: CaseFieldMetaMap;
};

/** پاسخ پرشده: رشتهٔ ناخالی یا آرایهٔ دارای عضو معنادار */
function answerFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => String(item).trim() !== "");
  return typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined && value !== "";
}

/** الحاقیهٔ ۲.۲۶.۰ — مورد ناقص با کلید پایدار: کلید برای نگاشت راهنما/پرچم بخش
 *  (مستقل از برچسب ویرایش‌شده) و label برای نمایش. */
export type MissingCheck = { key: string; label: string };

/** Loads the facts for one case. Callers already hold the application and
 *  activist rows (getCaseForUser), so only the small aggregate queries run. */
export async function loadCaseStepFacts(person: ActivistRow, status: AppStatus, applicationId: string): Promise<CaseStepFacts> {
  const [specRows, detailRows, evidenceRows, fieldMeta, detailMeta] = await Promise.all([
    db.select({ specialtyId: activistSpecialties.specialtyId, code: specialties.code, title: specialties.title })
      .from(activistSpecialties)
      .innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id))
      .where(eq(activistSpecialties.activistId, person.id)),
    db.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions })
      .from(activistSpecialtyDetails)
      .where(eq(activistSpecialtyDetails.activistId, person.id)),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "evidence"))),
    // الحاقیهٔ ۲.۲۶.۰ — overrideهای فیلدهای ثابت (خطا → پیش‌فرض کاتالوگ)
    loadCaseFieldMeta(),
    // الحاقیهٔ ۲.۲۸.۰ — متای پویای فیلدهای جزئیات تخصص‌ها (خطا → پیش‌فرض ثابت کد)
    loadSpecialtyDetailMeta(),
  ]);
  const detailBySpecialty = new Map(detailRows.map((row) => [row.specialtyId, row]));
  const specialtyDetailMissing: string[] = [];
  for (const spec of specRows) {
    const specDef = detailMeta[spec.code] ?? defaultSpecialtyDetailMeta(spec.code);
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
  return { status, person, specialtyCount: specRows.length, specialtyDetailMissing, evidenceCount: evidenceRows.length, photoOk: Boolean(person.photoDocumentId), steps, stepFormMissing, stepFormStarted, fieldMeta };
}

/** الحاقیهٔ ۲.۲۶.۰ — گزاره‌های نقص مرحلهٔ هویتی با کلید پایدار؛ برچسب‌ها از
 *  override مدیر می‌آیند و فیلد مخفی‌شده یا بی‌الزام از کنترل خارج می‌شود.
 *  الزام ترکیبی «نام و نام خانوادگی» روی کلید identity.fullName است. */
export function identityChecks(person: CaseStepFacts["person"], meta?: CaseFieldMetaMap): MissingCheck[] {
  const item = (key: string) => resolvedCaseField(meta, key);
  const checks: MissingCheck[] = [];
  const first = item("identity.firstName"), last = item("identity.lastName"), nameReq = item("identity.fullName");
  if (nameReq.required && !(first.hidden && last.hidden) && (!person.firstName || !person.lastName)) {
    checks.push({ key: "identity.fullName", label: [first.hidden ? null : first.label, last.hidden ? null : last.label].filter(Boolean).join(" و ") || nameReq.label });
  }
  for (const [key, value] of [
    ["identity.fatherName", person.fatherName],
    ["identity.nationalId", person.nationalIdHash],
    ["identity.idCardNumber", person.idCardNumber],
    ["identity.idIssuePlace", person.idIssuePlace],
    ["identity.birthDate", person.birthDate],
    ["identity.gender", person.gender],
    ["identity.phone", person.phone],
    ["identity.alternatePhone", person.alternatePhone],
    ["identity.contactEmail", person.email],
  ] as const) {
    const resolved = item(key);
    if (!resolved.required || resolved.hidden || value) continue;
    checks.push({ key, label: resolved.label });
  }
  return checks;
}

/** Missing identity items (step 1) — display labels (override-aware). */
export function identityMissing(person: CaseStepFacts["person"], meta?: CaseFieldMetaMap): string[] {
  return identityChecks(person, meta).map((check) => check.label);
}

/** Missing location items (step 2) — الزام ترکیبی روی کلید location.residence */
export function locationChecks(person: CaseStepFacts["person"], meta?: CaseFieldMetaMap): MissingCheck[] {
  const residence = resolvedCaseField(meta, "location.residence");
  if (!residence.required || residence.hidden) return [];
  if (person.provinceId && person.countyId) return [];
  return [{ key: "location.residence", label: residence.label }];
}

export function locationMissing(person: CaseStepFacts["person"], meta?: CaseFieldMetaMap): string[] {
  return locationChecks(person, meta).map((check) => check.label);
}

/** Missing specialty items (step 3). */
export function specialtiesChecks(facts: Pick<CaseStepFacts, "specialtyCount" | "specialtyDetailMissing">, meta?: CaseFieldMetaMap): MissingCheck[] {
  const checks: MissingCheck[] = [];
  const minOne = resolvedCaseField(meta, "specialties.minOne");
  if (minOne.required && !facts.specialtyCount) checks.push({ key: "specialties.minOne", label: minOne.label });
  if (facts.specialtyDetailMissing.length) {
    const details = resolvedCaseField(meta, "specialties.details");
    checks.push({ key: "specialties.details", label: `${details.label}: ${facts.specialtyDetailMissing.join("، ")}` });
  }
  return checks;
}

export function specialtiesMissing(facts: Pick<CaseStepFacts, "specialtyCount" | "specialtyDetailMissing">, meta?: CaseFieldMetaMap): string[] {
  return specialtiesChecks(facts, meta).map((check) => check.label);
}

/** Missing documents items (step 4) — ترتیب کنترل مطابق ۲.۱۰.۰: نخست مدارک
 *  پشتیبان و سپس تصویر پرسنلی (آزمون‌های کهن و پرچم بخش‌ها به همین ترتیب‌اند). */
export function documentsChecks(facts: Pick<CaseStepFacts, "evidenceCount" | "photoOk">, meta?: CaseFieldMetaMap): MissingCheck[] {
  const checks: MissingCheck[] = [];
  const evidence = resolvedCaseField(meta, "documents.evidence");
  const photo = resolvedCaseField(meta, "documents.photo");
  if (evidence.required && !facts.evidenceCount) checks.push({ key: "documents.evidence", label: evidence.label });
  if (photo.required && !facts.photoOk) checks.push({ key: "documents.photo", label: photo.label });
  return checks;
}

export function documentsMissing(facts: Pick<CaseStepFacts, "evidenceCount" | "photoOk">, meta?: CaseFieldMetaMap): string[] {
  return documentsChecks(facts, meta).map((check) => check.label);
}

const SUBMITTED_STATUSES: ReadonlyArray<AppStatus> = ["pending", "specialist_review", "approved", "rejected"];

/** Missing review items (step 5) — the case must have been sent for review. */
export function reviewMissing(facts: Pick<CaseStepFacts, "status">): string[] {
  return SUBMITTED_STATUSES.includes(facts.status) ? [] : ["کنترل آمادگی و ارسال پرونده برای بررسی"];
}

type StepCompletion = { missing: string[]; missingKeys: string[]; started: boolean };

/** تکمیل پایهٔ یک مرحلهٔ سیستم بر حسب کلید؛ کلید سفارشی → خالی (فیلدهای
 * سفارشی همان مرحله جداگانه در computeCaseSteps لحاظ می‌شوند).
 * الحاقیهٔ ۲.۲۶.۰ — برچسب و الزام از meta می‌آید و missingKeys برای نگاشت
 * راهنما/پرچم بخش با کلید پایدار (مستقل از برچسب ویرایش‌شده) برگردانده می‌شود. */
function systemCompletion(facts: CaseStepFacts, key: CaseStepKey): StepCompletion {
  const meta = facts.fieldMeta;
  switch (key) {
    case "identity": {
      const checks = identityChecks(facts.person, meta);
      // «شروع‌شده» = حداقل یک کنترل فعال پاس است: تعداد نقص کمتر از تعداد کل
      // کنترل‌های الزامیِ فعال (شمارش با شخصِ کاملاً خالی)
      const activeRequired = identityChecks({ ...facts.person, firstName: "", lastName: "", fatherName: null, nationalIdHash: null, idCardNumber: null, idIssuePlace: null, birthDate: null, gender: null, phone: null, alternatePhone: null, email: null, provinceId: null, countyId: null, photoDocumentId: null }, meta).length;
      return { missing: checks.map((check) => check.label), missingKeys: checks.map((check) => check.key), started: checks.length < activeRequired };
    }
    case "location": {
      const checks = locationChecks(facts.person, meta);
      return { missing: checks.map((check) => check.label), missingKeys: checks.map((check) => check.key), started: Boolean(facts.person.provinceId || facts.person.countyId) };
    }
    case "specialties": {
      const checks = specialtiesChecks(facts, meta);
      return { missing: checks.map((check) => check.label), missingKeys: checks.map((check) => check.key), started: facts.specialtyCount > 0 };
    }
    case "documents": {
      const checks = documentsChecks(facts, meta);
      return { missing: checks.map((check) => check.label), missingKeys: checks.map((check) => check.key), started: facts.evidenceCount > 0 || facts.photoOk };
    }
    case "review":
      return { missing: reviewMissing(facts), missingKeys: ["review.send"], started: facts.status === "ready" || SUBMITTED_STATUSES.includes(facts.status) };
    default:
      return { missing: [], missingKeys: [], started: false };
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
  /** الحاقیهٔ ۲.۲۶.۰ — کلید پایدار هر مورد ناقص (هم‌اندازهٔ missing) برای
   *  نگاشت راهنما/پرچم بخش مستقل از برچسب ویرایش‌شده */
  missingKeys?: string[];
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
    // فیلدهای سفارشی کلید پایدار ندارند؛ کلیدِ برچسبِ خودشان را می‌گیرند
    const missingKeys = [...base.missingKeys, ...extra];
    const started = base.started || Boolean(step.definitionId && facts.stepFormStarted?.[step.definitionId]);
    return { missing, missingKeys, started };
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
    return { key: step.key, index, title: step.title, hint: step.hint, status, missing: completion.missing, missingKeys: completion.missingKeys, definitionId: step.definitionId || undefined, kind: step.kind };
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

/** Guidance for one missing item — actionable, points at the exact field.
 *  الحاقیهٔ ۲.۲۶.۰ — نگاشت کلید-محور: راهنما با کلید پایدار یافت می‌شود تا با
 *  تغییر برچسب فیلد توسط مدیر همچنان درست بماند؛ READINESS_HINTS (برچسبی)
 *  به‌عنوان fallback برای موارد بدون کلید حفظ شده است. */
export const READINESS_KEY_HINTS: Record<string, string> = {
  "identity.fullName": "فیلدهای نام و نام خانوادگی در بخش «اطلاعات هویتی و تماس» خالی است؛ هر دو را پر کنید.",
  "identity.fatherName": "فیلد نام پدر در بخش «اطلاعات هویتی و تماس» خالی است.",
  "identity.nationalId": "کد ملی ۱۰ رقمی معتبر در بخش «اطلاعات هویتی و تماس» ثبت نشده است؛ کد ملی را وارد کنید.",
  "identity.idCardNumber": "فیلد شماره شناسنامه در بخش «اطلاعات هویتی و تماس» خالی است.",
  "identity.idIssuePlace": "فیلد محل صدور شناسنامه در بخش «اطلاعات هویتی و تماس» خالی است.",
  "identity.birthDate": "تاریخ تولد را از تقویم شمسی در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "identity.gender": "گزینهٔ جنسیت را در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "identity.phone": "فیلد شماره همراه در بخش «اطلاعات هویتی و تماس» خالی است.",
  "identity.alternatePhone": "فیلد شماره همراه جایگزین در بخش «اطلاعات هویتی و تماس» خالی است.",
  "identity.contactEmail": "فیلد ایمیل تماس در بخش «اطلاعات هویتی و تماس» خالی است.",
  "location.residence": "در بخش «محل سکونت» ابتدا استان و سپس شهرستان را از فهرست انتخاب و فرم را ذخیره کنید.",
  "specialties.minOne": "در بخش «تخصص‌های قرآنی» حداقل یک تخصص را تیک بزنید.",
  "documents.photo": "در بخش «تصویر پرسنلی» تصویر پرسنلی PNG یا JPEG با حداکثر حجم ۵۰۰ کیلوبایت بارگذاری کنید.",
  "documents.evidence": "در بخش «مدارک پشتیبان» حداقل یک مدرک (تصویر کارت ملی، مدرک تحصیلی یا گواهی) بارگذاری کنید.",
  "review.send": "کنترل آمادگی و ارسال پرونده برای بررسی از مرحلهٔ آخر انجام می‌شود.",
};

export const READINESS_HINTS: Record<string, string> = {
  "نام و نام خانوادگی": "فیلدهای «نام» و «نام خانوادگی» در بخش «اطلاعات هویتی و تماس» خالی است؛ هر دو را پر کنید.",
  "نام پدر": "فیلد «نام پدر» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "کد ملی معتبر": "کد ملی ۱۰ رقمی معتبر در بخش «اطلاعات هویتی و تماس» ثبت نشده است؛ کد ملی را وارد کنید.",
  "کد ملی": "کد ملی ۱۰ رقمی معتبر در بخش «اطلاعات هویتی و تماس» ثبت نشده است؛ کد ملی را وارد کنید.",
  "شماره شناسنامه": "فیلد «شماره شناسنامه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "محل صدور شناسنامه": "فیلد «محل صدور شناسنامه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "تاریخ تولد شمسی": "تاریخ تولد را از تقویم شمسی در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "جنسیت": "گزینهٔ «جنسیت» را در بخش «اطلاعات هویتی و تماس» انتخاب کنید.",
  "شماره تماس": "فیلد «شماره همراه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "شماره همراه": "فیلد «شماره همراه» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "شماره همراه جایگزین": "فیلد «شماره همراه جایگزین» در بخش «اطلاعات هویتی و تماس» خالی است.",
  "ایمیل تماس": "فیلد «ایمیل تماس» در بخش «اطلاعات هویتی و تماس» خالی است.",
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

/** الحاقیهٔ ۲.۲۶.۰ — راهنما با کلید پایدار؛ نبود کلید → برچسبی → پیام عمومی.
 *  برای جزئیات تخصص‌ها کلید پیشوندی است و راهنمای اختصاصی دارد. */
export function readinessHintForKey(key: string, label: string): string {
  const exact = READINESS_KEY_HINTS[key];
  if (exact) return exact;
  if (key === "specialties.details") return "برای هر تخصص انتخاب‌شدهٔ دارای جزئیات (میزان حفظ، سطح قرائت یا نقش‌ها)، مقدار جزئیات را در کارت همان تخصص کامل کنید.";
  return readinessHint(label);
}

export type ReadinessItem = { label: string; hint: string; section?: string };
export type ReadinessIssue = { step: number; stepKey: CaseStepKey; stepTitle: string; items: ReadinessItem[] };

/** Section flag per missing item — keyed first (override-proof), then by
 *  the legacy exact-label map. */
const KEY_SECTIONS: Record<string, string> = {
  "identity.fullName": "identity-fields",
  "identity.fatherName": "identity-fields",
  "identity.nationalId": "identity-fields",
  "identity.idCardNumber": "identity-fields",
  "identity.idIssuePlace": "identity-fields",
  "identity.birthDate": "identity-fields",
  "identity.gender": "identity-fields",
  "identity.phone": "identity-fields",
  "identity.alternatePhone": "identity-fields",
  "identity.contactEmail": "identity-fields",
  "location.residence": "residence",
  "specialties.minOne": "specialty-grid",
  "specialties.details": "specialty-details",
  "documents.photo": "sec-photo",
  "documents.evidence": "sec-evidence",
  "documents.docRequests": "sec-evidence",
};

function sectionForKey(key: string, label: string): string | undefined {
  if (KEY_SECTIONS[key]) return KEY_SECTIONS[key];
  return sectionForLabel(label);
}

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
 *  هم در همین گزارش می‌آید (راهنمای عمومی fallback). الحاقیهٔ ۲.۲۶.۰ —
 *  راهنما/پرچم با کلید پایدار یافت می‌شود و برچسب مدارک درخواستی از
 *  override مدیر می‌آید. */
export function collectReadinessIssues(facts: CaseStepFacts, extra: { openCorrection?: boolean; openDocRequests?: number } = {}, orderedSteps?: ReadonlyArray<OrderedCaseStep>): ReadinessIssue[] {
  const steps = orderedSteps ?? facts.steps ?? DEFAULT_ORDERED_STEPS;
  const meta = facts.fieldMeta;
  const docRequestItem = { key: "documents.docRequests", label: resolvedCaseField(meta, "documents.docRequests").label };
  const issues: ReadinessIssue[] = [];
  steps.forEach((step, index) => {
    // موردِ خودِ مرحلهٔ بازبینی (کنشِ ارسال) در گزارش آمادگی نمی‌آید — همان
    // رفتار ۲.۱۹.۳؛ فقط گاردهای باز (اصلاح/مدارک درخواستی) به همان مرحله می‌چسبند.
    const base = step.key === "review" ? { missing: [] as string[], missingKeys: [] as string[] } : systemCompletion(facts, step.key);
    const items: ReadinessItem[] = base.missing.map((label, i) => {
      const key = base.missingKeys[i] ?? label;
      return { label, hint: readinessHintForKey(key, label), section: sectionForKey(key, label) };
    });
    const extraMissing = step.definitionId && facts.stepFormMissing ? facts.stepFormMissing[step.definitionId] ?? [] : [];
    for (const label of extraMissing) items.push({ label, hint: readinessHint(label) });
    if (step.key === "documents" && extra.openDocRequests) items.push({ label: docRequestItem.label, hint: readinessHintForKey(docRequestItem.key, DOC_REQUESTS_LABEL), section: "sec-evidence" });
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
 *  outline exactly the incomplete containers after a readiness redirect.
 *  الحاقیهٔ ۲.۲۶.۰ — با کلید پایدار، مستقل از برچسب ویرایش‌شده. */
export function readinessFlagSections(step: Pick<CaseStepView, "missing" | "missingKeys">): string[] {
  const sections = new Set<string>();
  step.missing.forEach((label, index) => {
    const key = step.missingKeys?.[index] ?? label;
    const section = sectionForKey(key, label);
    if (section) sections.add(section);
  });
  return [...sections];
}
