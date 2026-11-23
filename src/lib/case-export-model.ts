// الحاقیهٔ ۲.۲۷.۰ — مدل یگانهٔ خروجی اکسل پرونده‌ها
// -----------------------------------------------------------
// هدف: خروجی اکسل دقیقاً بازتاب‌دهندهٔ فرم ثبت پرونده باشد؛ ستون‌ها با همان
// ترتیب و عنوان فارسیِ فرم (هویتی ← تحصیلات ← سکونت و فعالیت ← تخصص‌ها ←
// فیلدهای سفارشی مراحل ← وضعیت) چیده می‌شوند و برچسب هر فیلد ثابت از
// overrideهای مدیریت مراحل (الحاقیهٔ ۲.۲۶.۰) حل می‌شود تا اگر مدیر عنوان
// فیلدی را ویرایش کرده باشد، خروجی هم همان عنوان را نشان دهد.
//
// هیچ فیلدی از قلم نمی‌افتد: فیلد مخفی‌شدهٔ فرم هم با دادهٔ ثبت‌شدهٔ قبلی
// در خروجی می‌آید (مخفی‌سازی فقط فیلد را از فرم تازه برمی‌دارد، نه داده را)
// و پاسخ‌های فیلدهای سفارشی هر مرحلهٔ فعال — پایه یا سفارشی — با برچسب
// فارسی گزینه‌ها (کلیدهای opt_ هرگز خام نمایش داده نمی‌شوند) درج می‌شود.
//
// این ماژول مشترک هر دو خروجی است: شیت «اطلاعات کامل» فهرست پرونده‌ها
// (/api/cases/export) و خروجی تک‌پرونده (/api/cases/[id]/export).

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { formAnswers, formDefinitions, users } from "@/db/schema";
import { loadActiveCaseSteps } from "@/lib/case-steps";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import { resolvedCaseField, type CaseFieldMetaMap } from "@/lib/case-field-catalog";
import { isFieldVisible, type FormAnswers, type FormConfig, type FormField } from "@/lib/form-config";
import { isoToJalali } from "@/lib/format";
import {
  activityRecordKindLabels, cooperationTypeOptions, courseFieldOptions,
  formatSpecialtyDetail, memorizationCertTypeOptions, sourceLabels, statusLabels,
} from "@/lib/constants";
import type { ExportCaseRow, ExportDetails } from "@/lib/case-search";

/** گارد تزریق فرمول (CSV Injection) — هم‌منظور با مسیر فهرست. */
export const exportClean = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
/** سلول خروجی: مقدار خالی با خط تیره نمایش داده می‌شود. */
export const exportValue = (input: string | number | null | undefined) =>
  input === null || input === undefined || input === "" ? "—" : exportClean(String(input));
