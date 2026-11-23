// Shared form-input parsing for the case registration flow.
// Extracted from the old single-shot save action so that both the step-by-step
// wizard actions (src/app/actions/case-steps.ts) and the preserved full-save
// core (src/lib/case-save.ts) validate payloads with exactly the same rules.
// Plain library module — no "use server" — so nothing here becomes a callable
// Server Action endpoint.

import { jalaliToIso, normalizeText } from "@/lib/format";
import { activityRecordKindLabels, cooperationTypeOptions, courseFieldOptions, educationLevelOptions, educationTypeLabels, normalizeJuzParts, UNIVERSITY_TYPE_OPTIONS, writingTypeLabels, defaultSpecialtyDetailMeta, specialtySelectLabels, type EducationType, type SpecialtyDetailMeta, type WritingType } from "@/lib/constants";

export const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);
export const numeric = (value: string) => /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;

const text = (value: unknown, max: number) => normalizeText(String(value ?? "")).slice(0, max);

/** Parses the education-rows JSON posted by the profile form.
 *  Each row needs a valid type and a level matching that type; optional text
 *  fields are trimmed and length-capped. Invalid payload aborts the save.
 *  الحاقیهٔ ۲.۱۴.۰ — docKey اختیاری: کلید فایل بارگذاری‌شدهٔ درون‌بخشی برای مدرک
 *  همان ردیف؛ در اکشن مرحله به سند متصل می‌شود. */
