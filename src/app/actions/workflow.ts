"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activists, appeals, applicationVersions, applications, auditLogs, correctionRequests, documentRequests, documents, expertReferrals, specialties, statusHistory, userSpecialties, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser, isManager } from "@/lib/data";
import { can } from "@/lib/permissions";
import { normalizeText } from "@/lib/format";
import { isUuid, managerInScope } from "@/lib/workflow-utils";
import { deliverOutbox, notifyUsers } from "@/lib/messaging";

const field = (data: FormData, key: string, max = 2000) => normalizeText(String(data.get(key) || "")).slice(0, max);
const finish: (id: string, message: string) => never = (id, message) => redirect(isUuid(id) ? `/cases/${id}?message=${encodeURIComponent(message)}` : `/cases?message=${encodeURIComponent(message)}`);
const refresh = (id: string) => { revalidatePath(`/cases/${id}`); revalidatePath("/cases"); revalidatePath("/dashboard"); revalidatePath("/notifications"); };

export async function referSpecialistAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const choice = field(data, "specialistChoice", 80).split(":"); const specialistId = field(data, "specialistId", 40) || choice[0]; const specialtyId = Number(field(data, "specialtyId", 10) || choice[1]); const note = field(data, "note");
  const row = await getCaseForUser(actor, id);
  const assignedReviewer = actor.effectiveRole === "reviewer" && row?.application.assignedExpertId === actor.id;
  if (!row || row.application.status !== "pending" || !(await can(actor, "cases.refer_specialist")) || (!isManager(actor) && !assignedReviewer)) finish(id, "ارجاع تخصصی برای شما مجاز نیست.");
  if (!isUuid(specialistId) || !Number.isSafeInteger(specialtyId) || specialtyId <= 0) finish(id, "کارشناس و حوزه تخصصی معتبر انتخاب کنید.");
  const [expert] = await db.select({ user: users }).from(users).innerJoin(userSpecialties, eq(userSpecialties.userId, users.id)).where(and(eq(users.id, specialistId), eq(users.role, "specialist"), eq(users.active, true), eq(userSpecialties.specialtyId, specialtyId))).limit(1);
  const [personSpecialty] = await db.select().from(activistSpecialties).where(and(eq(activistSpecialties.activistId, row.activist.id), eq(activistSpecialties.specialtyId, specialtyId))).limit(1);
  if (!expert || !personSpecialty || expert.user.provinceId !== row.activist.provinceId || !expert.user.provinceId || (expert.user.countyId && expert.user.countyId !== row.activist.countyId)) finish(id, "کارشناس باید در محدوده و حوزه تخصصی پرونده باشد.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "pending") throw new Error("changed");
      await tx.insert(expertReferrals).values({ applicationId: id, specialtyId, specialistId, requestedBy: actor.id, requestNote: note || null });
      await tx.update(applications).set({ status: "specialist_review", updatedAt: new Date() }).where(eq(applications.id, id));
      await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "pending", toStatus: "specialist_review", actorId: actor.id, note: "ارجاع برای بررسی تخصصی" });
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "refer_specialist", targetType: "application", targetId: id, detail: specialistId });
      await notifyUsers(tx, [specialistId, row.activist.userId], "ارجاع برای بررسی تخصصی", "یک پرونده برای بررسی تخصصی ارجاع شده است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ارجاع ثبت نشد؛ ممکن است وضعیت پرونده تغییر کرده باشد."); }
  refresh(id); finish(id, "ارجاع تخصصی با موفقیت ثبت شد.");
}

export async function specialistOpinionAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const referralId = field(data, "referralId", 40); const outcome = field(data, "outcome", 20); const opinion = field(data, "opinion");
  const row = await getCaseForUser(actor, id);
  if (!row || !(await can(actor, "cases.specialist_opinion")) || row.application.status !== "specialist_review" || !isUuid(referralId) || !["approved", "rejected"].includes(outcome) || opinion.length < 5) finish(id, "نظر تخصصی یا دسترسی معتبر نیست.");
  const [referral] = await db.select().from(expertReferrals).where(and(eq(expertReferrals.id, referralId), eq(expertReferrals.applicationId, id), eq(expertReferrals.specialistId, actor.id), eq(expertReferrals.status, "pending"))).limit(1);
  if (!referral) finish(id, "ارجاع فعال برای شما پیدا نشد.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "specialist_review") throw new Error("changed");
      const changed = await tx.update(expertReferrals).set({ status: outcome as "approved" | "rejected", opinion, resolvedAt: new Date() }).where(and(eq(expertReferrals.id, referralId), eq(expertReferrals.status, "pending"))).returning({ id: expertReferrals.id });
      if (!changed.length) throw new Error("changed");
      await tx.update(applications).set({ status: "pending", updatedAt: new Date() }).where(eq(applications.id, id));
      await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "specialist_review", toStatus: "pending", actorId: actor.id, note: outcome === "approved" ? "نظر تخصصی: تأیید تخصص" : "نظر تخصصی: عدم تأیید تخصص" });
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "specialist_opinion", targetType: "application", targetId: id, detail: outcome });
      await notifyUsers(tx, [referral.requestedBy, row.application.assignedExpertId, row.activist.userId], "نظر تخصصی ثبت شد", "بررسی تخصصی انجام شد و پرونده به کارتابل بررسی بازگشت.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ثبت نظر انجام نشد؛ وضعیت پرونده را دوباره بررسی کنید."); }
  refresh(id); redirect(`/cases?status=specialist_review&message=${encodeURIComponent("نظر تخصصی ثبت و پرونده برای بررسی بازگردانده شد.")}`);
}