/** تاریخ شمسی با رقم فارسی برای سلول‌ها. */
export function exportJalali(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const text = typeof iso === "string" ? iso : iso.toISOString();
  return isoToJalali(text).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

/* ---------------- فرم‌های سفارشی مراحل فعال ---------------- */

/** یک مرحلهٔ فعال دارای فرم منتشرشده، با ترتیب فعال مراحل. فیلدهای modal
 *  هرگز مقدار ذخیره‌شده ندارند (normalizeAnswer ← null) و مثل نمایش
 *  فقط‌خواندنی جزئیات، از خروجی حذف می‌شوند. */
export type StepForm = { stepKey: string; stepTitle: string; definitionId: number; fields: FormField[] };

export async function loadPublishedStepForms(): Promise<StepForm[]> {
  try {
    const steps = await loadActiveCaseSteps();
    const defIds = steps.filter((step) => step.definitionId > 0).map((step) => step.definitionId);
    if (!defIds.length) return [];
    const defs = await db.select({ id: formDefinitions.id, entityId: formDefinitions.entityId, publishedConfig: formDefinitions.publishedConfig })
      .from(formDefinitions)
      .where(and(eq(formDefinitions.entityType, "case_step"), inArray(formDefinitions.entityId, defIds), eq(formDefinitions.status, "published")));
    const byEntity = new Map(defs.filter((def) => def.publishedConfig).map((def) => [def.entityId, def]));
    const forms: StepForm[] = [];
    for (const step of steps) {
      const def = byEntity.get(step.definitionId);
      const config = def?.publishedConfig as FormConfig | undefined;
      const fields = (config?.fields || []).filter((field) => field.type !== "modal");
      if (fields.length) forms.push({ stepKey: step.key, stepTitle: step.title, definitionId: def!.id, fields });
    }
    return forms;
  } catch {
    return [];
  }
}

/** پاسخ‌های فرم سفارشی یک پرونده به تفکیک تعریف مرحله. */
export type CaseStepAnswers = Map<number, FormAnswers>;

export async function loadStepAnswers(applicationIds: string[], forms: StepForm[]): Promise<Map<string, CaseStepAnswers>> {
  const result = new Map<string, CaseStepAnswers>();
  if (!applicationIds.length || !forms.length) return result;
  const rows = await db.select({ applicationId: formAnswers.applicationId, definitionId: formAnswers.definitionId, answers: formAnswers.answers })
    .from(formAnswers)
    .where(and(inArray(formAnswers.applicationId, applicationIds), inArray(formAnswers.definitionId, forms.map((form) => form.definitionId))));
  for (const row of rows) {
    const perCase = result.get(row.applicationId) ?? new Map<number, FormAnswers>();
    perCase.set(row.definitionId, (row.answers || {}) as FormAnswers);
    result.set(row.applicationId, perCase);
  }
  return result;
}

/** متن فارسی یک پاسخ فرم پویا — هم‌منظور با DynamicAnswersView: کلیدهای
 *  گزینه‌ها به برچسب فارسی حل می‌شوند و فایل با نام مدرک پیوست نشان داده
 *  می‌شود. پاسخ خالی → رشتهٔ خالی. */
export function formAnswerText(field: FormField, value: FormAnswers[string] | undefined, docTitleById?: Map<string, string>): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "file") {
    if (typeof value !== "string") return "مدرک پیوست‌شده";
    const title = docTitleById?.get(value);
    return title ? `مدرک پیوست‌شده: ${title}` : "مدرک پیوست‌شده";
  }
  const labels = new Map((field.options || []).map((option) => [option.key, option.label]));
  const picked = Array.isArray(value) ? value : [String(value)];
  return picked.map((key) => labels.get(String(key)) || String(key)).join("، ");
}

/* ---------------- ستون‌های ثابت (ترتیب فرم ثبت پرونده) ---------------- */

/** زمینهٔ حل مقدار یک سطر — یک‌بار به‌ازای هر پرونده ساخته می‌شود. */
export type RowContext = {
  row: ExportCaseRow;
  details: ExportDetails;
  idCell: string;
  expertName: string | null;
  universityRecord: ExportDetails["education"][number] | null;
  seminaryRecord: ExportDetails["education"][number] | null;
  specialtyLines: string[];
  teachLine: string;
  memorizeLine: string;
  documentCount: number;
};

/** تعریف یک ستون ثابت؛ کلیدهای کاتالوگ برچسب override-آگاه می‌گیرند و
 *  ستون‌های تجمیعی عنوان ثابت دارند. ستون‌های ابهام‌زدوده (استان/شهرستان
 *  سکونت) عنوان گویا دارند مگر مدیر برچسب فرم را ویرایش کرده باشد. */
type FixedColumn = { key: string; title: string; width: number; catalog?: boolean; catalogIfOverridden?: boolean; resolve: (ctx: RowContext) => string | number };

function genderFa(gender: string | null | undefined): string {
  return gender === "female" ? "زن" : gender === "male" ? "مرد" : "—";
}

/** جزئیات قالب‌بندی‌شدهٔ هر تخصص: «عنوان: جزئیات» یا «عنوان». */
function specialtyLine(item: ExportDetails["specialtyDetails"][number]): string {
  const detail = formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts);
  return detail ? `${item.title}: ${detail}` : item.title;
}

/** متن کامل یک رکورد سابقه/اثر/دوره/گواهی برای ستون‌های تجمیعی. */
const joinRecords = (parts: Array<string | number | null | undefined>) => parts.filter(Boolean).join(" — ");

