"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistOrganizations, activistWritings, activityRecords, activists, appeals, applicationVersions, applications, auditLogs, caseReminders, certificates, correctionRequests, documentRequests, documents, educationRecords, educationalCourses, expertNotes, expertReferrals, notifications, statusHistory, users, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { completeness, getCaseForUser, isManager, missingRequired } from "@/lib/data";
import { can } from "@/lib/permissions";
import { isUuid, managerInScope } from "@/lib/workflow-utils";
import { caseSubmittedSms, deliverOutbox, notifyUsers } from "@/lib/messaging";
import { normalizeText } from "@/lib/format";
import { documentTypeLabels, type DocumentType } from "@/lib/constants";
import { privateDir } from "@/lib/local-secrets";
import { field } from "@/lib/case-input";
// الحاقیهٔ ۲.۱۰.۰ — قفل مراحل ثبت: بارگذاری مدرک/تصویر و آماده‌سازی/ارسال
// پرونده فقط پس از تکمیل و ذخیرهٔ مراحل قبلی مجاز است؛ کنترل در سرور انجام
// می‌شود و به ظاهر فرم‌ها وابسته نیست.
import { CASE_STEPS, computeCaseSteps, firstIncompleteMessage, loadCaseStepFacts, stepGateError } from "@/lib/case-steps";
import type { ActionState } from "@/lib/action-state";

const messageRedirect: (id: string, message: string) => never = (id, message) => redirect(`/cases/${id}?m=${stashFlash(message)}`);

const EDITABLE_STATUSES = ["draft", "completing", "needs_correction"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];

async function advanceCase(data: FormData, target: "ready" | "pending") {
  const user = await requireUser(); const id = field(data, "caseId", 40); const row = await getCaseForUser(user, id);
  const allowed: readonly string[] = target === "ready" ? EDITABLE_STATUSES : ["ready"];
  if (!row || !allowed.includes(row.application.status)) messageRedirect(id, "این انتقال برای وضعیت فعلی مجاز نیست.");
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ application: applications, activist: activists }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).for("update");
    if (!locked || locked.application.status !== row.application.status) return "وضعیت پرونده تغییر کرده است؛ دوباره تلاش کنید.";
    const [specs, docs] = await Promise.all([
      tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, locked.activist.id)),
      tx.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, id), eq(documents.kind, "evidence"))),
    ]);
    const missing = missingRequired(locked.activist, specs.length, docs.length, Boolean(locked.activist.photoDocumentId));
    if (missing.length) return `برای ارسال تکمیل کنید: ${missing.join("، ")}`;
    // الحاقیهٔ ۲.۱۰.۰: زنجیرهٔ مراحل — حتی اگر داده‌ها کامل باشند، ترتیب مراحل
    // از روی همان موتور محاسبه می‌شود (مثلاً جزئیات ناقص تخصص‌ها را می‌گیرد).
    // گام «بازبینی و ارسال» خودِ همین کنش است و از گارد زنجیره مستثنا می‌شود
    // وگرنه آماده‌سازی هرگز روی گام خودش قفل می‌ماند.
    const facts = await loadCaseStepFacts(locked.activist, locked.application.status, id);
    const plan = computeCaseSteps(facts);
    const stepMessage = firstIncompleteMessage(plan, "review");
    if (stepMessage) return stepMessage;
    const [openCorrection] = await tx.select({ id: correctionRequests.id }).from(correctionRequests).where(and(eq(correctionRequests.applicationId, id), eq(correctionRequests.status, "open"))).limit(1);
    if (openCorrection) return "ابتدا پاسخ درخواست اصلاح را ثبت کنید.";
    const [openDocRequest] = await tx.select({ id: documentRequests.id }).from(documentRequests).where(and(eq(documentRequests.applicationId, id), eq(documentRequests.status, "open"))).limit(1);
    if (openDocRequest) return "ابتدا مدارک درخواستی را بارگذاری یا برای آن‌ها توضیح ثبت کنید.";
    await tx.update(applications).set({ status: target, ...(target === "pending" ? { submittedAt: new Date() } : {}), updatedAt: new Date() }).where(eq(applications.id, id));
    await tx.insert(statusHistory).values({ applicationId: id, fromStatus: locked.application.status, toStatus: target, actorId: user.id, note: target === "ready" ? "کنترل کامل بودن و آماده‌سازی ارسال" : "ارسال پرونده برای بررسی" });
    await tx.insert(auditLogs).values({ actorId: user.id, action: target === "ready" ? "prepare_submission" : "submit", targetType: "application", targetId: id });
    if (target === "pending") {
      const managers = await tx.select().from(users).where(and(inArray(users.role, ["super_admin", "province_admin", "county_admin"]), eq(users.active, true)));
      const recipients = [...managers.filter((manager) => managerInScope(manager, locked.activist)).map((manager) => manager.id), locked.application.assignedExpertId, locked.application.createdBy].filter((recipient) => recipient !== user.id);
      // مرحله هفتم: مدیران استان/شهرستان در محدوده به‌همراه اعلان درون‌برنامه‌ای
      // و ایمیل، با پیامک هم آگاه می‌شوند تا بررسی با تأخیر افت نکند.
      const activistName = [locked.activist.firstName, locked.activist.lastName].filter(Boolean).join(" ").trim();
      await notifyUsers(tx, recipients, "پرونده آماده بررسی", "یک پرونده برای بررسی ارسال شده است.", id, { sms: caseSubmittedSms(activistName || "فعال قرآنی") });
    }
    return null;
  });
  if (result) messageRedirect(id, result);
  void deliverOutbox();
  revalidatePath("/dashboard"); revalidatePath("/cases"); messageRedirect(id, target === "ready" ? "پرونده آماده ارسال است؛ برای بررسی آن را ارسال کنید." : "پرونده برای بررسی ارسال شد.");
}
export async function prepareCaseAction(data: FormData) { await advanceCase(data, "ready"); }
export async function submitCaseAction(data: FormData) { await advanceCase(data, "pending"); }

