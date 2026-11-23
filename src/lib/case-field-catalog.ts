// الحاقیهٔ ۲.۲۶.۰ — کاتالوگ فیلدهای ثابت مراحل ثبت پرونده
// -----------------------------------------------------------
// همهٔ فیلدهای ثابت پنج مرحلهٔ پایه (هویتی، محل فعالیت، تخصص‌ها، مدارک و
// بازبینی) با کلید پایدار در این کاتالوگ تعریف می‌شوند تا مدیر سامانه بتواند
// عنوان، متن راهنما، الزام و نمایان‌بودن تک‌تک آن‌ها را از پنل مدیریت مراحل
// (/steps) ویرایش کند — بدون هیچ استثنا. کلیدها هرگز تغییر نمی‌کنند و ستون‌های
// دادهٔ پرونده دست‌نخورده می‌مانند؛ ویرایش فقط لایهٔ نمایش و اعتبارسنجی تازه را
// عوض می‌کند و پاسخ‌ها/سوابق تاریخی حفظ می‌شوند.
//
// این ماژول «محض» است (بدون وابستگی به db) تا هم سمت سرور و هم در کامپوننت‌های
// کلاینت استفاده شود؛ خواندن overrideها از دیتابیس در src/lib/case-field-meta.ts است.

export type CaseFieldScope = "identity" | "location" | "specialties" | "documents" | "review";
export type CaseFieldRole = "section" | "field" | "requirement";

export type CaseFieldSettings = {
  /** کلید پایدار — هرگز تغییر نمی‌کند؛ کلید override در DB نیز همین است */
  key: string;
  scope: CaseFieldScope;
  role: CaseFieldRole;
  /** عنوان پیش‌فرض (مطابق فرم فعلی — پیش از هر ویرایش نمایش تغییری نمی‌کند) */
  label: string;
  /** متن راهنمای پیش‌فرض زیر فیلد */
  help?: string;
  /** الزام پیش‌فرض در اعتبارسنجی */
  required: boolean;
  /** امکان برداشتن الزام از پنل مدیریت */
  canToggleRequired: boolean;
  /** امکان مخفی‌سازی (حذف از فرم بدون حذف داده) از پنل مدیریت */
  canHide: boolean;
};

const section = (key: string, scope: CaseFieldScope, label: string): CaseFieldSettings => ({ key, scope, role: "section", label, required: false, canToggleRequired: false, canHide: false });
const field = (key: string, scope: CaseFieldScope, label: string, required: boolean, extra: Partial<CaseFieldSettings> = {}): CaseFieldSettings => ({ key, scope, role: "field", label, required, canToggleRequired: true, canHide: true, ...extra });
const requirement = (key: string, scope: CaseFieldScope, label: string, required: boolean, extra: Partial<CaseFieldSettings> = {}): CaseFieldSettings => ({ key, scope, role: "requirement", label, required, canToggleRequired: true, canHide: false, ...extra });

