"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { activistOrganizations, activistWritings, activityRecords, auditLogs, certificates, documents, educationalCourses, educationRecords, organizations, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { can } from "@/lib/permissions";
import { attachEntityDocument, detachEntityDocument, isDocumentLinkTarget } from "@/lib/entity-documents";
import { jalaliToIso, normalizeText } from "@/lib/format";
import { activityRecordKindLabels, educationLevelOptions, educationTypeLabels, writingTypeLabels, type ActivityRecordKind, type EducationType, type WritingType } from "@/lib/constants";
import { CASE_STEPS, computeCaseSteps, loadCaseStepFacts, stepGateError } from "@/lib/case-steps";
import { isUuid } from "@/lib/workflow-utils";

const field = (data: FormData, key: string, max = 2000) => normalizeText(String(data.get(key) || "")).slice(0, max);
const finish: (id: string, message: string) => never = (id, message) => redirect(`/cases/${id}?m=${stashFlash(message)}`);
const EDITABLE = ["draft", "completing", "needs_correction"] as const;

async function authorizedEditableCase(id: string) {
  const user = await requireUser();
  const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.edit")) || !EDITABLE.includes(row.application.status as (typeof EDITABLE)[number])) return null;
  // الحاقیهٔ ۲.۱۰.۰: قفل مراحل — ثبت/ویرایش سوابق، تحصیلات، آثار و دوره‌ها فقط
  // پس از تکمیل مراحل هویتی و مکانی (ورود به مرحلهٔ تخصص‌ها) مجاز است.
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const gate = stepGateError(computeCaseSteps(facts), 2, CASE_STEPS[2].title);
  if (gate) return null;
  return { user, row };
}

// (مرحله ششم) اعتبارسنجی مدرکِ انتخابی برای اتصال به موجودیت‌ها: مدرک باید
// متعلق به همین پرونده باشد. خروجی شناسهٔ مدرک یا null (بدون اتصال) است.
async function resolveCaseDocument(caseId: string, rawDocumentId: string): Promise<string | null> {
  if (!rawDocumentId) return null;
  if (!isUuid(rawDocumentId)) return null;
  const [doc] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, rawDocumentId), eq(documents.applicationId, caseId))).limit(1);
  return doc?.id ?? null;
}