export async function returnToCompletingAction(data: FormData) {
  const user = await requireUser(); const id = field(data, "caseId", 40); const row = await getCaseForUser(user, id);
  if (!row || row.application.status !== "ready" || !(await can(user, "cases.submit"))) messageRedirect(id, "بازگشت به تکمیل مجاز نیست.");
  await db.transaction(async (tx) => {
    const changed = await tx.update(applications).set({ status: "completing", updatedAt: new Date() }).where(and(eq(applications.id, id), eq(applications.status, "ready"))).returning({ id: applications.id });
    if (!changed.length) throw new Error("Concurrent update");
    await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "ready", toStatus: "completing", actorId: user.id, note: "بازگشت به تکمیل اطلاعات" });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "return_to_completing", targetType: "application", targetId: id });
  });
  revalidatePath("/dashboard"); revalidatePath("/cases"); messageRedirect(id, "پرونده برای تکمیل دوباره باز شد.");
}

export async function decisionAction(data: FormData) {
  const user = await requireUser(); const id = field(data, "caseId", 40); const action = field(data, "decision", 30); const note = field(data, "note", 2000);
  const missingDocsRaw = String(data.get("missingDocuments") || "").slice(0, 2000);
  const missingDocs = [...new Set(missingDocsRaw.split(/\r?\n/).map((line) => normalizeText(line)).filter((line) => line.length >= 2))].slice(0, 10).map((line) => line.slice(0, 120));
  const row = await getCaseForUser(user, id);
  if (!row || row.application.status !== "pending") messageRedirect(id, "این عملیات برای وضعیت فعلی مجاز نیست.");
  const isAssignedReviewer = user.effectiveRole === "reviewer" && row.application.assignedExpertId === user.id;
  if (action === "correction") {
    if (!(await can(user, "cases.review")) || (!isManager(user) && !isAssignedReviewer)) messageRedirect(id, "اجازه اعلام نقص ندارید.");
    if (note.length < 5) messageRedirect(id, "دلیل و موارد نیازمند اصلاح را وارد کنید.");
  } else if (action === "approve" || action === "reject") {
    if (!(await can(user, "cases.decide")) || (!isManager(user) && !isAssignedReviewer) || row.application.createdBy === user.id) messageRedirect(id, "تصمیم نهایی فقط توسط تصمیم‌گیرنده مجازِ مستقل از ثبت‌کننده انجام می‌شود.");
    if (action === "reject" && note.length < 5) messageRedirect(id, "برای رد پرونده، ثبت دلیل الزامی است.");
    if (action === "approve") { const missing = await completeness(row.activist, id); if (missing.length) messageRedirect(id, `پرونده ناقص است: ${missing.join("، ")}`); }
  } else messageRedirect(id, "عملیات نامعتبر است.");
  const next = action === "correction" ? "needs_correction" : action === "approve" ? "approved" : "rejected";
  await db.transaction(async (tx) => {
    const changed = await tx.update(applications).set({ status: next, updatedAt: new Date() }).where(and(eq(applications.id, id), eq(applications.status, "pending"))).returning({ id: applications.id });
    if (!changed.length) throw new Error("Concurrent update");
    await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "pending", toStatus: next, actorId: user.id, note: note || (next === "approved" ? "تأیید نهایی پرونده" : null) });
    if (next === "needs_correction") {
      await tx.insert(correctionRequests).values({ applicationId: id, requestedBy: user.id, reason: note });
      if (missingDocs.length) {
        await tx.insert(documentRequests).values(missingDocs.map((title) => ({ applicationId: id, requestedBy: user.id, title })));
        await tx.insert(auditLogs).values({ actorId: user.id, action: "request_documents", targetType: "application", targetId: id, detail: missingDocs.join("، ") });
      }
    }
    await tx.insert(auditLogs).values({ actorId: user.id, action: next, targetType: "application", targetId: id });
    const title = next === "needs_correction" ? "درخواست اصلاح پرونده" : next === "approved" ? "پرونده تأیید شد" : "نتیجه بررسی پرونده";
    const body = next === "needs_correction" ? "موارد نیازمند اصلاح در پرونده ثبت شده است." : next === "approved" ? "پرونده شما تأیید شده است." : "نتیجه بررسی و دلیل آن در پرونده ثبت شده است.";
    await notifyUsers(tx, [row.activist.userId, row.application.createdBy].filter((recipient) => recipient !== user.id), title, body, id);
  });
  void deliverOutbox();
  revalidatePath("/dashboard"); revalidatePath("/cases"); messageRedirect(id, "نتیجه بررسی ثبت شد.");
}

