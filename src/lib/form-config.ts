// الحاقیهٔ ۲.۲۳.۰ — هستهٔ مشترک فرم‌ساز پویا: نوع‌ها، اعتبارسنجی ساختار فرم،
// موتور نمایش شرطی و اعتبارسنجی پاسخ‌ها. این ماژول هم سمت سرور (اکشن‌ها و
// اعتبارسنجی نهایی) و هم سمت کلاینت (رندر شرطی و پیش‌نمایش) استفاده می‌شود
// تا هیچ تفاوتی میان «نمایش» و «کنترل سرور» باقی نماند.

export const FORM_FIELD_TYPES = ["text", "textarea", "select", "multiselect", "checkbox", "radio", "modal", "file"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];
export const formFieldTypeLabels: Record<FormFieldType, string> = {
  text: "ورود متن کوتاه",
  textarea: "توضیحات طولانی (Textarea)",
  select: "فهرست کشویی (یک انتخاب)",
  multiselect: "فهرست کشویی چندانتخابی",
  checkbox: "چندگزینه‌ای تیک‌دار (Checkbox)",
  radio: "یک‌گزینه‌ای (Radio)",
  modal: "پنجرهٔ اطلاعات تکمیلی (Modal)",
  file: "بارگذاری فایل (مدرک/صوت/تصویر)",
};

export const FORM_FILE_ACCEPTS = ["audio", "image", "pdf", "any"] as const;
export type FormFileAccept = (typeof FORM_FILE_ACCEPTS)[number];
export const formFileAcceptLabels: Record<FormFileAccept, string> = {
  audio: "فایل صوتی (mp3/wav/ogg/m4a)",
  image: "تصویر (jpg/png)",
  pdf: "سند PDF",
  any: "هر یک از انواع مجاز",
};
/** پسوند و magic-byte های مجاز هر گروه؛ معیار واقعی بایت‌های ابتدای فایل است. */
export const formFileMimeHints: Record<FormFileAccept, string> = {
  audio: "mp3 ، wav ، ogg ، m4a",
  image: "jpg ، png",
  pdf: "pdf",
  any: "mp3/wav/ogg/m4a یا jpg/png یا pdf",
};

export type FormFieldOption = { key: string; label: string; help?: string };
export type FormCondition = { fieldKey: string; optionKeys: string[] };
export type FormFileRule = { accept: FormFileAccept; maxSizeMb: number };
export type FormField = {
  key: string;
  type: FormFieldType;
  label: string;
  help?: string;
  required: boolean;
  options?: FormFieldOption[];
  showIf?: FormCondition | null;
  file?: FormFileRule | null;
  modal?: { title: string; body: string } | null;
};
export type FormConfig = { fields: FormField[] };
export const emptyFormConfig: FormConfig = { fields: [] };

/** پاسخ‌های ذخیره‌شده: برای هر فیلد یک مقدار (رشته) یا آرایه‌ای از کلیدهای گزینه؛ فایل = شناسهٔ مدرک. */
export type FormAnswerValue = string | string[];
export type FormAnswers = Record<string, FormAnswerValue>;

const FIELD_KEY_RE = /^fld_[0-9a-z]{6,16}$/;
const OPTION_KEY_RE = /^opt_[0-9a-z]{6,16}$/;