export function parseEducationInput(data: FormData): Array<{ type: EducationType; level: string; field: string | null; universityType: string | null; centerName: string | null; certificate: string | null; docKey: string | null }> {
  const raw = String(data.get("educationRecords") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-education-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-education-json");
  const rows: Array<{ type: EducationType; level: string; field: string | null; universityType: string | null; centerName: string | null; certificate: string | null; docKey: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-education-json");
    const record = item as Record<string, unknown>;
    const type = String(record.type || "");
    const level = normalizeText(String(record.level || "")).slice(0, 60);
    // Fully empty rows (the user opened a row but never picked anything) are
    // ignored, mirroring the client-side payload filter; partial rows abort.
    if (!type && !level) continue;
    if (!(type in educationTypeLabels) || !level) throw new Error("invalid-education-json");
    if (!(educationLevelOptions[type as EducationType] as readonly string[]).includes(level)) throw new Error("invalid-education-json");
    // الحاقیهٔ ۲.۱۹.۴ — نوع دانشگاه فقط یکی از گزینه‌های ثابت یا خالی است
    const universityTypeRaw = normalizeText(String(record.universityType || "")).slice(0, 60);
    if (universityTypeRaw && !(UNIVERSITY_TYPE_OPTIONS as readonly string[]).includes(universityTypeRaw)) throw new Error("invalid-education-json");
    rows.push({
      type: type as EducationType, level,
      field: normalizeText(String(record.field || "")).slice(0, 120) || null,
      universityType: universityTypeRaw || null,
      centerName: normalizeText(String(record.centerName || "")).slice(0, 180) || null,
      certificate: normalizeText(String(record.certificate || "")).slice(0, 180) || null,
      docKey: text(record.docKey, 60) || null,
    });
  }
  return rows;
}

/** Parses the specialty-details JSON posted by the profile form:
 *  [{ code, value?, options?, juz? }] for checked specialties that carry
 *  structured data — memorizer juz range ("1".."30"/"complete") plus the exact
 *  memorized part numbers (الحاقیهٔ ۲.۱۳.۰), reciter level ("4".."7") and the
 *  checklist specialties. Unknown codes, values outside the spec, a mismatched
 *  juz-part count or an empty checklist abort the save. Author works use
 *  parseWritingsInput.
 *  الحاقیهٔ ۲.۲۸.۰ — پارامتر اختیاری detailMeta: نوع و گزینه‌های مجاز از
 *  تنظیمات پویای پنل مدیریت می‌آید؛ کلیدهای گزینه پایدار می‌مانند و گزینه‌های
 *  مخفی‌شده برای بازذخیرهٔ دادهٔ قدیمی همچنان معتبرند (فقط از فرم حذف شده‌اند). */
export function parseSpecialtyDetailsInput(data: FormData, detailMeta?: Record<string, SpecialtyDetailMeta>): Array<{ code: string; value: string | null; options: string[] | null; juz: string | null }> {
  const raw = String(data.get("specialtyDetails") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-specialty-details"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-specialty-details");
  const rows: Array<{ code: string; value: string | null; options: string[] | null; juz: string | null }> = [];
  for (const item of parsed.slice(0, 20)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-specialty-details");
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    if (!code) continue;
    const spec = detailMeta?.[code] ?? defaultSpecialtyDetailMeta(code);
    if (!spec || spec.kind === "none" || spec.kind === "writings") throw new Error("invalid-specialty-details");
    if (spec.kind === "juz" || spec.kind === "level") {
      const value = String(record.value || "");
      const allowed = specialtySelectLabels(detailMeta?.[code], spec.kind);
      if (!(value in allowed)) throw new Error("invalid-specialty-details");
      // الحاقیهٔ ۲.۱۳.۰ — شمارهٔ دقیق جزءهای حفظ: با میزان اعلام‌شده باید هم‌خوان باشد
      let juz: string | null = null;
      if (spec.kind === "juz") {
        const normalized = normalizeJuzParts(value, typeof record.juz === "string" ? record.juz.slice(0, 120) : null);
        if (normalized === "invalid") throw new Error("invalid-specialty-details");
        juz = normalized;
      }
      rows.push({ code, value, options: null, juz });
      continue;
    }
    // گزینه‌های مجاز: همهٔ گزینه‌های متای مؤثر (حتی مخفی‌شده) تا دادهٔ قدیمی
    // بدون دست‌زدن مدیر بازذخیره شود؛ کلید ناشناخته هرگز پذیرفته نمی‌شود
    const specOptions = Object.fromEntries(spec.options.map((option) => [option.key, true as const]));
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = [...new Set(rawOptions.map((option) => String(option)).filter((option) => option in specOptions))];
    if (!options.length) throw new Error("invalid-specialty-details");
    rows.push({ code, value: null, options, juz: null });
  }
  return rows;
}

/** Author works (مؤلف): [{ workType, title, topic }]. Fully empty
 *  rows are skipped; rows with an invalid type or a short title abort. */
export function parseWritingsInput(data: FormData): Array<{ workType: WritingType; title: string; topic: string | null }> {
  const raw = String(data.get("writings") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-writings-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-writings-json");
  const rows: Array<{ workType: WritingType; title: string; topic: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-writings-json");
    const record = item as Record<string, unknown>;
    const workType = String(record.workType || "");
    const title = normalizeText(String(record.title || "")).slice(0, 180);
    const topic = normalizeText(String(record.topic || "")).slice(0, 180);
    if (!workType && !title && !topic) continue;
    if (!(workType in writingTypeLabels) || title.length < 2) throw new Error("invalid-writings-json");
    rows.push({ workType: workType as WritingType, title, topic: topic || null });
  }
  return rows;
}

/** Parses the work-history JSON posted by the profile form:
 *  [{ title, employer?, position?, startDate?, endDate?, description? }] —
 *  Jalali dates are converted with jalaliToIso; rows without a title are
 *  ignored, invalid payloads or dates abort the save. */
export function parseWorkHistoryInput(data: FormData): Array<{ title: string; employer: string | null; cooperationType: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null; docKey: string | null }> {
  const raw = String(data.get("workHistory") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-work-history-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-work-history-json");
  const rows: Array<{ title: string; employer: string | null; cooperationType: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null; docKey: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-work-history-json");
    const record = item as Record<string, unknown>;
    const title = normalizeText(String(record.title || "")).slice(0, 180);
    const startRaw = String(record.startDate || "").slice(0, 20);
    const endRaw = String(record.endDate || "").slice(0, 20);
    const startDate = startRaw ? jalaliToIso(startRaw) : null;
    const endDate = endRaw ? jalaliToIso(endRaw) : null;
    // Fully empty rows (the user opened a row but never picked anything) are
    // ignored, mirroring the education-rows behavior; a row carrying dates but
    // no title is partial and aborts.
    if (!title && !startRaw && !endRaw) continue;
    if (title.length < 2) throw new Error("invalid-work-history-json");
    if ((startRaw && !startDate) || (endRaw && !endDate)) throw new Error("invalid-work-history-json");
    if (startDate && endDate && startDate > endDate) throw new Error("invalid-work-history-json");
    // الحاقیهٔ ۲.۱۴.۰ — نوع همکاری و کلید مدرک همکاری (همان قواعد فرم قبلی)
    const cooperationType = text(record.cooperationType, 20);
    if (cooperationType && !(cooperationType in cooperationTypeOptions)) throw new Error("invalid-work-history-json");
    rows.push({
      title,
      employer: normalizeText(String(record.employer || "")).slice(0, 180) || null,
      cooperationType: cooperationType || null,
      position: normalizeText(String(record.position || "")).slice(0, 120) || null,
      startDate, endDate,
      description: normalizeText(String(record.description || "")).slice(0, 2000) || null,
      docKey: text(record.docKey, 60) || null,
    });
  }
  return rows;
}

/* ---------------- الحاقیهٔ ۲.۱۴.۰ — پارسرهای مشترک مرحلهٔ تخصص‌ها ----------------
 * همان قواعد و شکل‌های فرم قبلی ثبت‌نام یک‌مرحله‌ای؛ بدون هیچ ستون یا مفهوم جدید. */

export type StagedDocRow = { key: string; name: string; mime: string; size: number; section: string };

/** مدارک بارگذاری‌شدهٔ درون‌بخشی (staged) — بخش‌های مجاز مرحلهٔ تخصص‌ها. */
export function parseStagedDocsInput(data: FormData, allowedSections?: RegExp): StagedDocRow[] {
  const raw = String(data.get("stagedDocs") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-staged-docs-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-staged-docs-json");
  const sections = /^(photo|evidence|university|seminary|memorization|specialty:[a-z_]+|work:\d+|course:\d+|education:\d+)$/;
  const rows: StagedDocRow[] = [];
  for (const item of parsed.slice(0, 20)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-staged-docs-json");
    const record = item as Record<string, unknown>;
    const key = String(record.key || "");
    const name = text(record.name, 180);
    const mime = String(record.mime || "");
    const size = Number(record.size);
    const section = String(record.section || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new Error("invalid-staged-docs-json");
    if (!name || !["application/pdf", "image/png", "image/jpeg"].includes(mime)) throw new Error("invalid-staged-docs-json");
    if (!Number.isSafeInteger(size) || size <= 0 || size > 5 * 1024 * 1024) throw new Error("invalid-staged-docs-json");
    if (!(allowedSections ?? sections).test(section)) throw new Error("invalid-staged-docs-json");
    rows.push({ key, name, mime, size, section });
  }
  if (rows.length !== new Set(rows.map((doc) => doc.key)).size) throw new Error("invalid-staged-docs-json");
  return rows;
}

/** پیوند گواهی تخصص: [{ code, key }] — هر کلید فقط به یک تخصص. */
export function parseSpecialtyCertKeysInput(data: FormData, chosenCodes: Set<string>): Array<{ code: string; key: string }> {
  const raw = String(data.get("specialtyCertKeys") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-cert-keys-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-cert-keys-json");
  const rows: Array<{ code: string; key: string }> = [];
  for (const item of parsed.slice(0, 20)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-cert-keys-json");
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    const key = String(record.key || "");
    if (!code || !chosenCodes.has(code) || !key) throw new Error("invalid-cert-keys-json");
    rows.push({ code, key });
  }
  if (rows.length !== new Set(rows.map((item) => item.key)).size) throw new Error("invalid-cert-keys-json");
  return rows;
}

/** دوره‌های گذرانده‌شده — همان قواعد فرم ثبت‌نام (رشتهٔ کشویی وابسته، ساعت، تاریخ شمسی). */
export function parseCoursesInput(data: FormData): Array<{ title: string; provider: string | null; field: string | null; completedDate: string | null; hours: number | null; docKey: string | null }> {
  const raw = String(data.get("courses") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-courses-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-courses-json");
  const rows: Array<{ title: string; provider: string | null; field: string | null; completedDate: string | null; hours: number | null; docKey: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-courses-json");
    const record = item as Record<string, unknown>;
    const title = text(record.title, 180);
    const selectedField = text(record.field, 40);
    const hoursRaw = text(record.hours, 10);
    const completedRaw = String(record.completedDate || "").slice(0, 20);
    const completedDate = completedRaw ? jalaliToIso(completedRaw) : null;
    // ردیف کاملاً خالی نادیده گرفته می‌شود؛ ردیف ناقص کل ذخیره را متوقف می‌کند.
    if (!title && !selectedField && !completedRaw) continue;
    if (title.length < 2) throw new Error("invalid-courses-json");
    if (selectedField && !(selectedField in courseFieldOptions)) throw new Error("invalid-courses-json");
    if (completedRaw && !completedDate) throw new Error("invalid-courses-json");
    if (hoursRaw && !/^\d{1,4}$/.test(hoursRaw)) throw new Error("invalid-courses-json");
    rows.push({
      title,
      provider: text(record.provider, 180) || null,
      field: selectedField || null,
      completedDate,
      hours: hoursRaw ? Number(hoursRaw) : null,
      docKey: text(record.docKey, 60) || null,
    });
  }
  return rows;
}

/** سوابق فعالیت قرآنی — نوع فعالیت با کشویی وابستهٔ رشته (فقط تدریس/داوری). */
export function parseActivityRecordsInput(data: FormData): Array<{ kind: string; field: string | null; title: string; organization: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> {
  const raw = String(data.get("activityRecords") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-activities-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-activities-json");
  const rows: Array<{ kind: string; field: string | null; title: string; organization: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-activities-json");
    const record = item as Record<string, unknown>;
    const kind = text(record.kind, 20);
    const title = text(record.title, 180);
    const selectedField = text(record.field, 40);
    const startRaw = String(record.startDate || "").slice(0, 20);
    const endRaw = String(record.endDate || "").slice(0, 20);
    const startDate = startRaw ? jalaliToIso(startRaw) : null;
    const endDate = endRaw ? jalaliToIso(endRaw) : null;
    if (!kind && !title && !startRaw && !endRaw) continue;
    if (!(kind in activityRecordKindLabels) || title.length < 2) throw new Error("invalid-activities-json");
    if (selectedField && !(selectedField in courseFieldOptions)) throw new Error("invalid-activities-json");
    if (selectedField && !["teaching", "judging"].includes(kind)) throw new Error("invalid-activities-json");
    if ((startRaw && !startDate) || (endRaw && !endDate)) throw new Error("invalid-activities-json");
    if (startDate && endDate && startDate > endDate) throw new Error("invalid-activities-json");
    rows.push({
      kind,
      field: selectedField || null,
      title,
      organization: text(record.organization, 180) || null,
      position: text(record.position, 120) || null,
      startDate, endDate,
      description: text(record.description, 2000) || null,
    });
  }
  return rows;
}