export async function respondCorrectionAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const requestId = field(data, "requestId", 40); const response = field(data, "response");
  const row = await getCaseForUser(actor, id);
  const canRespond = row && (await can(actor, "cases.edit")) && (row.activist.userId === actor.id || row.application.createdBy === actor.id || isManager(actor));
  if (!row || !canRespond || row.application.status !== "needs_correction" || !isUuid(requestId) || response.length < 5) finish(id, "پاسخ اصلاح معتبر نیست یا دسترسی ندارید.");
  const [request] = await db.select().from(correctionRequests).where(and(eq(correctionRequests.id, requestId), eq(correctionRequests.applicationId, id), eq(correctionRequests.status, "open"))).limit(1);
  if (!request) finish(id, "درخواست اصلاح باز پیدا نشد.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "needs_correction") throw new Error("changed");
      const changed = await tx.update(correctionRequests).set({ status: "responded", response, respondedBy: actor.id, respondedAt: new Date() }).where(and(eq(correctionRequests.id, requestId), eq(correctionRequests.status, "open"))).returning({ id: correctionRequests.id });
      if (!changed.length) throw new Error("changed");
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "respond_correction", targetType: "application", targetId: id });
      await notifyUsers(tx, [request.requestedBy], "پاسخ اصلاح ثبت شد", "به درخواست اصلاح یک پرونده پاسخ داده شده است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ثبت پاسخ انجام نشد؛ وضعیت پرونده را بررسی کنید."); }
  refresh(id); finish(id, "پاسخ اصلاح ثبت شد؛ پس از تکمیل، پرونده را دوباره ارسال کنید.");
}

export async function requestRevisionAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const reason = field(data, "reason"); const row = await getCaseForUser(actor, id);
  if (!row || row.application.status !== "approved" || !(await can(actor, "cases.request_revision")) || !(row.activist.userId === actor.id || isManager(actor)) || reason.length < 5) finish(id, "درخواست بازنگری یا دلیل آن معتبر نیست.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ application: applications, person: activists }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).for("update");
      if (!locked || locked.application.status !== "approved") throw new Error("changed");
      const [next] = await tx.select({ value: sql<number>`coalesce(max(${applicationVersions.version}), 0) + 1` }).from(applicationVersions).where(eq(applicationVersions.applicationId, id));
      const [specs, details, writings, docs] = await Promise.all([tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, locked.person.id)), tx.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, locked.person.id)), tx.select({ workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, locked.person.id)), tx.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.applicationId, id))]);
      await tx.insert(applicationVersions).values({ applicationId: id, version: Number(next.value), snapshot: { profile: locked.person, specialties: specs, specialtyDetails: details, writings, documents: docs, status: "approved" }, reason, createdBy: actor.id });
      await tx.update(applications).set({ status: "needs_correction", updatedAt: new Date() }).where(eq(applications.id, id));
      await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "approved", toStatus: "needs_correction", actorId: actor.id, note: `درخواست بازنگری: ${reason}` });
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "request_revision", targetType: "application", targetId: id });
      await notifyUsers(tx, [row.activist.userId, row.application.createdBy], "بازنگری پرونده تأییدشده", "نسخه قبلی حفظ شد و پرونده برای اصلاح و بررسی مجدد آماده است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "درخواست بازنگری ثبت نشد؛ وضعیت پرونده را بررسی کنید."); }
  refresh(id); finish(id, "نسخه قبلی حفظ شد و پرونده برای اصلاح آماده است.");
}

