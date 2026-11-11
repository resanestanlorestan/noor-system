// Shared label maps and option lists for the whole app. Persian-only labels.

export type AppStatus =
  | "draft"
  | "pending"
  | "needs_correction"
  | "approved"
  | "rejected"
  | "specialist_review"
  | "initial"
  | "completing"
  | "ready";

export const statusLabels: Record<AppStatus, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار بررسی",
  needs_correction: "نیازمند اصلاح",
  approved: "تأیید شده",
  rejected: "رد شده",
  specialist_review: "بررسی تخصصی",
  initial: "آغاز شده",
  completing: "در حال تکمیل",
  ready: "آماده ارسال",
};

export const statusColors: Record<AppStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  needs_correction: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  specialist_review: "bg-indigo-100 text-indigo-800",
  initial: "bg-slate-100 text-slate-600",
  completing: "bg-sky-100 text-sky-800",
  ready: "bg-violet-100 text-violet-800",
};

export type DocumentType =
  | "national_card"
  | "id_booklet"
  | "education_cert"
  | "seminary_cert"
  | "work_record"
  | "recommendation"
  | "other";

export const documentTypeLabels: Record<DocumentType, string> = {
  national_card: "کارت ملی",
  id_booklet: "شناسنامه",
  education_cert: "مدرک تحصیلی",
  seminary_cert: "گواهی حوزوی",
  work_record: "سابقه کاری",
  recommendation: "معرفی‌نامه",
  other: "سایر",
};

export type EducationType = "seminary" | "university";

export const educationTypeLabels: Record<EducationType, string> = {
  seminary: "حوزوی",
  university: "دانشگاهی",
};

export const educationLevelOptions: Record<EducationType, readonly string[]> = {
  seminary: ["مقدماتی", "سطح یک", "سطح دو", "سطح سه", "سطح چهار", "خارج", "درس خارج"],
  university: ["دیپلم", "کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری"],
};

export const genderLabels: Record<string, string> = {
  female: "زن",
  male: "مرد",
};

export const activityKindLabels: Record<string, string> = {
  activity: "فعالیت",
  teaching: "تدریس",
  judging: "داوری",
  competition: "مسابقه",
  research: "پژوهش",
};

export const writingTypeLabels: Record<string, string> = {
  book: "کتاب",
  article: "مقاله",
};

export const roleLabels: Record<string, string> = {
  super_admin: "مدیر کل سیستم",
  province_admin: "مدیر استان",
  county_admin: "کارشناس شهرستان",
  reviewer: "کارشناس بررسی",
  specialist: "کارشناس تخصصی",
  activist: "فعال قرآنی",
};

export const requiredDocumentTypes: readonly DocumentType[] = ["national_card"];

/** Required-field checklist used by the submit gate and the completeness bar. */
export function requiredIdentityFields(missing: string[], activist: {
  firstName: string | null; lastName: string | null; fatherName: string | null;
  nationalIdHash: string | null; birthDate: string | null; gender: string | null;
  phone: string | null; alternatePhone: string | null; idCardNumber: string | null;
  idIssuePlace: string | null; provinceId: number | null;
}) {
  if (!activist.firstName) missing.push("نام");
  if (!activist.lastName) missing.push("نام خانوادگی");
  if (!activist.fatherName) missing.push("نام پدر");
  if (!activist.nationalIdHash) missing.push("کد ملی");
  if (!activist.birthDate) missing.push("تاریخ تولد");
  if (!activist.gender) missing.push("جنسیت");
  if (!activist.phone) missing.push("شماره همراه");
  if (!activist.alternatePhone) missing.push("شماره همراه جایگزین");
  if (!activist.idCardNumber) missing.push("شماره شناسنامه");
  if (!activist.idIssuePlace) missing.push("محل صدور شناسنامه");
  if (!activist.provinceId) missing.push("استان");
}
