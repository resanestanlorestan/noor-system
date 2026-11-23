// الحاقیهٔ ۲.۲۶.۰ — لودر سمت سرور override فیلدهای ثابت مراحل.
// نگاشت کلید پایدار ← عنوان/راهنما/الزام/مخفیِ حل‌شده. خطای DB یا نبود جدول
// هرگز زنجیرهٔ ثبت را نمی‌شکند: در خطا پیش‌فرض کاتالوگ برمی‌گردد (الگوی
// loadActiveCaseSteps). نتیجه per-request خوانده می‌شود؛ کش‌کردن لازم نیست
// چون هر صفحات ویزارد و اکشن‌ها در همان درخواست به آن نیاز دارند.
import { db } from "@/db";
import { caseFieldOverrides } from "@/db/schema";
import { CASE_FIELD_CATALOG, defaultCaseFieldMeta, type CaseFieldMetaMap } from "@/lib/case-field-catalog";

/** Merge one stored override onto the resolved map. Unknown keys (deleted
 *  catalog entries) are ignored so stale rows can never resurrect. */
function applyOverride(map: CaseFieldMetaMap, row: { stepCode: string; fieldKey: string; label: string | null; help: string | null; requiredOverride: boolean | null; hidden: boolean }): void {
  const key = `${row.stepCode}.${row.fieldKey}`;
  const resolved = map[key];
  if (!resolved) return;
  const label = row.label?.trim();
  const help = row.help?.trim() ?? null;
  map[key] = {
    ...resolved,
    label: label || resolved.label,
    help: help !== null && help !== "" ? help : resolved.help,
    required: row.requiredOverride === null ? resolved.required : row.requiredOverride,
    hidden: row.hidden,
    overridden: true,
  };
}

export async function loadCaseFieldMeta(): Promise<CaseFieldMetaMap> {
  const map = defaultCaseFieldMeta();
  try {
    const rows = await db.select().from(caseFieldOverrides);
    for (const row of rows) applyOverride(map, row);
  } catch {
    return defaultCaseFieldMeta();
  }
  return map;
}

/** شمارش کلیدهای کاتالوگ برای گارد اکشن‌ها (کلید ناموجود رد می‌شود) */
export function isKnownCaseField(stepCode: string, fieldKey: string): boolean {
  return CASE_FIELD_CATALOG.some((item) => item.scope === stepCode && item.key === `${stepCode}.${fieldKey}`);
}