export async function submitAppealAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const reason = field(data, "reason"); const row = await getCaseForUser(actor, id);
  if (!row || !(await can(actor, "cases.appeal_submit")) || row.activist.userId !== actor.id || row.application.status !== "rejected" || reason.length < 10) finish(id, "اعتراض تنها برای پرونده ردشده و با توضیح کافی مجاز است.");
  const [rejection] = await db.select({ actorId: statusHistory.actorId }).from(statusHistory).where(and(eq(statusHistory.applicationId, id), eq(statusHistory.toStatus, "rejected"))).orderBy(desc(statusHistory.createdAt)).limit(1);
  const managers = await db.select().from(users).where(and(inArray(users.role, ["super_admin", "province_admin", "county_admin"]), eq(users.active, true)));
  const eligible = managers.filter((candidate) => managerInScope(candidate, row.activist) && candidate.id !== rejection?.actorId && candidate.id !== row.application.createdBy);
  const assignee = eligible.find((candidate) => candidate.role === "county_admin") || eligible.find((candidate) => candidate.role === "province_admin") || eligible[0];
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "rejected") throw new Error("changed");
      const [open] = await tx.select({ id: appeals.id }).from(appeals).where(and(eq(appeals.applicationId, id), eq(appeals.status, "open"))).limit(1);
      if (open) throw new Error("duplicate");
      await tx.insert(appeals).values({ applicationId: id, submittedBy: actor.id, assignedTo: assignee?.id || null, reason });
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "submit_appeal", targetType: "application", targetId: id });
      const recipients = assignee ? [assignee.id] : managers.filter((manager) => manager.role === "super_admin").map((manager) => manager.id);
      await notifyUsers(tx, recipients, "اعتراض جدید", assignee ? "اعتراضی برای بررسی به شما ارجاع شده است." : "اعتراضی منتظر تعیین مسئول مستقل است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "اعتراض ثبت نشد؛ ممکن است اعتراض باز دیگری وجود داشته باشد."); }
  refresh(id); finish(id, assignee ? "اعتراض ثبت و به مسئول مستقل ارجاع شد." : "اعتراض ثبت شد و منتظر تعیین مسئول مستقل است.");
}

export async function assignAppealAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const appealId = field(data, "appealId", 40); const managerId = field(data, "managerId", 40); const row = await getCaseForUser(actor, id);
  if (!row || !(await can(actor, "cases.appeal_manage")) || row.application.status !== "rejected" || !isUuid(appealId) || !isUuid(managerId)) finish(id, "ارجاع اعتراض مجاز نیست.");
  const [target] = await db.select().from(users).where(eq(users.id, managerId)).limit(1);
  const [rejection] = await db.select({ actorId: statusHistory.actorId }).from(statusHistory).where(and(eq(statusHistory.applicationId, id), eq(statusHistory.toStatus, "rejected"))).orderBy(desc(statusHistory.createdAt)).limit(1);
  if (!target || !managerInScope(target, row.activist) || target.id === rejection?.actorId || target.id === row.application.createdBy) finish(id, "مسئول باید مستقل و در محدوده پرونده باشد.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "rejected") throw new Error("changed");
      const changed = await tx.update(appeals).set({ assignedTo: target.id }).where(and(eq(appeals.id, appealId), eq(appeals.applicationId, id), eq(appeals.status, "open"))).returning({ id: appeals.id });
      if (!changed.length) throw new Error("changed");
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "assign_appeal", targetType: "application", targetId: id, detail: target.id });
      await notifyUsers(tx, [target.id], "ارجاع اعتراض", "اعتراضی برای بررسی به شما ارجاع شده است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ارجاع اعتراض انجام نشد."); }
  refresh(id); finish(id, "اعتراض به مسئول مستقل ارجاع شد.");
}