export function newFieldKey(): string {
  return "fld_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
export function newOptionKey(): string {
  return "opt_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

const hasOptionTypes: FormFieldType[] = ["select", "multiselect", "checkbox", "radio"];

/** اعتبارسنجی کامل ساختار فرم پیش از ذخیره/انتشار؛ پیام خطا فارسی و قابل نمایش به مدیر است. */
export function validateFormConfig(raw: unknown): { ok: true; config: FormConfig } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as FormConfig).fields)) return { ok: false, error: "ساختار فرم معتبر نیست." };
  const fields = (raw as FormConfig).fields;
  if (fields.length > 60) return { ok: false, error: "حداکثر ۶۰ فیلد برای هر فرم مجاز است." };
  const seen = new Set<string>();
  const byKey = new Map<string, FormField>();
  for (const field of fields) {
    if (typeof field !== "object" || field === null) return { ok: false, error: "ساختار فیلدها معتبر نیست." };
    const f = field as FormField;
    if (!FIELD_KEY_RE.test(f.key || "")) return { ok: false, error: "شناسهٔ پایدار یکی از فیلدها معتبر نیست." };
    if (seen.has(f.key)) return { ok: false, error: "شناسهٔ فیلد تکراری است." };
    seen.add(f.key);
    if (!FORM_FIELD_TYPES.includes(f.type)) return { ok: false, error: "نوع یکی از فیلدها معتبر نیست." };
    const label = String(f.label || "").trim();
    if (label.length < 2 || label.length > 180) return { ok: false, error: `عنوان فیلد «${label || "بدون عنوان"}» باید ۲ تا ۱۸۰ نویسه باشد.` };
    if (f.help && String(f.help).length > 500) return { ok: false, error: "متن راهنمای فیلد حداکثر ۵۰۰ نویسه است." };
    if (hasOptionTypes.includes(f.type)) {
      const options = Array.isArray(f.options) ? f.options : [];
      if (options.length < 1) return { ok: false, error: `فیلد «${label}» حداقل به یک گزینه نیاز دارد.` };
      if (options.length > 40) return { ok: false, error: `فیلد «${label}» حداکثر ۴۰ گزینه می‌تواند داشته باشد.` };
      const optKeys = new Set<string>();
      for (const option of options) {
        if (!OPTION_KEY_RE.test(option.key || "")) return { ok: false, error: `گزینه‌های فیلد «${label}» شناسهٔ پایدار معتبر ندارند.` };
        if (optKeys.has(option.key)) return { ok: false, error: `گزینهٔ تکراری در فیلد «${label}».` };
        optKeys.add(option.key);
        const optionLabel = String(option.label || "").trim();
        if (optionLabel.length < 1 || optionLabel.length > 180) return { ok: false, error: `برچسب گزینه‌های فیلد «${label}» معتبر نیست.` };
        if (option.help && String(option.help).length > 300) return { ok: false, error: `راهنمای گزینه در فیلد «${label}» حداکثر ۳۰۰ نویسه است.` };
      }
    } else if (f.options && f.options.length) return { ok: false, error: `فیلد «${label}» گزینه ندارد؛ گزینه‌ها فقط برای انواع انتخابی معتبرند.` };
    if (f.type === "file") {
      const rule = f.file;
      if (!rule || !FORM_FILE_ACCEPTS.includes(rule.accept)) return { ok: false, error: `قانون فایل فیلد «${label}» معتبر نیست.` };
      if (!Number.isFinite(rule.maxSizeMb) || rule.maxSizeMb < 1 || rule.maxSizeMb > 10) return { ok: false, error: `حجم مجاز فایل فیلد «${label}» باید بین ۱ تا ۱۰ مگابایت باشد.` };
    }
    if (f.type === "modal") {
      const modal = f.modal;
      if (!modal || String(modal.title || "").trim().length < 2 || String(modal.title).length > 180) return { ok: false, error: `عنوان پنجرهٔ فیلد «${label}» معتبر نیست.` };
      if (!modal.body || String(modal.body).trim().length < 2 || String(modal.body).length > 4000) return { ok: false, error: `متن پنجرهٔ فیلد «${label}» باید ۲ تا ۴۰۰۰ نویسه باشد.` };
    }
    if (f.showIf) {
      const source = byKey.get(f.showIf.fieldKey);
      if (!source || !hasOptionTypes.includes(source.type)) return { ok: false, error: `شرط نمایش فیلد «${label}» به یک فیلد گزینه‌دارِ پیشین اشاره نمی‌کند؛ فیلد شرط باید پیش از فیلد وابسته تعریف شود.` };
      const valid = new Set((source.options || []).map((o) => o.key));
      const picked = (f.showIf.optionKeys || []).filter((k) => valid.has(k));
      if (!picked.length) return { ok: false, error: `شرط نمایش فیلد «${label}» حداقل به یک گزینهٔ معتبر نیاز دارد.` };
    }
    byKey.set(f.key, f);
  }
  return { ok: true, config: { fields } };
}

/** موتور نمایش شرطی — فیلد دیده می‌شود اگر شرط آن با پاسخ‌های فعلی برقرار باشد. */
export function isFieldVisible(field: FormField, answers: FormAnswers): boolean {
  const condition = field.showIf;
  if (!condition) return true;
  const value = answers[condition.fieldKey];
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  return condition.optionKeys.some((key) => picked.includes(key));
}

/** مقادیر مجاز هر نوع؛ خروجی نرمال برای ذخیره در JSONB. */
function normalizeAnswer(field: FormField, value: unknown): FormAnswerValue | null {
  if (hasOptionTypes.includes(field.type)) {
    const valid = new Set((field.options || []).map((o) => o.key));
    const picked = (Array.isArray(value) ? value : value ? [String(value)] : []).map(String).filter((k) => valid.has(k));
    if (!picked.length) return null;
    return field.type === "select" || field.type === "radio" ? picked[0] : [...new Set(picked)];
  }
  if (field.type === "file") {
    const text = String(value ?? "").trim();
    return /^[0-9a-f-]{36}$/.test(text) ? text : null;
  }
  if (field.type === "modal") return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const max = field.type === "textarea" ? 4000 : 500;
  return text.slice(0, max);
}

/** اعتبارسنجی و نرمال‌سازی کامل پاسخ‌ها علیه نسخهٔ منتشرشدهٔ فرم.
 *  فیلدهای نامرئی (شرط برقرار نیست) نادیده گرفته و پاک می‌شوند؛ الزام فقط برای
 *  فیلدهای مرئی کنترل می‌شود؛ فایلِ فیلد باید مدرکی واقعاً متعلق به همین پرونده باشد. */
export function validateFormAnswers(config: FormConfig, raw: FormAnswers, ownedFileIds: Set<string>): { ok: true; answers: FormAnswers } | { ok: false; error: string } {
  const answers: FormAnswers = {};
  for (const field of config.fields) {
    if (!isFieldVisible(field, raw)) continue;
    const value = normalizeAnswer(field, raw[field.key]);
    if (!value) {
      if (field.required) return { ok: false, error: `پاسخ فیلد اجباری «${field.label}» کامل نیست.` };
      continue;
    }
    if (field.type === "file" && typeof value === "string" && !ownedFileIds.has(value)) {
      return { ok: false, error: `مدرک بارگذاری‌شده برای فیلد «${field.label}» معتبر نیست یا متعلق به این پرونده نیست.` };
    }
    answers[field.key] = value;
  }
  return { ok: true, answers };
}

/** پیش‌پرکردن پاسخ‌ها از نسخهٔ قدیمی: فقط کلیدهایی که در نسخهٔ فعلی هم معتبرند نگه داشته می‌شوند. */
export function carryOverAnswers(config: FormConfig, saved: FormAnswers | null | undefined): FormAnswers {
  if (!saved) return {};
  const result: FormAnswers = {};
  for (const field of config.fields) {
    if (saved[field.key] === undefined) continue;
    const value = normalizeAnswer(field, saved[field.key]);
    if (value !== null) result[field.key] = value;
  }
  return result;
}