export const CASE_FIELD_CATALOG: ReadonlyArray<CaseFieldSettings> = [
  /* ---------------- مرحلهٔ ۱ — هویتی ---------------- */
  section("identity.section.identity", "identity", "اطلاعات هویتی و تماس"),
  // الزام ترکیبی نام و نام خانوادگی: تک‌الزامِ دو فیلد نام و نام خانوادگی؛
  // ستارهٔ اجباری هر دو فیلد از همین‌جا می‌آید و برداشتن الزام هر دو را اختیاری می‌کند.
  requirement("identity.fullName", "identity", "نام و نام خانوادگی", true),
  // نام و نام خانوادگی ستون notNull رکورد فعالان را می‌سازند — مخفی‌سازی ممکن نیست
  field("identity.firstName", "identity", "نام", true, { canToggleRequired: false, canHide: false }),
  field("identity.lastName", "identity", "نام خانوادگی", true, { canToggleRequired: false, canHide: false }),
  field("identity.fatherName", "identity", "نام پدر", true),
  field("identity.nationalId", "identity", "کد ملی", true, { help: "کد ملی برای جست‌وجو محافظت و در فهرست‌ها پوشانده می‌شود." }),
  field("identity.idCardNumber", "identity", "شماره شناسنامه", true, { help: "شماره شناسنامه بدون صفرهای ابتدایی." }),
  field("identity.idIssuePlace", "identity", "محل صدور شناسنامه", true),
  field("identity.birthDate", "identity", "تاریخ تولد شمسی", true, { help: "انتخاب تاریخ فقط از تقویم شمسی بازشونده." }),
  field("identity.gender", "identity", "جنسیت", true),
  field("identity.phone", "identity", "شماره همراه", true),
  field("identity.alternatePhone", "identity", "شماره همراه جایگزین", true),
  field("identity.contactEmail", "identity", "ایمیل تماس", false),
  field("identity.source", "identity", "منبع ثبت اطلاعات", false, { canToggleRequired: false }),
  section("identity.section.education", "identity", "تحصیلات"),
  section("identity.section.university", "identity", "تحصیلات دانشگاهی"),
  field("identity.universityLevel", "identity", "مقطع تحصیلی", false, { canToggleRequired: false }),
  field("identity.universityField", "identity", "رشته تحصیلی", false, { canToggleRequired: false, help: "می‌توانید تایپ کنید یا از پیشنهادها انتخاب کنید." }),
  field("identity.universityType", "identity", "نوع دانشگاه", false, { canToggleRequired: false }),
  field("identity.universityCenterName", "identity", "نام دانشگاه", false, { canToggleRequired: false }),
  field("identity.universityDoc", "identity", "بارگذاری مدرک تحصیلی دانشگاهی", false, { canToggleRequired: false, canHide: false }),
  section("identity.section.seminary", "identity", "تحصیلات حوزوی"),
  field("identity.seminaryLevel", "identity", "سطح تحصیلات حوزوی", false, { canToggleRequired: false }),
  field("identity.seminaryDoc", "identity", "بارگذاری مدرک تحصیلی حوزوی", false, { canToggleRequired: false, canHide: false }),

  /* ---------------- مرحلهٔ ۲ — محل فعالیت ---------------- */
  section("location.section.residence", "location", "محل سکونت"),
  // الزام ترکیبی استان و شهرستان سکونت: تک‌الزامِ دو کشویی محل سکونت
  requirement("location.residence", "location", "استان و شهرستان سکونت", true),
  field("location.provinceId", "location", "استان", true, { canHide: false, canToggleRequired: false }),
  field("location.countyId", "location", "شهرستان", true, { canHide: false, canToggleRequired: false, help: "فهرست پیش‌فرض شامل شهرستان‌های مرکز استان است و توسط مدیر قابل تکمیل است." }),
  field("location.city", "location", "شهر / محل سکونت", false),
  field("location.postalCode", "location", "کد پستی", false),
  field("location.address", "location", "نشانی", false),
  section("location.section.activity", "location", "محل فعالیت قرآنی"),
  field("location.activityProvinceId", "location", "استان فعالیت", false, { canToggleRequired: false, canHide: false }),
  field("location.activityCountyId", "location", "شهرستان فعالیت", false, { canToggleRequired: false, canHide: false }),
  field("location.activityPlace", "location", "محل فعالیت قرآنی", false),
  field("location.organization", "location", "مؤسسه قرآنی محل فعالیت", false),

  /* ---------------- مرحلهٔ ۳ — تخصص‌ها ---------------- */
  section("specialties.section.grid", "specialties", "تخصص‌های قرآنی"),
  requirement("specialties.minOne", "specialties", "حداقل یک تخصص قرآنی", true),
  requirement("specialties.details", "specialties", "جزئیات تخصص‌ها", true, { canToggleRequired: false }),
  section("specialties.section.writings", "specialties", "آثار (کتاب / مقاله)"),
  section("specialties.section.workHistory", "specialties", "سوابق شغلی"),
  section("specialties.section.courses", "specialties", "دوره‌های گذرانده‌شده"),
  section("specialties.section.activities", "specialties", "سوابق فعالیت قرآنی"),
  field("specialties.job", "specialties", "شغل", false, { help: "فیلد مستقل از مؤسسه قرآنی محل فعالیت ثبت می‌شود." }),
  field("specialties.notes", "specialties", "توضیحات تکمیلی", false),

  /* ---------------- مرحلهٔ ۴ — مدارک ---------------- */
  section("documents.section.photo", "documents", "تصویر پرسنلی"),
  requirement("documents.photo", "documents", "تصویر پرسنلی", true, { canHide: false }),
  section("documents.section.evidence", "documents", "مدارک پشتیبان"),
  requirement("documents.evidence", "documents", "حداقل یک مدرک پشتیبان", true, { canHide: false }),
  requirement("documents.docRequests", "documents", "بارگذاری یا پاسخ مدارک درخواستی", true, { canToggleRequired: false }),

  /* ---------------- مرحلهٔ ۵ — بازبینی و ارسال ---------------- */
  field("review.readiness", "review", "بررسی آمادگی ارسال", false, { canToggleRequired: false, canHide: false }),
  field("review.submit", "review", "ارسال برای بررسی", false, { canToggleRequired: false, canHide: false }),
];

/** کاتالوگ یک مرحله با ترتیب تعریف — منبع فهرست پنل مدیریت */
export function caseFieldCatalogFor(scope: CaseFieldScope): ReadonlyArray<CaseFieldSettings> {
  return CASE_FIELD_CATALOG.filter((item) => item.scope === scope);
}

export type ResolvedCaseField = { key: string; label: string; help: string | null; required: boolean; hidden: boolean; overridden: boolean };
export type CaseFieldMetaMap = Record<string, ResolvedCaseField>;

/** نگاشت پیش‌فرض کاتالوگ → نگاشت حل‌شده (بدون هیچ override) */
export function defaultCaseFieldMeta(): CaseFieldMetaMap {
  const map: CaseFieldMetaMap = {};
  for (const item of CASE_FIELD_CATALOG) {
    map[item.key] = { key: item.key, label: item.label, help: item.help ?? null, required: item.required, hidden: false, overridden: false };
  }
  return map;
}

/** خوانش امن یک فیلد از نگاشت — در نبود ورودی، پیش‌فرض کاتالوگ برمی‌گردد */
export function resolvedCaseField(meta: CaseFieldMetaMap | undefined | null, key: string): ResolvedCaseField {
  const hit = meta?.[key];
  if (hit) return hit;
  const base = CASE_FIELD_CATALOG.find((item) => item.key === key);
  return { key, label: base?.label ?? key, help: base?.help ?? null, required: base?.required ?? false, hidden: false, overridden: false };
}

/** برچسب الزام‌دار: وقتی فیلد اجباری است، ستاره‌دار نمایش داده می‌شود */
export function requiredMark(resolved: ResolvedCaseField): string | null {
  return resolved.required ? "*" : null;
}
