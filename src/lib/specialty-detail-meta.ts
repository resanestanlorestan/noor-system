// الحاقیهٔ ۲.۲۸.۰ — لودر سمت سرور متای مؤثر فیلد جزئیات تخصص‌ها.
// نگاشت کد تخصص ← نوع فیلد/عنوان/راهنما/سقف انتخاب/گزینه‌های حل‌شده.
// ردیف غایب در specialty_detail_overrides یعنی پیش‌فرض ثابت کد
// (defaultSpecialtyDetailMeta از constants). خطای DB یا نبود جدول هرگز
// زنجیرهٔ ثبت پرونده را نمی‌شکند: در خطا فقط پیش‌فرض‌ها برمی‌گردند (الگوی
// loadCaseFieldMeta الحاقیهٔ ۲.۲۶.۰). گزینه‌های مخفی‌شده در «نمایش» دادهٔ
// قدیمی معتبر می‌مانند ولی در فرم دیگر قابل انتخاب نیستند.
//
// کدهای شناخته‌شده از خود specialtyDetailSpec (constants) می‌آیند؛ کدهای
// افزودهٔ پنل مدیریت (sp…) فقط با ردیف override وارد نقشه می‌شوند.
import { db } from "@/db";
import { specialtyDetailOverrides } from "@/db/schema";
import { specialtyDetailSpec, defaultSpecialtyDetailMeta, selectableSpecialtyOptions, specialtySelectLabels, type SpecialtyDetailMeta } from "@/lib/constants";

export type { SpecialtyDetailMeta, SpecialtyDetailOption } from "@/lib/constants";
export type SpecialtyDetailMetaMap = Record<string, SpecialtyDetailMeta>;
export { selectableSpecialtyOptions, specialtySelectLabels, defaultSpecialtyDetailMeta };

const VALID_KINDS = ["juz", "level", "checklist", "writings", "none"] as const;
type ValidKind = (typeof VALID_KINDS)[number];

/** Merge one stored override onto the resolved map; codes without a default
 *  (panel-added specialties) gain a brand-new detail field here. */
function applyOverride(map: SpecialtyDetailMetaMap, row: {
  code: string; kind: string;
  label: string | null; hint: string | null; maxOptions: number | null;
  options: Array<{ key: string; label: string; hidden?: boolean }> | null;
}): void {
  const code = String(row.code || "").trim();
  if (!code || !VALID_KINDS.includes(row.kind as ValidKind)) return;
  const kind = row.kind as ValidKind;
  const resolved = map[code] ?? defaultSpecialtyDetailMeta(code) ?? { kind: "none" as const, label: null, hint: null, maxOptions: null, options: [] };
  const label = row.label?.trim() ?? null;
  const hint = row.hint?.trim() ?? null;
  const options = Array.isArray(row.options)
    ? row.options.filter((option) => option && typeof option.key === "string" && typeof option.label === "string" && option.key.length <= 40 && option.label.trim().length > 0 && option.label.length <= 100).map((option) => ({ key: option.key, label: option.label.trim(), ...(option.hidden ? { hidden: true } : {}) }))
    : [];
  map[code] = {
    kind,
    label: label || resolved.label,
    hint: hint !== null && hint !== "" ? hint : resolved.hint,
    maxOptions: row.maxOptions === null || row.maxOptions === undefined ? resolved.maxOptions : row.maxOptions,
    // نوع تغییر کرده ولی فهرست گزینه خالی مانده → بدون گزینه (فرم چیزی نشان نمی‌دهد)
    options: options.length ? options : kind === resolved.kind ? resolved.options : [],
    overridden: true,
  };
}

export async function loadSpecialtyDetailMeta(): Promise<SpecialtyDetailMetaMap> {
  const map: SpecialtyDetailMetaMap = {};
  // پیش‌فرض‌ها برای همهٔ کدهای شناخته‌شده (کد بدون ردیف override هم دیده می‌شود)
  for (const code of Object.keys(specialtyDetailSpec)) {
    const resolved = defaultSpecialtyDetailMeta(code);
    if (resolved) map[code] = resolved;
  }
  try {
    const rows = await db.select().from(specialtyDetailOverrides);
    for (const row of rows) applyOverride(map, row);
  } catch {
    // جدول غایب یا خطای DB — فقط پیش‌فرض‌های ثابت کد
  }
  return map;
}