/** تاریخ کامل شمسی با ساعت (تاریخ ثبت) — هم‌منظور با faDate با زمان. */
function faExportDateTime(value: Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value));
}

/** ستون‌های ثابت به ترتیب فرم ثبت پرونده (هویتی ← تحصیلات ← سکونت و فعالیت ← تخصص‌ها ← مدارک ← وضعیت). */
const FIXED_COLUMNS: FixedColumn[] = [
  { key: "row", title: "ردیف", width: 7, resolve: () => 0 }, // شماره ردیف در buildFullInfoSheet جای‌گذاری می‌شود
  { key: "identity.firstName", title: "نام", width: 15, catalog: true, resolve: ({ row }) => exportClean(row.firstName) },
  { key: "identity.lastName", title: "نام خانوادگی", width: 17, catalog: true, resolve: ({ row }) => exportClean(row.lastName) },
  { key: "identity.fatherName", title: "نام پدر", width: 15, catalog: true, resolve: ({ row }) => exportValue(row.fatherName) },
  { key: "identity.nationalId", title: "کد ملی", width: 15, catalog: true, resolve: ({ idCell }) => idCell },
  { key: "identity.idCardNumber", title: "شماره شناسنامه", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.idCardNumber) },
  { key: "identity.idIssuePlace", title: "محل صدور شناسنامه", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.idIssuePlace) },
  { key: "identity.birthDate", title: "تاریخ تولد شمسی", width: 15, catalog: true, resolve: ({ row }) => exportJalali(row.birthDate) },
  { key: "identity.gender", title: "جنسیت", width: 9, catalog: true, resolve: ({ row }) => genderFa(row.gender) },
  { key: "identity.phone", title: "شماره همراه", width: 15, catalog: true, resolve: ({ row }) => exportValue(row.phone) },
  { key: "identity.alternatePhone", title: "شماره همراه جایگزین", width: 17, catalog: true, resolve: ({ row }) => exportValue(row.alternatePhone) },
  { key: "identity.contactEmail", title: "ایمیل تماس", width: 20, catalog: true, resolve: ({ row }) => exportValue(row.email) },
  { key: "identity.source", title: "منبع ثبت اطلاعات", width: 15, catalog: true, resolve: ({ row }) => sourceLabels[row.source] },
  { key: "identity.universityLevel", title: "مقطع تحصیلی", width: 14, catalog: true, resolve: ({ row, universityRecord }) => exportValue(universityRecord?.level || row.universityLevel) },
  { key: "identity.universityField", title: "رشته تحصیلی", width: 16, catalog: true, resolve: ({ universityRecord }) => exportValue(universityRecord?.field) },
  { key: "identity.universityType", title: "نوع دانشگاه", width: 16, catalog: true, resolve: ({ universityRecord }) => exportValue(universityRecord?.universityType) },
  { key: "identity.universityCenterName", title: "نام دانشگاه", width: 18, catalog: true, resolve: ({ universityRecord }) => exportValue(universityRecord?.centerName) },
  { key: "identity.seminaryLevel", title: "سطح تحصیلات حوزوی", width: 15, catalog: true, resolve: ({ row, seminaryRecord }) => exportValue(seminaryRecord?.level || row.seminaryLevel) },
  { key: "location.provinceId", title: "استان سکونت", width: 14, catalogIfOverridden: true, resolve: ({ row }) => exportValue(row.province) },
  { key: "location.countyId", title: "شهرستان سکونت", width: 14, catalogIfOverridden: true, resolve: ({ row }) => exportValue(row.county) },
  { key: "location.city", title: "شهر / محل سکونت", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.city) },
  { key: "location.postalCode", title: "کد پستی", width: 13, catalog: true, resolve: ({ row }) => exportValue(row.postalCode) },
  { key: "location.address", title: "نشانی", width: 26, catalog: true, resolve: ({ row }) => exportValue(row.address) },
  { key: "location.activityProvinceId", title: "استان فعالیت", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.activityProvince) },
  { key: "location.activityCountyId", title: "شهرستان فعالیت", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.activityCounty) },
  { key: "location.activityPlace", title: "محل فعالیت قرآنی", width: 18, catalog: true, resolve: ({ row }) => exportValue(row.activityPlace) },
  { key: "location.organization", title: "مؤسسه قرآنی محل فعالیت", width: 18, catalog: true, resolve: ({ row }) => exportValue(row.organization) },
  { key: "specialties.grid", title: "تخصص‌های قرآنی", width: 24, resolve: ({ row }) => exportValue(row.specialty) },
  { key: "specialties.details", title: "جزئیات تخصص‌ها", width: 34, catalog: true, resolve: ({ specialtyLines }) => exportValue(specialtyLines.join(" | ")) },
  { key: "specialties.teach", title: "رشته‌های معلمی و مدرسی", width: 26, resolve: ({ teachLine }) => exportValue(teachLine) },
  { key: "specialties.memorize", title: "میزان حفظ", width: 18, resolve: ({ memorizeLine }) => exportValue(memorizeLine) },
  { key: "specialties.certType", title: "نوع مدرک حفظ", width: 18, resolve: ({ row }) => exportValue(row.memorizationCertType && row.memorizationCertType in memorizationCertTypeOptions ? memorizationCertTypeOptions[row.memorizationCertType] : null) },
  { key: "specialties.job", title: "شغل", width: 14, catalog: true, resolve: ({ row }) => exportValue(row.job) },
  { key: "specialties.notes", title: "توضیحات تکمیلی", width: 26, catalog: true, resolve: ({ row }) => exportValue(row.notes) },
  { key: "specialties.writings", title: "آثار (کتاب / مقاله)", width: 28, resolve: ({ details, row }) => exportValue(details.writings.filter((item) => item.activistId === row.activistId).map((item) => `${item.workType === "book" ? "کتاب" : "مقاله"}: ${item.title}${item.topic ? ` (${item.topic})` : ""}`).join(" | ")) },
  { key: "specialties.workHistory", title: "سوابق شغلی", width: 28, resolve: ({ details, row }) => exportValue(details.work.filter((item) => item.activistId === row.activistId).map((item) => joinRecords([item.title, item.employer, item.cooperationType && item.cooperationType in cooperationTypeOptions ? cooperationTypeOptions[item.cooperationType] : null, item.position, item.startDate ? `${exportJalali(item.startDate)} تا ${item.endDate ? exportJalali(item.endDate) : "اکنون"}` : null])).join(" | ")) },
  { key: "specialties.courses", title: "دوره‌های گذرانده‌شده", width: 28, resolve: ({ details, row }) => exportValue(details.courses.filter((item) => item.activistId === row.activistId).map((item) => joinRecords([item.title, item.provider, item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field] : null, item.completedDate ? exportJalali(item.completedDate) : null, item.hours ? `${item.hours} ساعت` : null])).join(" | ")) },
  { key: "specialties.activities", title: "فعالیت‌های قرآنی", width: 28, resolve: ({ details, row }) => exportValue(details.activities.filter((item) => item.activistId === row.activistId).map((item) => joinRecords([activityRecordKindLabels[item.kind], item.title, item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field] : null, item.organization, item.position])).join(" | ")) },
  { key: "specialties.certificates", title: "گواهینامه‌ها", width: 26, resolve: ({ details, row }) => exportValue(details.certificates.filter((item) => item.activistId === row.activistId).map((item) => joinRecords([item.title, item.issuer, item.issuedDate ? exportJalali(item.issuedDate) : null])).join(" | ")) },
  { key: "documents.count", title: "تعداد مدارک بارگذاری‌شده", width: 14, resolve: ({ documentCount }) => documentCount },
  { key: "app.status", title: "وضعیت پرونده", width: 15, resolve: ({ row }) => statusLabels[row.status] },
  { key: "app.createdAt", title: "تاریخ ثبت", width: 18, resolve: ({ row }) => faExportDateTime(row.createdAt) },
  { key: "app.submittedAt", title: "تاریخ ارسال برای بررسی", width: 18, resolve: ({ row }) => row.submittedAt ? exportJalali(row.submittedAt) : "—" },
  { key: "app.expert", title: "کارشناس مسئول", width: 18, resolve: ({ expertName }) => exportValue(expertName) },
];

