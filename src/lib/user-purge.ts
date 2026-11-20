/** الحاقیهٔ ۲.۱۷.۰ — حذف یکپارچهٔ حساب کاربر و تمام داده‌های وابسته.
 *  همهٔ حذف‌ها درون همان تراکنشِ فراخوان انجام می‌شوند تا اگر هر مرحله خطا
 *  بخورد هیچ چیز ناقص پاک نشود؛ فایل‌های فیزیکی مدارک بعد از موفقیت تراکنش
 *  با unlink حذف می‌شوند (کلیدها بیرون تراکنش برگردانده می‌شوند).
 *
 *  دو مسیر خروجی:
 *  - «total»: هیچ ردیف NOT NULL/بدون cascade دیگری به کاربر ارجاع ندارد →
 *    ردیف خود کاربر هم کامل حذف می‌شود؛ کد ملی و شمارهٔ موبایل آزاد و
 *    ثبت‌نام مجدد بدون خطای تکراری ممکن است.
 *  - «anonymized»: کاربر در روند کاری پروندهٔ «دیگران» نقش داشته (کارشناس،
 *    ثبت‌کننده، نویسندهٔ یادداشت و…) و آن ردیف‌ها NOT NULL اند؛ حذفشان دادهٔ
 *    کاربران دیگر را می‌شکند، پس فقط دادهٔ متعلق به خود کاربر کامل پاک و ردیف
 *    حساب با حفظ زنجیرهٔ ممیزی گمنام می‌شود.
 */
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { privateDir } from "@/lib/local-secrets";
import { unlink } from "node:fs/promises";
import path from "node:path";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UserPurgeMode = "total" | "anonymized";

export type UserPurgeOutcome = {
  mode: UserPurgeMode;
  /** پرونده‌های کامل حذف‌شده */
  cases: number;
  /** کلیدهای فایل‌های فیزیکی که پس از تراکنش باید از دیسک پاک شوند */
  storageKeys: string[];
};

/** پاک‌سازی همهٔ داده‌های متعلق به کاربر + تعیین تکلیف ردیف حساب.
 *  فقط ردیف‌های متعلق به همین کاربر حذف می‌شوند؛ دادهٔ کاربران دیگر و
 *  داده‌های عمومی سامانه (استان، شهرستان، تخصص‌ها، سازمان‌ها و…) دست‌نخورده
 *  می‌مانند و زنجیرهٔ ممیزی فقط برای کاربر گمنام‌شده با set null حفظ می‌شود. */
