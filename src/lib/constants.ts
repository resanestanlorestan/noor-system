export const roleLabels = {
  super_admin: "مدیر کل سامانه", province_admin: "مدیر استانی", county_admin: "مدیر شهرستان",
  reviewer: "کارشناس بررسی", specialist: "کارشناس تخصصی", activist: "فعال قرآنی",
} as const;
export type UserRole = keyof typeof roleLabels;
export const statusLabels = { initial: "ثبت‌نام اولیه", draft: "پیش‌نویس", completing: "در حال تکمیل", ready: "آماده ارسال", pending: "در انتظار بررسی", needs_correction: "نیازمند اصلاح", specialist_review: "بررسی تخصصی", approved: "تأییدشده", rejected: "ردشده" } as const;
export type AppStatus = keyof typeof statusLabels;
export const sourceLabels = { self: "ثبت توسط فرد", manager: "ثبت توسط مدیر", expert: "ثبت توسط کارشناس", paper: "ورود از فرم کاغذی" } as const;
export const auditActionLabels: Record<string, string> = {
  login: "ورود به سامانه", login_failed: "تلاش ناموفق ورود", logout: "خروج از سامانه", register: "ثبت‌نام فعال قرآنی",
  bootstrap_admin: "راه‌اندازی مدیر اولیه", change_password: "تغییر گذرواژه", claim_case: "اتصال پرونده به حساب",
  create_draft: "ایجاد پیش‌نویس پرونده", update_draft: "ویرایش پیش‌نویس پرونده", upload_document: "بارگذاری مدرک", download_document: "دریافت مدرک",
  upload_photo: "بارگذاری تصویر پرسنلی", remove_photo: "حذف تصویر پرسنلی",
  prepare_submission: "آماده‌سازی ارسال", submit: "ارسال پرونده برای بررسی", assign_expert: "ارجاع به کارشناس بررسی",
  needs_correction: "درخواست اصلاح", approved: "تأیید نهایی پرونده", rejected: "رد پرونده", refer_specialist: "ارجاع تخصصی",
  specialist_opinion: "ثبت نظر تخصصی", respond_correction: "پاسخ درخواست اصلاح", request_revision: "درخواست بازنگری پرونده تأییدشده",
  submit_appeal: "ثبت اعتراض", assign_appeal: "ارجاع اعتراض", resolve_appeal: "ثبت نتیجه اعتراض",
  create_staff: "ایجاد کاربر سازمانی", update_staff: "ویرایش کاربر سازمانی", activate_user: "فعال‌سازی کاربر", deactivate_user: "غیرفعال‌سازی کاربر",
  add_county: "افزودن شهرستان", export_report: "خروجی گزارش آماری",
  change_email: "تغییر ایمیل حساب", add_specialty: "افزودن تخصص", restore_version: "بازگردانی نسخه قبلی پرونده",
  export_case_list: "خروجی فهرست پرونده‌ها",
  request_documents: "درخواست مدارک مشخص", explain_document_request: "ثبت توضیح برای مدرک درخواستی",
  add_activity_record: "ثبت سابقه فعالیت", delete_activity_record: "حذف سابقه فعالیت",
  add_educational_course: "ثبت دوره آموزشی", delete_educational_course: "حذف دوره آموزشی",
  add_certificate: "ثبت گواهینامه یا افتخار", delete_certificate: "حذف گواهینامه یا افتخار",
  add_organization: "افزودن سازمان به فهرست", link_organization: "ثبت همکاری با سازمان", unlink_organization: "حذف همکاری با سازمان",
  add_education_record: "ثبت سابقه تحصیلی", delete_education_record: "حذف سابقه تحصیلی",
  add_writing: "ثبت اثر مؤلف", delete_writing: "حذف اثر مؤلف",
  mfa_challenge: "درخواست کد دومرحله‌ای", mfa_failed: "تلاش ناموفق کد دومرحله‌ای", enable_mfa: "فعال‌سازی احراز هویت دومرحله‌ای", disable_mfa: "غیرفعال‌سازی احراز هویت دومرحله‌ای",
  password_reset_requested: "درخواست بازیابی گذرواژه", reset_password: "بازنشانی گذرواژه با پیوند بازیابی",
  verify_email: "تأیید ایمیل حساب", resend_email_verification: "ارسال مجدد پیوند تأیید ایمیل", change_email_requested: "درخواست تغییر ایمیل (در انتظار تأیید)",
  role_permission_changed: "تغییر مجوز نقش در ماتریس دسترسی", role_defaults_restored: "بازنشانی مجوزهای پیش‌فرض نقش",
  custom_role_created: "ایجاد نقش سفارشی", custom_role_updated: "ویرایش نقش سفارشی", custom_role_deleted: "حذف نقش سفارشی",
};
export const documentRequestStatusLabels = { open: "در انتظار", fulfilled: "بارگذاری شد", explained: "توضیح داده شد" } as const;
export const activityRecordKindLabels = { activity: "فعالیت قرآنی", teaching: "تدریس", judging: "داوری", competition: "شرکت در مسابقات", research: "پژوهش" } as const;
export type ActivityRecordKind = keyof typeof activityRecordKindLabels;
// Educational background (مرحله سوم): seminary/university type labels and the
// level (مقطع) options per type. Levels are stored as their Persian label.
export const educationTypeLabels = { seminary: "حوزوی", university: "دانشگاهی" } as const;
export type EducationType = keyof typeof educationTypeLabels;
export const educationLevelOptions: Record<EducationType, string[]> = {
  seminary: ["مقدمات", "سطح ۱", "سطح ۲", "سطح ۳", "سطح ۴"],
  university: ["دیپلم", "کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری", "فوق دکتری"],
};
export const referenceProvinces: [string, string][] = [
  ["آذربایجان شرقی", "تبریز"], ["آذربایجان غربی", "ارومیه"], ["اردبیل", "اردبیل"], ["اصفهان", "اصفهان"], ["البرز", "کرج"], ["ایلام", "ایلام"], ["بوشهر", "بوشهر"], ["تهران", "تهران"], ["چهارمحال و بختیاری", "شهرکرد"], ["خراسان جنوبی", "بیرجند"], ["خراسان رضوی", "مشهد"], ["خراسان شمالی", "بجنورد"], ["خوزستان", "اهواز"], ["زنجان", "زنجان"], ["سمنان", "سمنان"], ["سیستان و بلوچستان", "زاهدان"], ["فارس", "شیراز"], ["قزوین", "قزوین"], ["قم", "قم"], ["کردستان", "سنندج"], ["کرمان", "کرمان"], ["کرمانشاه", "کرمانشاه"], ["کهگیلویه و بویراحمد", "بویراحمد"], ["گلستان", "گرگان"], ["گیلان", "رشت"], ["لرستان", "خرم‌آباد"], ["مازندران", "ساری"], ["مرکزی", "اراک"], ["هرمزگان", "بندرعباس"], ["همدان", "همدان"], ["یزد", "یزد"],
];
export const referenceSpecialties = [
  { code: "reciter", title: "قاری قرآن" }, { code: "memorizer", title: "حافظ قرآن" },
  { code: "commentator", title: "مفسر و تدبّرگر قرآن" }, { code: "author", title: "مؤلف قرآنی" },
  { code: "cultural_activist", title: "فعال قرآنی" },
  { code: "teacher", title: "مدرس قرآن" }, { code: "trainer", title: "معلم قرآن" },
  { code: "judge", title: "داور و ممتحن قرآنی" }, { code: "researcher", title: "پژوهشگر قرآنی" },
  { code: "other", title: "سایر فعالیت‌های قرآنی" },
];
// (مرحله چهارم) Structured detail options per specialty. The dropdown labels
// below are the exact storage values' display text; storage keys stay stable
// (Latin codes / digits) so renamed labels never corrupt stored data.
export const hafizJuzOptions: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [String(index + 1), `جزء ${faDigitOf(index + 1)}`])),
  complete: "کل قرآن",
};
function faDigitOf(value: number) { return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]); }
export const recitationLevelOptions: Record<string, string> = {
  "4": "سطح ۴", "5": "سطح ۵", "6": "سطح ۶", "7": "سطح ۷",
};
export const commentatorOptions: Record<string, string> = {
  tafsir: "تفسیر", tadabbor: "تدبر", lifestyle: "سبک زندگی قرآنی", concepts: "مفاهیم قرآن",
};
export const judgeOptions: Record<string, string> = {
  lahn: "صوت و لحن", waqf: "وقف و ابتدا", tajvid: "تجوید", hifz: "حفظ",
};
// معلم قرآن — ۸ رشته تدریس
export const teacherSubjectOptions: Record<string, string> = {
  rokhani: "روخوانی و روان‌خوانی", tajvid: "تجوید", hifz: "حفظ قرآن", mafahim: "مفاهیم و مفردات قرآن",
  ghesas: "قصه‌های قرآن", olum: "علوم قرآنی", qeraat: "قرائت", lahn: "صوت و لحن",
};
// مدرس قرآن — ۶ رشته تدریس
export const modarresFieldOptions: Record<string, string> = {
  tafsir: "تفسیر", olum: "علوم قرآنی", qeraat: "قرائت", hifz: "حفظ",
  lifestyle: "سبک زندگی قرآنی", methods: "مناهج و روش‌های تدریس قرآن",
};
// فعال قرآنی — نقش‌های اجرایی
export const activistRoleOptions: Record<string, string> = {
  institute_manager: "مدیر مؤسسه قرآنی", quran_house_manager: "مدیر خانه قرآن",
  home_session_manager: "مدیر جلسه خانگی قرآن", experiential_teacher: "معلم تجربی",
};
export const writingTypeLabels = { book: "کتاب", article: "مقاله" } as const;
export type WritingType = keyof typeof writingTypeLabels;
export type SpecialtyDetailKind = "juz" | "level" | "checklist" | "writings" | "none";
export const specialtyDetailSpec: Record<string, { kind: SpecialtyDetailKind; options?: Record<string, string>; hint?: string }> = {
  memorizer: { kind: "juz", hint: "میزان حفظ را انتخاب کنید." },
  reciter: { kind: "level", hint: "سطح قرائت (۴ تا ۷) را انتخاب کنید." },
  commentator: { kind: "checklist", options: commentatorOptions, hint: "حوزه‌های فعالیت خود را انتخاب کنید." },
  judge: { kind: "checklist", options: judgeOptions, hint: "رشته‌های داوری خود را انتخاب کنید." },
  trainer: { kind: "checklist", options: teacherSubjectOptions, hint: "رشته‌های تدریس خود را انتخاب کنید (حداکثر ۸)." },
  teacher: { kind: "checklist", options: modarresFieldOptions, hint: "رشته‌های تدریس خود را انتخاب کنید (حداکثر ۶)." },
  cultural_activist: { kind: "checklist", options: activistRoleOptions, hint: "نقش‌های اجرایی خود را انتخاب کنید." },
  author: { kind: "writings", hint: "کتاب یا مقاله‌های خود را با نام و موضوع ثبت کنید." },
  researcher: { kind: "none" }, other: { kind: "none" },
};
/** Human-readable one-line summary of a specialty detail, shared by the case
 *  detail page, the printable dossier and (later) the Excel export. */
export function formatSpecialtyDetail(code: string, detailValue: string | null, detailOptions: string[] | null): string | null {
  const spec = specialtyDetailSpec[code];
  if (!spec) return null;
  if (spec.kind === "juz" || spec.kind === "level") {
    const options = spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions;
    return detailValue && detailValue in options ? options[detailValue] : null;
  }
  if (spec.kind === "checklist" && spec.options) {
    const chosen = (detailOptions || []).map((key) => spec.options![key]).filter(Boolean);
    return chosen.length ? chosen.join("، ") : null;
  }
  return null;
}
export const documentTypeLabels = {
  national_card: "کارت ملی", birth_certificate_page: "صفحه شناسنامه", degree: "مدرک تحصیلی",
  activity_certificate: "گواهی فعالیت", course_certificate: "گواهی پایان دوره", recommendation: "معرفی‌نامه", other: "سایر",
} as const;
export type DocumentType = keyof typeof documentTypeLabels;
