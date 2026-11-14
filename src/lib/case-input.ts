// Shared form-input parsing for the case registration flow.
// Extracted from the old single-shot save action so that both the step-by-step
// wizard actions (src/app/actions/case-steps.ts) and the preserved full-save
// core (src/lib/case-save.ts) validate payloads with exactly the same rules.
// Plain library module — no "use server" — so nothing here becomes a callable
// Server Action endpoint.

import { jalaliToIso, normalizeText } from "@/lib/format";
import { educationLevelOptions, educationTypeLabels, hafizJuzOptions, recitationLevelOptions, specialtyDetailSpec, writingTypeLabels, type EducationType, type WritingType } from "@/lib/constants";

export const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);
export const numeric = (value: string) => /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;

/** Parses the education-rows JSON posted by the profile form.
 *  Each row needs a valid type and a level matching that type; optional text
 *  fields are trimmed and length-capped. Invalid payload aborts the save. */
export function parseEducationInput(data: FormData): Array<{ type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null }> {
  const raw = String(data.get("educationRecords") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-education-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-education-json");
  const rows: Array<{ type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null }> = [];
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
    rows.push({
      type: type as EducationType, level,
      field: normalizeText(String(record.field || "")).slice(0, 120) || null,
      centerName: normalizeText(String(record.centerName || "")).slice(0, 180) || null,
      certificate: normalizeText(String(record.certificate || "")).slice(0, 180) || null,
    });
  }
  return rows;
}

/** Parses the specialty-details JSON posted by the profile form:
 *  [{ code, value?, options? }] for checked specialties that carry structured
 *  data — memorizer juz range ("1".."30"/"complete"), reciter level ("4".."7")
 *  and the checklist specialties. Unknown codes, values outside the spec or an
 *  empty checklist abort the save. Author works use parseWritingsInput. */
export function parseSpecialtyDetailsInput(data: FormData): Array<{ code: string; value: string | null; options: string[] | null }> {
  const raw = String(data.get("specialtyDetails") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-specialty-details"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-specialty-details");
  const rows: Array<{ code: string; value: string | null; options: string[] | null }> = [];
  for (const item of parsed.slice(0, 20)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-specialty-details");
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    if (!code) continue;
    const spec = specialtyDetailSpec[code];
    if (!spec || spec.kind === "none" || spec.kind === "writings") throw new Error("invalid-specialty-details");
    if (spec.kind === "juz" || spec.kind === "level") {
      const value = String(record.value || "");
      const allowed = spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions;
      if (!(value in allowed)) throw new Error("invalid-specialty-details");
      rows.push({ code, value, options: null });
      continue;
    }
    const specOptions = spec.options ?? {};
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = [...new Set(rawOptions.map((option) => String(option)).filter((option) => option in specOptions))];
    if (!options.length) throw new Error("invalid-specialty-details");
    rows.push({ code, value: null, options });
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
export function parseWorkHistoryInput(data: FormData): Array<{ title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> {
  const raw = String(data.get("workHistory") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-work-history-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-work-history-json");
  const rows: Array<{ title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> = [];
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
    rows.push({
      title,
      employer: normalizeText(String(record.employer || "")).slice(0, 180) || null,
      position: normalizeText(String(record.position || "")).slice(0, 120) || null,
      startDate, endDate,
      description: normalizeText(String(record.description || "")).slice(0, 2000) || null,
    });
  }
  return rows;
}