export async function assignExpertAction(data: FormData) {
  const user = await requireUser(); const id = field(data, "caseId", 40); const expertId = field(data, "expertId", 40); const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.assign_expert")) || row.application.status !== "pending") messageRedirect(id, "ارجاع این پرونده مجاز نیست.");
  const [expert] = await db.select().from(users).where(and(eq(users.id, expertId), eq(users.role, "reviewer"), eq(users.active, true))).limit(1);
  if (!expert || !expert.provinceId || expert.provinceId !== row.activist.provinceId || (expert.countyId && expert.countyId !== row.activist.countyId)) messageRedirect(id, "کارشناس در محدوده این پرونده نیست.");
  await db.transaction(async (tx) => {
    const changed = await tx.update(applications).set({ assignedExpertId: expert.id, updatedAt: new Date() }).where(and(eq(applications.id, id), eq(applications.status, "pending"))).returning({ id: applications.id });
    if (!changed.length) throw new Error("Concurrent update");
    await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "pending", toStatus: "pending", actorId: user.id, note: `ارجاع پرونده به کارشناس ${expert.fullName}` });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "assign_expert", targetType: "application", targetId: id, detail: expert.id });
    await notifyUsers(tx, [expert.id], "پرونده به شما ارجاع شد", "یک پرونده برای بررسی در کارتابل شما قرار گرفته است.", id);
  });
  void deliverOutbox();
  revalidatePath("/cases"); messageRedirect(id, "پرونده به کارشناس ارجاع شد.");
}