export async function addActivityRecordAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت سابقه در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const kind = field(data, "kind", 20);
  const title = field(data, "title", 180);
  const organization = field(data, "organization", 180);
  const position = field(data, "position", 120);
  const description = field(data, "description", 2000);
  const startRaw = field(data, "startDate", 20);
  const endRaw = field(data, "endDate", 20);
  if (!Object.hasOwn(activityRecordKindLabels, kind)) finish(id, "نوع سابقه معتبر نیست.");
  if (title.length < 2) finish(id, "عنوان سابقه را به‌درستی وارد کنید.");
  const startDate = startRaw ? jalaliToIso(startRaw) : null;
  const endDate = endRaw ? jalaliToIso(endRaw) : null;
  if ((startRaw && !startDate) || (endRaw && !endDate)) finish(id, "تاریخ‌ها را به شکل شمسی معتبر وارد کنید.");
  if (startDate && endDate && startDate > endDate) finish(id, "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
  await db.insert(activityRecords).values({ activistId: row.activist.id, kind: kind as ActivityRecordKind, title, organization: organization || null, position: position || null, description: description || null, startDate, endDate, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_activity_record", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "سابقه فعالیت ثبت شد.");
}

export async function deleteActivityRecordAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف سابقه در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(activityRecords).where(and(eq(activityRecords.id, recordId), eq(activityRecords.activistId, row.activist.id))).returning({ id: activityRecords.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_activity_record", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "سابقه حذف شد." : "سابقه موردنظر پیدا نشد.");
}

// (مرحله سوم) Educational background: seminary/university records are added
// and removed from the case detail page; the profile form only appends rows.
export async function addEducationRecordAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت سابقه تحصیلی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const type = field(data, "type", 20);
  const level = field(data, "level", 60);
  const studyField = field(data, "field", 120);
  const centerName = field(data, "centerName", 180);
  const certificate = field(data, "certificate", 180);
  if (!(type in educationTypeLabels)) finish(id, "نوع تحصیل معتبر نیست؛ حوزوی یا دانشگاهی را انتخاب کنید.");
  if (!level) finish(id, "مقطع تحصیلی را انتخاب کنید.");
  if (!(educationLevelOptions[type as EducationType] as readonly string[]).includes(level)) finish(id, "مقطع انتخاب‌شده با نوع تحصیل سازگار نیست.");
  const documentId = field(data, "documentId", 40);
  if (documentId && !isUuid(documentId)) finish(id, "مدرک انتخاب‌شده معتبر نیست.");
  const linkedDocumentId = await resolveCaseDocument(id, documentId);
  if (documentId && !linkedDocumentId) finish(id, "مدرک انتخاب‌شده متعلق به این پرونده نیست.");
  await db.insert(educationRecords).values({ activistId: row.activist.id, type: type as EducationType, level, field: studyField || null, centerName: centerName || null, certificate: certificate || null, documentId: linkedDocumentId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_education_record", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "سابقه تحصیلی ثبت شد.");
}

export async function deleteEducationRecordAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف سابقه تحصیلی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(educationRecords).where(and(eq(educationRecords.id, recordId), eq(educationRecords.activistId, row.activist.id))).returning({ id: educationRecords.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_education_record", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "سابقه تحصیلی حذف شد." : "سابقه تحصیلی موردنظر پیدا نشد.");
}

// (مرحله پنجم) Work history: past job positions, independent from Quranic
// activity records; added/removed from the case detail page.
export async function addWorkHistoryAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت سابقه شغلی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const title = field(data, "title", 180);
  const employer = field(data, "employer", 180);
  const position = field(data, "position", 120);
  const description = field(data, "description", 2000);
  const startRaw = field(data, "startDate", 20);
  const endRaw = field(data, "endDate", 20);
  if (title.length < 2) finish(id, "عنوان سابقه شغلی را به‌درستی وارد کنید.");
  const startDate = startRaw ? jalaliToIso(startRaw) : null;
  const endDate = endRaw ? jalaliToIso(endRaw) : null;
  if ((startRaw && !startDate) || (endRaw && !endDate)) finish(id, "تاریخ‌ها را به شکل شمسی معتبر وارد کنید.");
  if (startDate && endDate && startDate > endDate) finish(id, "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
  const documentId = field(data, "documentId", 40);
  if (documentId && !isUuid(documentId)) finish(id, "مدرک انتخاب‌شده معتبر نیست.");
  const linkedDocumentId = await resolveCaseDocument(id, documentId);
  if (documentId && !linkedDocumentId) finish(id, "مدرک انتخاب‌شده متعلق به این پرونده نیست.");
  await db.insert(workHistory).values({ activistId: row.activist.id, title, employer: employer || null, position: position || null, description: description || null, startDate, endDate, documentId: linkedDocumentId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_work_history", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "سابقه شغلی ثبت شد.");
}

export async function deleteWorkHistoryAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف سابقه شغلی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(workHistory).where(and(eq(workHistory.id, recordId), eq(workHistory.activistId, row.activist.id))).returning({ id: workHistory.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_work_history", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "سابقه شغلی حذف شد." : "سابقه شغلی موردنظر پیدا نشد.");
}

export async function addEducationalCourseAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت دوره در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const title = field(data, "title", 180);
  const provider = field(data, "provider", 180);
  const completedRaw = field(data, "completedDate", 20);
  const hoursRaw = field(data, "hours", 10);
  const certificateId = field(data, "certificateId", 40);
  if (title.length < 2) finish(id, "عنوان دوره را به‌درستی وارد کنید.");
  const completedDate = completedRaw ? jalaliToIso(completedRaw) : null;
  if (completedRaw && !completedDate) finish(id, "تاریخ گذراندن دوره را به شکل شمسی معتبر وارد کنید.");
  const hours = hoursRaw && /^\d{1,4}$/.test(hoursRaw) ? Number(hoursRaw) : null;
  if (hoursRaw && hours === null) finish(id, "ساعت دوره باید عددی معتبر باشد.");
  let linkedCertificateId: string | null = null;
  if (certificateId) {
    if (!isUuid(certificateId)) finish(id, "گواهینامه انتخاب‌شده معتبر نیست.");
    const [certificate] = await db.select({ id: certificates.id }).from(certificates).where(and(eq(certificates.id, certificateId), eq(certificates.activistId, row.activist.id))).limit(1);
    if (!certificate) finish(id, "گواهینامه انتخاب‌شده متعلق به این پرونده نیست.");
    linkedCertificateId = certificate.id;
  }
  await db.insert(educationalCourses).values({ activistId: row.activist.id, title, provider: provider || null, completedDate, hours, certificateId: linkedCertificateId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_educational_course", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "دوره آموزشی ثبت شد.");
}

export async function deleteEducationalCourseAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف دوره در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(educationalCourses).where(and(eq(educationalCourses.id, recordId), eq(educationalCourses.activistId, row.activist.id))).returning({ id: educationalCourses.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_educational_course", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "دوره حذف شد." : "دوره موردنظر پیدا نشد.");
}

export async function addCertificateAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت گواهینامه در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const title = field(data, "title", 180);
  const issuer = field(data, "issuer", 180);
  const issuedRaw = field(data, "issuedDate", 20);
  const documentId = field(data, "documentId", 40);
  if (title.length < 2) finish(id, "عنوان گواهینامه یا افتخار را به‌درستی وارد کنید.");
  const issuedDate = issuedRaw ? jalaliToIso(issuedRaw) : null;
  if (issuedRaw && !issuedDate) finish(id, "تاریخ صدور را به شکل شمسی معتبر وارد کنید.");
  if (documentId && !isUuid(documentId)) finish(id, "مدرک انتخاب‌شده معتبر نیست.");
  const linkedDocumentId = await resolveCaseDocument(id, documentId);
  if (documentId && !linkedDocumentId) finish(id, "مدرک انتخاب‌شده متعلق به این پرونده نیست.");
  await db.insert(certificates).values({ activistId: row.activist.id, title, issuer: issuer || null, issuedDate, documentId: linkedDocumentId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_certificate", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "گواهینامه یا افتخار ثبت شد.");
}

export async function deleteCertificateAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(certificates).where(and(eq(certificates.id, recordId), eq(certificates.activistId, row.activist.id))).returning({ id: certificates.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_certificate", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "مورد حذف شد." : "مورد موردنظر پیدا نشد.");
}

// (مرحله چهارم) Author works (آثار مؤلف): multiple book/article entries with
// topic; added/removed from the case detail page, matching the education-rows
// pattern. The profile form also appends new rows via the save action.
export async function addWritingAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت اثر در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const workType = field(data, "workType", 12);
  const title = field(data, "title", 180);
  const topic = field(data, "topic", 180);
  if (!(workType in writingTypeLabels)) finish(id, "نوع اثر معتبر نیست؛ کتاب یا مقاله را انتخاب کنید.");
  if (title.length < 2) finish(id, "نام کتاب یا مقاله را به‌درستی وارد کنید.");
  await db.insert(activistWritings).values({ activistId: row.activist.id, workType: workType as WritingType, title, topic: topic || null, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_writing", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, "اثر ثبت شد.");
}

export async function deleteWritingAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف اثر در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(activistWritings).where(and(eq(activistWritings.id, recordId), eq(activistWritings.activistId, row.activist.id))).returning({ id: activistWritings.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "delete_writing", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "اثر حذف شد." : "اثر موردنظر پیدا نشد.");
}

export async function linkOrganizationAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const context = await authorizedEditableCase(id);
  if (!context) finish(id, "ثبت همکاری سازمانی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const organizationId = Number(field(data, "organizationId", 10));
  const role = field(data, "role", 120);
  const startRaw = field(data, "startDate", 20); const endRaw = field(data, "endDate", 20);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) finish(id, "سازمان معتبر انتخاب کنید.");
  const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization) finish(id, "سازمان انتخاب‌شده معتبر نیست.");
  const startDate = startRaw ? jalaliToIso(startRaw) : null;
  const endDate = endRaw ? jalaliToIso(endRaw) : null;
  if ((startRaw && !startDate) || (endRaw && !endDate)) finish(id, "تاریخ‌ها را به شکل شمسی معتبر وارد کنید.");
  if (startDate && endDate && startDate > endDate) finish(id, "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
  try {
    await db.insert(activistOrganizations).values({ activistId: row.activist.id, organizationId, role: role || null, startDate, endDate, createdBy: user.id });
    await db.insert(auditLogs).values({ actorId: user.id, action: "link_organization", targetType: "application", targetId: id });
  } catch { finish(id, "این سازمان قبلاً برای این پرونده ثبت شده است."); }
  revalidatePath(`/cases/${id}`); finish(id, "همکاری سازمانی ثبت شد.");
}

export async function unlinkOrganizationAction(data: FormData) {
  const id = field(data, "caseId", 40); const recordId = field(data, "recordId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "حذف همکاری سازمانی در این وضعیت مجاز نیست.");
  const { user, row } = context;
  const deleted = await db.delete(activistOrganizations).where(and(eq(activistOrganizations.id, recordId), eq(activistOrganizations.activistId, row.activist.id))).returning({ id: activistOrganizations.id });
  if (deleted.length) await db.insert(auditLogs).values({ actorId: user.id, action: "unlink_organization", targetType: "application", targetId: id });
  revalidatePath(`/cases/${id}`); finish(id, deleted.length ? "همکاری سازمانی حذف شد." : "مورد موردنظر پیدا نشد.");
}

// (مرحله ششم) اتصال یک مدرک بارگذاری‌شده به موجودیت‌های پرونده (سابقه تحصیلی،
// سابقه شغلی یا گواهینامه) — پیوند چندشکلی؛ هر مدرک می‌تواند هم‌زمان به چند
// موجودیت متصل باشد. مدرک باید متعلق به همین پرونده و رکورد متعلق به همان
// فعال باشد؛ هر اتصال در رویدادهای حساس ثبت می‌شود.
export async function attachRecordDocumentAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const recordId = field(data, "recordId", 40);
  const targetType = field(data, "targetType", 40);
  const documentId = field(data, "documentId", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId) || !isUuid(documentId)) finish(id, "اتصال مدرک در این وضعیت مجاز نیست.");
  const { user, row } = context;
  if (!isDocumentLinkTarget(targetType)) finish(id, "نوع موجودیت برای اتصال مدرک معتبر نیست.");
  const linkedDocumentId = await resolveCaseDocument(id, documentId);
  if (!linkedDocumentId) finish(id, "مدرک انتخاب‌شده متعلق به این پرونده نیست.");
  const updated = await attachEntityDocument(targetType, recordId, row.activist.id, linkedDocumentId);
  if (updated) await db.insert(auditLogs).values({ actorId: user.id, action: "link_document", targetType: "application", targetId: id, detail: `${targetType} ← document` });
  revalidatePath(`/cases/${id}`); finish(id, updated ? "مدرک به مورد انتخاب‌شده متصل شد." : "مورد موردنظر پیدا نشد.");
}

// (مرحله ششم) جداکردن مدرک از یک موجودیت؛ ستون document_id خالی می‌شود و خود
// مدرک در بخش مدارک باقی می‌ماند.
export async function detachRecordDocumentAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const recordId = field(data, "recordId", 40);
  const targetType = field(data, "targetType", 40);
  const context = await authorizedEditableCase(id);
  if (!context || !isUuid(recordId)) finish(id, "جداکردن مدرک در این وضعیت مجاز نیست.");
  const { user, row } = context;
  if (!isDocumentLinkTarget(targetType)) finish(id, "نوع موجودیت برای جداکردن مدرک معتبر نیست.");
  const updated = await detachEntityDocument(targetType, recordId, row.activist.id);
  if (updated) await db.insert(auditLogs).values({ actorId: user.id, action: "unlink_document", targetType: "application", targetId: id, detail: `${targetType} ⤫ document` });
  revalidatePath(`/cases/${id}`); finish(id, updated ? "مدرک از مورد انتخاب‌شده جدا شد." : "مورد موردنظر پیدا نشد.");
}