/** برچسب نهایی ستون: فیلدهای کاتالوگ از override مدیر (۲.۲۶.۰)، ستون‌های
 *  ابهام‌زدوده فقط وقتی مدیر برچسب را ویرایش کرده باشد، بقیه ثابت. */
function columnTitle(column: FixedColumn, meta: CaseFieldMetaMap): string {
  if (column.catalog) return resolvedCaseField(meta, column.key).label;
  if (column.catalogIfOverridden && resolvedCaseField(meta, column.key).overridden) return resolvedCaseField(meta, column.key).label;
  return column.title;
}

/* ---------------- شیت «اطلاعات کامل» فهرست پرونده‌ها ---------------- */

export type FullInfoSheet = { header: string[]; widths: number[]; rows: Array<Array<string | number>> };

/** ساخت شیت اطلاعات کامل: همهٔ فیلدهای فرم به ترتیب فرم + ستون‌های پویای
 *  فیلدهای سفارشی مراحل فعال. برچسب فیلدهای ثابت از override مدیریت مراحل
 *  می‌آید (الحاقیهٔ ۲.۲۶.۰) و کد ملی برای مدیران کامل رمزگشایی می‌شود. */
export async function buildFullInfoSheet(rows: ExportCaseRow[], details: ExportDetails, fullNationalIds: Map<string, string>): Promise<FullInfoSheet> {
  const [meta, stepForms] = await Promise.all([loadCaseFieldMeta(), loadPublishedStepForms()]);
  const answersByApp = await loadStepAnswers(rows.map((row) => row.id), stepForms);
  // نام کارشناس مسئول هر پرونده (الحاقیهٔ ۲.۲۷.۰ — ستون کارشناس مسئول)
  const expertIds = [...new Set(rows.map((row) => row.assignedExpertId).filter((id): id is string => Boolean(id)))];
  const expertRows = expertIds.length ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, expertIds)) : [];
  const expertById = new Map(expertRows.map((row) => [row.id, row.fullName]));
  // نام مدرک پیوست فیلدهای فایل — شناسهٔ مدرک سراسری یکتاست
  const docTitleById = new Map(details.documents.map((item) => [item.id, `${item.title} (${item.originalName})`]));

  const columns: Array<{ title: string; width: number; key: string; resolve: (ctx: RowContext) => string | number }> =
    FIXED_COLUMNS.map((column) => ({ key: column.key, title: columnTitle(column, meta), width: column.width, resolve: column.resolve }));
  for (const form of stepForms) {
    for (const field of form.fields) {
      columns.push({
        key: `step:${form.definitionId}:${field.key}`,
        title: `${form.stepTitle} – ${field.label}`,
        width: field.type === "textarea" ? 30 : 20,
        resolve: ({ row }) => {
          const answers = answersByApp.get(row.id)?.get(form.definitionId);
          const visible = answers ? isFieldVisible(field, answers) : true;
          return exportValue(visible ? formAnswerText(field, answers?.[field.key], docTitleById) : "");
        },
      });
    }
  }

  const sheetRows = rows.map((row, index) => {
    const specRows = details.specialtyDetails.filter((item) => item.activistId === row.activistId);
    const ctx: RowContext = {
      row, details,
      idCell: fullNationalIds.get(row.id) ?? (row.nationalIdLast4 ? `••••••${row.nationalIdLast4}` : "—"),
      expertName: row.assignedExpertId ? expertById.get(row.assignedExpertId) ?? null : null,
      universityRecord: details.education.find((item) => item.activistId === row.activistId && item.type === "university") || null,
      seminaryRecord: details.education.find((item) => item.activistId === row.activistId && item.type === "seminary") || null,
      specialtyLines: specRows.map(specialtyLine),
      teachLine: specRows.filter((item) => item.code === "teacher" || item.code === "trainer").map(specialtyLine).join(" | "),
      memorizeLine: specRows.find((item) => item.code === "memorizer") ? specialtyLine(specRows.find((item) => item.code === "memorizer")!) : "",
      documentCount: details.documents.filter((item) => item.applicationId === row.id).length,
    };
    return columns.map((column) => column.key === "row" ? index + 1 : column.resolve(ctx));
  });

  return { header: columns.map((column) => column.title), widths: columns.map((column) => column.width), rows: sheetRows };
}