export async function uploadDocumentAction(id: string, _state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser(); const row = await getCaseForUser(user, id);
  if (!row || !EDITABLE_STATUSES.includes(row.application.status as EditableStatus)) return { error: "بارگذاری در این وضعیت مجاز نیست." };
  // الحاقیهٔ ۲.۱۰.۰: قفل مراحل — مدرک تنها پس از تکمیل مراحل هویتی، مکانی و
  // تخصص‌ها قابل بارگذاری است؛ کنترل از روی دادهٔ واقعی سرور انجام می‌شود.
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const gate = stepGateError(computeCaseSteps(facts), 3, CASE_STEPS[3].title);
  if (gate) return { error: gate };
  const file = data.get("file"); const title = field(data, "title", 120);
  const requestedDocId = field(data, "documentRequestId", 40);
  const docTypeRaw = field(data, "docType", 40);
  const docType: DocumentType | null = docTypeRaw && Object.hasOwn(documentTypeLabels, docTypeRaw) ? (docTypeRaw as DocumentType) : null;
  const docNumber = field(data, "docNumber", 60);
  if (!(file instanceof File) || !file.size || !title) return { error: "عنوان و فایل مدرک را انتخاب کنید." };
  if (file.size > 5 * 1024 * 1024) return { error: "حجم فایل نباید بیش از ۵ مگابایت باشد." };
  let linkedRequest: { id: string; requestedBy: string } | null = null;
  if (requestedDocId) {
    const [match] = await db.select({ id: documentRequests.id, requestedBy: documentRequests.requestedBy }).from(documentRequests).where(and(eq(documentRequests.id, requestedDocId), eq(documentRequests.applicationId, id), eq(documentRequests.status, "open"))).limit(1);
    if (!match) return { error: "درخواست مدرک انتخاب‌شده معتبر نیست." };
    linkedRequest = match;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : null;
  if (!mime) return { error: "فقط فایل PDF، PNG یا JPEG معتبر مجاز است." };
  const storageKey = randomUUID(); const directory = path.join(privateDir, "uploads"); const target = path.join(directory, storageKey);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || !EDITABLE_STATUSES.includes(locked.status as EditableStatus)) throw new Error("Case status changed");
      const [newDoc] = await tx.insert(documents).values({ applicationId: id, storageKey, originalName: path.basename(file.name).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "document", title, docType, docNumber: docNumber || null, mimeType: mime, size: file.size, uploadedBy: user.id }).returning({ id: documents.id });
      await tx.insert(auditLogs).values({ actorId: user.id, action: "upload_document", targetType: "application", targetId: id });
      if (linkedRequest) {
        const fulfilled = await tx.update(documentRequests).set({ status: "fulfilled", fulfilledDocumentId: newDoc.id, resolvedAt: new Date() }).where(and(eq(documentRequests.id, linkedRequest.id), eq(documentRequests.status, "open"))).returning({ id: documentRequests.id });
        if (!fulfilled.length) throw new Error("Document request changed");
        await notifyUsers(tx, [linkedRequest.requestedBy], "مدرک درخواستی بارگذاری شد", "مدرک درخواستی برای یک پرونده بارگذاری شد.", id);
      }
    });
  } catch { await unlink(target).catch(() => undefined); return { error: "ذخیره مدرک انجام نشد یا وضعیت پرونده یا درخواست تغییر کرده است." }; }
  void deliverOutbox();
  revalidatePath(`/cases/${id}`); revalidatePath(`/cases/${id}/steps/4`);
  return { success: "مدرک با موفقیت بارگذاری شد." };
}

export async function uploadPhotoAction(id: string, _state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser(); const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.edit")) || !EDITABLE_STATUSES.includes(row.application.status as EditableStatus)) return { error: "بارگذاری تصویر در این وضعیت مجاز نیست." };
  // الحاقیهٔ ۲.۱۰.۰: قفل مراحل — تصویر پرسنلی هم مانند مدارک پس از تکمیل
  // مراحل قبلی قابل بارگذاری است.
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const gate = stepGateError(computeCaseSteps(facts), 3, CASE_STEPS[3].title);
  if (gate) return { error: gate };
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) return { error: "فایل تصویر پرسنلی را انتخاب کنید." };
  // الحاقیهٔ ۲.۹.۳: سقف تصویر پرسنلی ۵۰۰ کیلوبایت است (مدرک‌ها همان ۵ مگابایت را دارند).
  if (file.size > 500 * 1024) return { error: "حجم تصویر پرسنلی نباید بیش از ۵۰۰ کیلوبایت باشد؛ تصویر کوچک‌تری انتخاب کنید." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : null;
  if (!mime) return { error: "تصویر پرسنلی فقط می‌تواند فایل PNG یا JPEG معتبر باشد." };
  const storageKey = randomUUID(); const directory = path.join(privateDir, "uploads"); const target = path.join(directory, storageKey);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  let staleKey = null as string | null;
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || !EDITABLE_STATUSES.includes(locked.status as EditableStatus)) throw new Error("Case status changed");
      const [previous] = await tx.select({ photoDocumentId: activists.photoDocumentId }).from(activists).where(eq(activists.id, row.activist.id)).limit(1);
      const [newDoc] = await tx.insert(documents).values({ applicationId: id, storageKey, originalName: path.basename(file.name).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "photo", title: "تصویر پرسنلی", kind: "id_photo", mimeType: mime, size: file.size, uploadedBy: user.id }).returning({ id: documents.id });
      await tx.update(activists).set({ photoDocumentId: newDoc.id, updatedAt: new Date() }).where(eq(activists.id, row.activist.id));
      await tx.insert(auditLogs).values({ actorId: user.id, action: "upload_photo", targetType: "application", targetId: id });
      if (previous.photoDocumentId) {
        const [old] = await tx.select({ storageKey: documents.storageKey }).from(documents).where(and(eq(documents.id, previous.photoDocumentId), eq(documents.kind, "id_photo"))).limit(1);
        const [referenced] = await tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.documentId, previous.photoDocumentId)).limit(1);
        if (old && !referenced) { await tx.delete(documents).where(eq(documents.id, previous.photoDocumentId)); staleKey = old.storageKey; }
      }
    });
  } catch { await unlink(target).catch(() => undefined); return { error: "ذخیره تصویر انجام نشد یا وضعیت پرونده تغییر کرده است." }; }
  if (staleKey) await unlink(path.join(privateDir, "uploads", staleKey)).catch(() => undefined);
  revalidatePath(`/cases/${id}`); revalidatePath(`/cases/${id}/steps/4`);
  return { success: "تصویر پرسنلی با موفقیت بارگذاری شد." };
}