export async function purgeUserAccount(tx: Tx, userId: string): Promise<UserPurgeOutcome> {
  // --- پرونده و رکورد فعالِ متعلق به کاربر ---
  const ownedActivists = await tx.select({ id: t.activists.id }).from(t.activists).where(eq(t.activists.userId, userId));
  const activistIds = ownedActivists.map((row) => row.id);
  const ownedApps = activistIds.length
    ? await tx.select({ id: t.applications.id }).from(t.applications).where(inArray(t.applications.activistId, activistIds))
    : [];
  const appIds = ownedApps.map((row) => row.id);
  // کلیدهای فایل فیزیکی: مدارک پرونده‌ها + تصویر پرسنلی و مدارک ویژهٔ پروفایل
  const keyRows: { key: string }[] = [];
  if (appIds.length) {
    keyRows.push(...(await tx.select({ key: t.documents.storageKey }).from(t.documents).where(inArray(t.documents.applicationId, appIds))));
  }
  if (activistIds.length) {
    const [profile] = await tx.select({
      photo: t.activists.photoDocumentId, university: t.activists.universityDocumentId,
      seminary: t.activists.seminaryDocumentId, memorization: t.activists.memorizationDocumentId,
    }).from(t.activists).where(eq(t.activists.userId, userId));
    const special = [profile?.photo, profile?.university, profile?.seminary, profile?.memorization].filter((v): v is string => Boolean(v));
    if (special.length) keyRows.push(...(await tx.select({ key: t.documents.storageKey }).from(t.documents).where(inArray(t.documents.id, special))));
  }
  for (const appId of appIds) {
    // وابسته‌های هر پرونده — پیش از خود پرونده تا قید FK نقض نشود
    await tx.delete(t.caseReminders).where(eq(t.caseReminders.applicationId, appId));
    await tx.delete(t.statusHistory).where(eq(t.statusHistory.applicationId, appId));
    await tx.delete(t.documentRequests).where(eq(t.documentRequests.applicationId, appId));
    await tx.delete(t.correctionRequests).where(eq(t.correctionRequests.applicationId, appId));
    await tx.delete(t.appeals).where(eq(t.appeals.applicationId, appId));
    await tx.delete(t.expertReferrals).where(eq(t.expertReferrals.applicationId, appId));
    await tx.delete(t.expertNotes).where(eq(t.expertNotes.applicationId, appId));
    await tx.delete(t.applicationVersions).where(eq(t.applicationVersions.applicationId, appId));
    await tx.delete(t.notifications).where(eq(t.notifications.applicationId, appId));
  }
  for (const activistId of activistIds) {
    // رکوردهای پروفایل فعال — جدول‌های دارای ارجاع به مدرک پیش از حذف مدارک
    await tx.delete(t.certificates).where(eq(t.certificates.activistId, activistId));
    await tx.delete(t.educationRecords).where(eq(t.educationRecords.activistId, activistId));
    await tx.delete(t.workHistory).where(eq(t.workHistory.activistId, activistId));
    await tx.delete(t.activistSpecialtyDetails).where(eq(t.activistSpecialtyDetails.activistId, activistId));
    await tx.delete(t.activistSpecialties).where(eq(t.activistSpecialties.activistId, activistId));
    await tx.delete(t.activistWritings).where(eq(t.activistWritings.activistId, activistId));
    await tx.delete(t.activistOrganizations).where(eq(t.activistOrganizations.activistId, activistId));
    await tx.delete(t.activityRecords).where(eq(t.activityRecords.activistId, activistId));
    await tx.delete(t.educationalCourses).where(eq(t.educationalCourses.activistId, activistId));
    // حل ارجاع دایره‌ای مدارک ویژهٔ پروفایل، سپس مدارک، پرونده و رکورد فعال
    await tx.update(t.activists).set({ photoDocumentId: null, universityDocumentId: null, seminaryDocumentId: null, memorizationDocumentId: null }).where(eq(t.activists.id, activistId));
    await tx.delete(t.eventParticipants).where(eq(t.eventParticipants.activistId, activistId));
  }
  if (appIds.length) await tx.delete(t.documents).where(inArray(t.documents.applicationId, appIds));
  if (activistIds.length) {
    // ترتیب مهم است: applications با FK NOT NULL به activists ارجاع دارد
    await tx.delete(t.applications).where(inArray(t.applications.id, appIds));
    await tx.delete(t.activists).where(inArray(t.activists.id, activistIds));
  }
  // --- حساب، نشست‌ها و داده‌های شخصی حساب ---
  for (const table of [t.sessions, t.mfaRecoveryCodes, t.pendingMfaSessions, t.passwordResetTokens, t.emailVerificationTokens,
    t.mobileResetCodes, t.mobileVerificationCodes, t.pendingMobileVerifications, t.userSpecialties, t.notifications]) {
    await tx.delete(table).where(eq(table.userId, userId));
  }
  // صندوق پیام‌های شخصی حساب (ایمیل/پیامک‌های ارسالی به خود او)
  await tx.delete(t.messageOutbox).where(eq(t.messageOutbox.userId, userId));
  // ردیف اطلاع‌رسانی پیامکی همگام‌شدهٔ این کاربر (رویدادهایش با cascade حذف می‌شود)
  await tx.delete(t.managerSmsRecipients).where(eq(t.managerSmsRecipients.sourceUserId, userId));
  // --- تعیین تکلیف ردیف حساب ---
  // ردیف‌های NOT NULL یا بدون cascade که کاربر را در دادهٔ «دیگران» ذکر
  // می‌کنند؛ اگر هریک موجود باشد حذف کامل ردیف حساب ممکن نیست. (ممیزیِ خود
  // کاربر جزو این‌ها نیست: در حذف کامل گمنام و حفظ می‌شود، نه حذف.)
  const [actorTrail, uploadedDocs, staffedApps, referrals, corrections, appealRows, notes, versions, requestedDocs, ownedProfileRows] = await Promise.all([
    tx.select({ id: t.statusHistory.id }).from(t.statusHistory).where(eq(t.statusHistory.actorId, userId)).limit(1),
    tx.select({ id: t.documents.id }).from(t.documents).where(eq(t.documents.uploadedBy, userId)).limit(1),
    tx.select({ id: t.applications.id }).from(t.applications).where(or(eq(t.applications.createdBy, userId), eq(t.applications.assignedExpertId, userId))).limit(1),
    tx.select({ id: t.expertReferrals.id }).from(t.expertReferrals).where(or(eq(t.expertReferrals.specialistId, userId), eq(t.expertReferrals.requestedBy, userId))).limit(1),
    tx.select({ id: t.correctionRequests.id }).from(t.correctionRequests).where(or(eq(t.correctionRequests.requestedBy, userId), eq(t.correctionRequests.respondedBy, userId))).limit(1),
    tx.select({ id: t.appeals.id }).from(t.appeals).where(or(eq(t.appeals.submittedBy, userId), eq(t.appeals.assignedTo, userId), eq(t.appeals.resolvedBy, userId))).limit(1),
    tx.select({ id: t.expertNotes.id }).from(t.expertNotes).where(eq(t.expertNotes.authorId, userId)).limit(1),
    tx.select({ id: t.applicationVersions.id }).from(t.applicationVersions).where(eq(t.applicationVersions.createdBy, userId)).limit(1),
    tx.select({ id: t.documentRequests.id }).from(t.documentRequests).where(eq(t.documentRequests.requestedBy, userId)).limit(1),
    tx.select({ id: t.activistWritings.id }).from(t.activistWritings).where(eq(t.activistWritings.createdBy, userId)).limit(1),
  ]);
  const [orgLinks, activityRows, courseRows, certRows, eduRows, jobRows, markedDeletes, madeRoles, templateEdits, smsEdits, apiEdits] = await Promise.all([
    tx.select({ id: t.activistOrganizations.id }).from(t.activistOrganizations).where(eq(t.activistOrganizations.createdBy, userId)).limit(1),
    tx.select({ id: t.activityRecords.id }).from(t.activityRecords).where(eq(t.activityRecords.createdBy, userId)).limit(1),
    tx.select({ id: t.educationalCourses.id }).from(t.educationalCourses).where(eq(t.educationalCourses.createdBy, userId)).limit(1),
    tx.select({ id: t.certificates.id }).from(t.certificates).where(eq(t.certificates.createdBy, userId)).limit(1),
    tx.select({ id: t.educationRecords.id }).from(t.educationRecords).where(eq(t.educationRecords.createdBy, userId)).limit(1),
    tx.select({ id: t.workHistory.id }).from(t.workHistory).where(eq(t.workHistory.createdBy, userId)).limit(1),
    // نشانهٔ «چه کسی پروندهٔ دیگری را از فهرست فعال حذف کرده»
    tx.select({ id: t.activists.id }).from(t.activists).where(eq(t.activists.deletedBy, userId)).limit(1),
    // نقش‌های سفارشی ساختهٔ کاربر (زیرساخت مشترک سامانه‌اند و حفظ می‌شوند)
    tx.select({ id: t.customRoles.id }).from(t.customRoles).where(eq(t.customRoles.createdBy, userId)).limit(1),
    tx.select({ key: t.smsTemplates.key }).from(t.smsTemplates).where(eq(t.smsTemplates.updatedBy, userId)).limit(1),
    tx.select({ id: t.smsSettings.id }).from(t.smsSettings).where(eq(t.smsSettings.updatedBy, userId)).limit(1),
    tx.select({ id: t.apiSettings.id }).from(t.apiSettings).where(eq(t.apiSettings.updatedBy, userId)).limit(1),
  ]);
  const blockedByTrail = [actorTrail, uploadedDocs, staffedApps, referrals, corrections, appealRows, notes, versions, requestedDocs,
    ownedProfileRows, orgLinks, activityRows, courseRows, certRows, eduRows, jobRows, markedDeletes, madeRoles, templateEdits, smsEdits, apiEdits].some((rows) => rows.length > 0);
  const mode: UserPurgeMode = blockedByTrail ? "anonymized" : "total";
  if (!blockedByTrail) {
    // ممیزیِ خود کاربر حفظ می‌شود ولی ارتباطش با حسابِ در حال حذف گمنام می‌شود
    await tx.update(t.auditLogs).set({ actorId: null }).where(eq(t.auditLogs.actorId, userId));
    await tx.delete(t.users).where(eq(t.users.id, userId));
  }
  return { mode, cases: appIds.length, storageKeys: keyRows.map((row) => row.key) };
}

/** حذف فایل‌های فیزیکی مدارک پس از موفقیت تراکنش؛ خطای هر فایل پاک‌سازی را
 *  نمی‌شکند (دیتابیس ملاک است و فایل باقی‌مانده فقط زبالهٔ بی‌اثر است). */
export async function removeUserFiles(storageKeys: string[]): Promise<void> {
  for (const key of storageKeys) await unlink(path.join(privateDir, "uploads", key)).catch(() => undefined);
}