export async function resolveAppealAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const appealId = field(data, "appealId", 40); const outcome = field(data, "outcome", 20); const resolution = field(data, "resolution"); const row = await getCaseForUser(actor, id);
  if (!row || !(await can(actor, "cases.appeal_manage")) || row.application.status !== "rejected" || !isUuid(appealId) || !["upheld", "reconsider"].includes(outcome) || resolution.length < 5) finish(id, "تصمیم اعتراض یا دسترسی معتبر نیست.");
  const [appeal] = await db.select().from(appeals).where(and(eq(appeals.id, appealId), eq(appeals.applicationId, id), eq(appeals.status, "open"), eq(appeals.assignedTo, actor.id))).limit(1);
  const [rejection] = await db.select({ actorId: statusHistory.actorId }).from(statusHistory).where(and(eq(statusHistory.applicationId, id), eq(statusHistory.toStatus, "rejected"))).orderBy(desc(statusHistory.createdAt)).limit(1);
  if (!appeal || actor.id === rejection?.actorId || actor.id === row.application.createdBy) finish(id, "بررسی اعتراض فقط توسط مسئول مستقل ارجاع‌شده مجاز است.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || locked.status !== "rejected") throw new Error("changed");
      const changed = await tx.update(appeals).set({ status: "resolved", outcome: outcome as "upheld" | "reconsider", resolution, resolvedBy: actor.id, resolvedAt: new Date() }).where(and(eq(appeals.id, appealId), eq(appeals.status, "open"), eq(appeals.assignedTo, actor.id))).returning({ id: appeals.id });
      if (!changed.length) throw new Error("changed");
      if (outcome === "reconsider") {
        await tx.update(applications).set({ status: "pending", updatedAt: new Date() }).where(eq(applications.id, id));
        await tx.insert(statusHistory).values({ applicationId: id, fromStatus: "rejected", toStatus: "pending", actorId: actor.id, note: "پذیرش اعتراض و بازگشت برای بررسی مجدد" });
      }
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "resolve_appeal", targetType: "application", targetId: id, detail: outcome });
      await notifyUsers(tx, [appeal.submittedBy], "نتیجه اعتراض ثبت شد", outcome === "reconsider" ? "اعتراض پذیرفته و پرونده برای بررسی مجدد بازگردانده شد." : "بررسی مجدد اعتراض انجام و نتیجه ثبت شد.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ثبت نتیجه اعتراض انجام نشد؛ وضعیت را بررسی کنید."); }
  refresh(id); finish(id, "نتیجه اعتراض ثبت شد.");
}

const PROFILE_FIELDS = ["firstName", "lastName", "fatherName", "nationalIdCipher", "nationalIdHash", "nationalIdLast4", "birthDate", "gender", "phone", "alternatePhone", "email", "provinceId", "countyId", "city", "address", "activityPlace", "organization", "activityHistory", "teachingHistory", "achievements", "notes"] as const;