export async function removePhotoAction(data: FormData) {
  const user = await requireUser();
  const id = field(data, "caseId", 40);
  const row = await getCaseForUser(user, id);
  const editable = row && (await can(user, "cases.edit")) && EDITABLE_STATUSES.includes(row.application.status as EditableStatus);
  if (!editable) messageRedirect(id, "حذف تصویر در این وضعیت مجاز نیست.");
  let staleKey = null as string | null;
  await db.transaction(async (tx) => {
    const [previous] = await tx.select({ photoDocumentId: activists.photoDocumentId }).from(activists).where(eq(activists.id, row.activist.id)).limit(1);
    if (!previous.photoDocumentId) return;
    const [old] = await tx.select({ storageKey: documents.storageKey }).from(documents).where(and(eq(documents.id, previous.photoDocumentId), eq(documents.kind, "id_photo"))).limit(1);
    const [referenced] = await tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.documentId, previous.photoDocumentId)).limit(1);
    await tx.update(activists).set({ photoDocumentId: null, updatedAt: new Date() }).where(eq(activists.id, row.activist.id));
    if (old && !referenced) { await tx.delete(documents).where(eq(documents.id, previous.photoDocumentId)); staleKey = old.storageKey; }
    await tx.insert(auditLogs).values({ actorId: user.id, action: "remove_photo", targetType: "application", targetId: id });
  });
  if (staleKey) await unlink(path.join(privateDir, "uploads", staleKey)).catch(() => undefined);
  revalidatePath(`/cases/${id}`); revalidatePath(`/cases/${id}/steps/4`);
  messageRedirect(id, "تصویر پرسنلی حذف شد.");
}

// الحاقیهٔ ۲.۱۰.۴ — حذف دو‌سطحی پرونده در بانک پرونده‌ها (همان گارد حذف حساب:
// فقط مدیر کل). سطح «bank» پرونده را از فهرست فعال خارج و در بانک نگه می‌دارد
// (قابل بازیابی)؛ سطح «total» همهٔ داده‌های وابسته را با ترتیب امن کلیدهای
// خارجی پاک می‌کند و فایل‌های مدارک را هم از حافظهٔ محلی برمی‌دارد — فقط
// ردپای ممیزی در لاگ باقی می‌ماند. پیام نتیجه با توکن فلش می‌آید نه URL.
export async function deleteCaseAction(data: FormData) {
  const user = await requireUser(); const id = field(data, "caseId", 40); const mode = field(data, "mode", 10);
  const bank = (message: string) => redirect(`/cases?m=${stashFlash(message)}`);
  if (user.effectiveRole !== "super_admin") bank("حذف پرونده فقط توسط مدیر کل سامانه مجاز است.");
  if (!isUuid(id)) bank("پرونده معتبر نیست.");
  if (mode !== "bank" && mode !== "total") bank("حالت حذف معتبر نیست.");
  const [row] = await db.select({ id: applications.id, deletedAt: applications.deletedAt, firstName: activists.firstName, lastName: activists.lastName, activistId: applications.activistId })
    .from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).limit(1);
  if (!row) bank("پرونده پیدا نشد.");
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "بدون نام";
  if (mode === "total") {
    const keys = (await db.select({ key: documents.storageKey }).from(documents).where(eq(documents.applicationId, id))).map((item) => item.key);
    await db.transaction(async (tx) => {
      // وابسته‌های پرونده — قبل از خودِ پرونده تا قیود FK نقض نشوند
      await tx.delete(caseReminders).where(eq(caseReminders.applicationId, id));
      await tx.delete(statusHistory).where(eq(statusHistory.applicationId, id));
      await tx.delete(documentRequests).where(eq(documentRequests.applicationId, id));
      await tx.delete(correctionRequests).where(eq(correctionRequests.applicationId, id));
      await tx.delete(appeals).where(eq(appeals.applicationId, id));
      await tx.delete(expertReferrals).where(eq(expertReferrals.applicationId, id));
      await tx.delete(expertNotes).where(eq(expertNotes.applicationId, id));
      await tx.delete(applicationVersions).where(eq(applicationVersions.applicationId, id));
      await tx.delete(notifications).where(eq(notifications.applicationId, id));
      // وابسته‌های فعال؛ جدول‌های دارای ارجاع به مدرک (گواهینامه، تحصیل، سابقه شغلی)
      // باید قبل از حذف مدارک پاک شوند
      await tx.delete(certificates).where(eq(certificates.activistId, row.activistId));
      await tx.delete(educationRecords).where(eq(educationRecords.activistId, row.activistId));
      await tx.delete(workHistory).where(eq(workHistory.activistId, row.activistId));
      await tx.delete(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, row.activistId));
      await tx.delete(activistSpecialties).where(eq(activistSpecialties.activistId, row.activistId));
      await tx.delete(activistWritings).where(eq(activistWritings.activistId, row.activistId));
      await tx.delete(activistOrganizations).where(eq(activistOrganizations.activistId, row.activistId));
      await tx.delete(activityRecords).where(eq(activityRecords.activistId, row.activistId));
      await tx.delete(educationalCourses).where(eq(educationalCourses.activistId, row.activistId));
      // حل ارجاع دایره‌ای تصویر پرسنلی، سپس مدارک، پرونده و رکورد فعال
      await tx.update(activists).set({ photoDocumentId: null }).where(eq(activists.id, row.activistId));
      await tx.delete(documents).where(eq(documents.applicationId, id));
      await tx.delete(applications).where(eq(applications.id, id));
      await tx.delete(activists).where(eq(activists.id, row.activistId));
      await tx.insert(auditLogs).values({ actorId: user.id, action: "delete_case_total", targetType: "application", targetId: id, detail: name });
    });
    for (const key of keys) await unlink(path.join(privateDir, "uploads", key)).catch(() => undefined);
    revalidatePath("/dashboard"); revalidatePath("/cases");
    bank(`پرونده «${name}» و تمام داده‌های وابسته به‌طور کامل حذف شد؛ فقط ردپای ممیزی باقی مانده است.`);
  }
  if (row.deletedAt) bank("این پرونده پیش‌تر از فهرست فعال حذف شده است.");
  await db.update(applications).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(applications.id, id), isNull(applications.deletedAt)));
  await db.insert(auditLogs).values({ actorId: user.id, action: "delete_case_bank", targetType: "application", targetId: id, detail: name });
  revalidatePath("/dashboard"); revalidatePath("/cases");
  bank(`پرونده «${name}» از فهرست فعال حذف شد و در بانک باقی ماند؛ از فیلتر «حذف‌شده‌ها» قابل بازیابی است.`);
}

export async function restoreCaseAction(data: FormData) {
  const user = await requireUser(); const id = field(data, "caseId", 40);
  const bank = (message: string) => redirect(`/cases?m=${stashFlash(message)}`);
  if (user.effectiveRole !== "super_admin") bank("بازیابی پرونده فقط توسط مدیر کل سامانه مجاز است.");
  if (!isUuid(id)) bank("پرونده معتبر نیست.");
  const [row] = await db.select({ deletedAt: applications.deletedAt, firstName: activists.firstName, lastName: activists.lastName })
    .from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).limit(1);
  if (!row) bank("پرونده پیدا نشد.");
  if (!row.deletedAt) bank("این پرونده در فهرست فعال است و نیازی به بازیابی ندارد.");
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "بدون نام";
  await db.update(applications).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(applications.id, id), isNotNull(applications.deletedAt)));
  await db.insert(auditLogs).values({ actorId: user.id, action: "restore_case", targetType: "application", targetId: id, detail: name });
  revalidatePath("/dashboard"); revalidatePath("/cases");
  bank(`پرونده «${name}» بازیابی شد و به فهرست فعال بانک پرونده‌ها برگشت.`);
}