export async function restoreVersionAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const versionId = field(data, "versionId", 40);
  const row = await getCaseForUser(actor, id);
  if (!row || !(await can(actor, "cases.restore_version")) || !["draft", "completing", "needs_correction"].includes(row.application.status) || !isUuid(versionId)) finish(id, "بازگردانی نسخه در این وضعیت مجاز نیست.");
  const [targetVersion] = await db.select().from(applicationVersions).where(and(eq(applicationVersions.id, versionId), eq(applicationVersions.applicationId, id))).limit(1);
  if (!targetVersion) finish(id, "نسخه موردنظر پیدا نشد.");
  const snapshot = targetVersion.snapshot as { profile?: Record<string, unknown>; specialties?: { id?: number }[]; specialtyDetails?: { specialtyId?: number; detailValue?: string | null; detailOptions?: string[] | null }[]; writings?: { workType?: string; title?: string; topic?: string | null }[] };
  const oldProfile = snapshot.profile;
  if (!oldProfile || typeof oldProfile !== "object") finish(id, "اطلاعات این نسخه قابل بازگردانی نیست.");
  const restoredFields: Record<string, unknown> = {};
  for (const key of PROFILE_FIELDS) if (key in oldProfile) restoredFields[key] = oldProfile[key];
  const oldSpecialtyIds = Array.isArray(snapshot.specialties) ? [...new Set(snapshot.specialties.map((item) => item?.id).filter((v): v is number => typeof v === "number"))] : [];
  // (مرحله چهارم) جزئیات تخصص‌ها و آثار مؤلفِ نسخه هدف هم بازگردانی می‌شوند؛
  // ردیف‌هایی که به تخصص حذف‌شده/نامعتبر اشاره کنند نادیده گرفته می‌شوند.
  const oldDetailRows = Array.isArray(snapshot.specialtyDetails) ? snapshot.specialtyDetails.filter((item): item is { specialtyId: number; detailValue: string | null; detailOptions: string[] | null } => typeof item?.specialtyId === "number").map((item) => ({ specialtyId: item.specialtyId, detailValue: item.detailValue ?? null, detailOptions: item.detailOptions ?? null })) : [];
  const oldWritingRows = Array.isArray(snapshot.writings) ? snapshot.writings.filter((item) => (item?.workType === "book" || item?.workType === "article") && typeof item?.title === "string" && item.title.length >= 2).map((item) => ({ workType: item.workType as "book" | "article", title: item.title as string, topic: typeof item.topic === "string" ? item.topic : null })) : [];
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ application: applications, activist: activists }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).for("update");
      if (!locked || locked.application.status !== row.application.status) throw new Error("changed");
      const validSpecialtyIds = oldSpecialtyIds.length ? (await tx.select({ id: specialties.id }).from(specialties).where(inArray(specialties.id, oldSpecialtyIds))).map((item) => item.id) : [];
      const [currentSpecialties, currentDetails, currentWritings, currentDocuments, next] = await Promise.all([
        tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, locked.activist.id)),
        tx.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, locked.activist.id)),
        tx.select({ workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, locked.activist.id)),
        tx.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.applicationId, id)),
        tx.select({ value: sql<number>`coalesce(max(${applicationVersions.version}), 0) + 1` }).from(applicationVersions).where(eq(applicationVersions.applicationId, id)),
      ]);
      await tx.insert(applicationVersions).values({ applicationId: id, version: Number(next[0].value), snapshot: { profile: locked.activist, specialties: currentSpecialties, specialtyDetails: currentDetails, writings: currentWritings, documents: currentDocuments, status: locked.application.status }, reason: `پشتیبان خودکار پیش از بازگردانی نسخه ${targetVersion.version}`, createdBy: actor.id });
      await tx.update(activists).set({ ...restoredFields, updatedAt: new Date() }).where(eq(activists.id, locked.activist.id));
      await tx.delete(activistSpecialties).where(eq(activistSpecialties.activistId, locked.activist.id));
      if (validSpecialtyIds.length) await tx.insert(activistSpecialties).values(validSpecialtyIds.map((specialtyId) => ({ activistId: locked.activist.id, specialtyId })));
      await tx.delete(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, locked.activist.id));
      const validDetailIds = new Set(validSpecialtyIds);
      const restoredDetails = oldDetailRows.filter((row) => validDetailIds.has(row.specialtyId));
      if (restoredDetails.length) await tx.insert(activistSpecialtyDetails).values(restoredDetails.map((row) => ({ activistId: locked.activist.id, specialtyId: row.specialtyId, detailValue: row.detailValue, detailOptions: row.detailOptions })));
      await tx.delete(activistWritings).where(eq(activistWritings.activistId, locked.activist.id));
      if (oldWritingRows.length) await tx.insert(activistWritings).values(oldWritingRows.map((row) => ({ ...row, activistId: locked.activist.id, createdBy: actor.id })));
      await tx.update(applications).set({ updatedAt: new Date() }).where(eq(applications.id, id));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "restore_version", targetType: "application", targetId: id, detail: String(targetVersion.version) });
    });
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "23505" || cause.cause?.code === "23505") finish(id, "بازگردانی ممکن نشد؛ کد ملی آن نسخه با پرونده دیگری در تعارض است.");
    finish(id, "بازگردانی نسخه انجام نشد؛ وضعیت پرونده را بررسی کنید.");
  }
  const faVersion = String(targetVersion.version).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  refresh(id); finish(id, `اطلاعات نسخه ${faVersion} بازگردانده شد؛ وضعیت پرونده تغییری نکرد و مدارک بارگذاری‌شده دست‌نخورده باقی ماندند.`);
}

export async function explainDocumentRequestAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "caseId", 40); const requestId = field(data, "requestId", 40); const explanation = field(data, "explanation");
  const row = await getCaseForUser(actor, id);
  const canRespond = row && (await can(actor, "cases.edit")) && (row.activist.userId === actor.id || row.application.createdBy === actor.id || isManager(actor));
  if (!row || !canRespond || !["draft", "completing", "needs_correction"].includes(row.application.status) || !isUuid(requestId) || explanation.length < 5) finish(id, "توضیح یا دسترسی معتبر نیست.");
  const [request] = await db.select().from(documentRequests).where(and(eq(documentRequests.id, requestId), eq(documentRequests.applicationId, id), eq(documentRequests.status, "open"))).limit(1);
  if (!request) finish(id, "درخواست مدرک باز پیدا نشد.");
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update");
      if (!locked || !["draft", "completing", "needs_correction"].includes(locked.status)) throw new Error("changed");
      const changed = await tx.update(documentRequests).set({ status: "explained", explanation, resolvedAt: new Date() }).where(and(eq(documentRequests.id, requestId), eq(documentRequests.status, "open"))).returning({ id: documentRequests.id });
      if (!changed.length) throw new Error("changed");
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "explain_document_request", targetType: "application", targetId: id });
      await notifyUsers(tx, [request.requestedBy], "توضیح برای مدرک درخواستی ثبت شد", "برای یکی از مدارک درخواستی توضیح ثبت شده است.", id);
    });
    void deliverOutbox();
  } catch { finish(id, "ثبت توضیح انجام نشد؛ وضعیت پرونده را بررسی کنید."); }
  refresh(id); finish(id, "توضیح برای مدرک درخواستی ثبت شد.");
}
