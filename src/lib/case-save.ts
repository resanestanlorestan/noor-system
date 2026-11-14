// Core of the previous single-shot "save whole draft" action, preserved after
// الحاقیهٔ ۲.۱۰.۰ moved the user-facing flow to the step wizard
// (src/app/actions/case-steps.ts). Deliberately a plain library module — NOT a
// "use server" file — so there is no callable Server-Action endpoint that could
// bypass the step chain; the feature tests drive it directly.
//
// Behavior (validation, duplicate warnings, transactions, version snapshots,
// redirects) is byte-for-byte the same as the former saveCaseAction.

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activists, applicationVersions, applications, auditLogs, counties, documents, educationRecords, provinces, specialties, statusHistory, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser, isManager, scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import { jalaliToIso, normalizeDigits, normalizeText, validIdCardNumber, validNationalId, validPostalCode } from "@/lib/format";
import { statusLabels, specialtyDetailSpec, type AppStatus } from "@/lib/constants";
import { protectNationalId } from "@/lib/local-secrets";
import { field, parseEducationInput, parseSpecialtyDetailsInput, parseWritingsInput, parseWorkHistoryInput, numeric } from "@/lib/case-input";
import type { ActionState, DuplicateHint } from "@/lib/action-state";

export async function saveCaseCore(data: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await can(user, "cases.create"))) return { error: "دسترسی ثبت پرونده ندارید." };
  const caseId = field(data, "caseId", 40);
  const existing = caseId ? await getCaseForUser(user, caseId) : null;
  if (caseId && !existing) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (existing && !["draft", "completing", "needs_correction"].includes(existing.application.status)) return { error: "این پرونده در وضعیت قابل ویرایش نیست." };
  const changeReason = field(data, "changeReason", 2000);
  if (existing && user.effectiveRole !== "activist" && changeReason.length < 5) return { error: "برای ویرایش سازمانی، دلیل اصلاح را با حداقل ۵ نویسه وارد کنید." };
  if (!existing && user.effectiveRole === "activist") {
    const [own] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.userId, user.id), isNull(applications.deletedAt))).limit(1);
    if (own) return { error: "برای حساب شما پرونده‌ای وجود دارد؛ آن را از فهرست پرونده‌ها باز کنید." };
  }
  const firstName = field(data, "firstName", 80), lastName = field(data, "lastName", 100);
  const nationalId = normalizeDigits(field(data, "nationalId", 20)).replace(/\s/g, "");
  if (nationalId && !validNationalId(nationalId)) return { error: "کد ملی معتبر نیست؛ ده رقم و رقم کنترل را بررسی کنید." };
  const birth = field(data, "birthDate", 20); const birthDate = birth ? jalaliToIso(birth) : null;
  if (birth && !birthDate) return { error: "تاریخ تولد شمسی معتبر نیست؛ مانند ۱۳۷۵/۰۱/۰۱ وارد کنید." };
  const gender = field(data, "gender", 20);
  if (gender && !["female", "male"].includes(gender)) return { error: "جنسیت انتخاب‌شده معتبر نیست." };
  const phone = normalizeDigits(field(data, "phone", 20)).replace(/\s/g, "");
  const alternatePhone = normalizeDigits(field(data, "alternatePhone", 20)).replace(/\s/g, "");
  if ((phone && !/^09\d{9}$/.test(phone)) || (alternatePhone && !/^09\d{9}$/.test(alternatePhone))) return { error: "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود." };
  const email = field(data, "contactEmail", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "ایمیل تماس معتبر نیست." };
  const idCard = normalizeDigits(field(data, "idCardNumber", 20)).replace(/\s/g, "");
  if (idCard && !validIdCardNumber(idCard)) return { error: "شماره شناسنامه باید فقط شامل رقم و حداکثر ۱۰ رقم باشد." };
  const idIssue = field(data, "idIssuePlace", 80);
  const fatherName = field(data, "fatherName", 80);
  const job = field(data, "job", 120);
  // (مرحله سوم) همه فیلدهای بخش هویتی به‌جز ایمیل اجباری هستند؛ فهرست موارد
  // خالی در یک پیام برگردانده می‌شود تا کاربر همه را یک‌جا اصلاح کند.
  const identityMissing: string[] = [];
  if (firstName.length < 2) identityMissing.push("نام");
  if (lastName.length < 2) identityMissing.push("نام خانوادگی");
  if (!fatherName) identityMissing.push("نام پدر");
  if (!nationalId) identityMissing.push("کد ملی");
  if (!idCard) identityMissing.push("شماره شناسنامه");
  if (!idIssue) identityMissing.push("محل صدور شناسنامه");
  if (!birth) identityMissing.push("تاریخ تولد شمسی");
  if (!gender) identityMissing.push("جنسیت");
  if (!phone) identityMissing.push("شماره همراه");
  if (!alternatePhone) identityMissing.push("شماره همراه جایگزین");
  if (identityMissing.length) return { error: `فیلدهای اجباری بخش هویتی را تکمیل کنید: ${identityMissing.join("، ")}` };
  const postalCode = normalizeDigits(field(data, "postalCode", 10)).replace(/\s/g, "");
  if (postalCode && !validPostalCode(postalCode)) return { error: "کد پستی باید ۱۰ رقم باشد." };
  const sourceInput = field(data, "source", 12);
  const defaultSource = user.effectiveRole === "activist" ? "self" : isManager(user) ? "manager" : "expert";
  const source = (sourceInput || defaultSource) as "self" | "manager" | "expert" | "paper";
  const allowedSources: string[] = user.effectiveRole === "activist" ? ["self"] : isManager(user) ? ["manager", "expert", "paper"] : ["expert", "paper"];
  if (!allowedSources.includes(source)) return { error: "منبع ثبت انتخاب‌شده معتبر نیست." };
  let provinceId = numeric(field(data, "provinceId", 10)), countyId = numeric(field(data, "countyId", 10));
  if (user.effectiveRole !== "super_admin" && user.effectiveRole !== "activist") {
    if (!user.provinceId) return { error: "محدوده جغرافیایی حساب شما مشخص نیست." };
    provinceId = provinceId || user.provinceId; countyId = countyId || user.countyId;
    if (provinceId !== user.provinceId || (user.countyId && countyId !== user.countyId)) return { error: "ثبت خارج از محدوده مجاز امکان‌پذیر نیست." };
  }
  if (countyId) {
    const [county] = await db.select().from(counties).where(eq(counties.id, countyId)).limit(1);
    if (!county || county.provinceId !== provinceId) return { error: "شهرستان با استان انتخاب‌شده سازگار نیست." };
  }
  if (provinceId && !countyId && user.effectiveRole === "county_admin") return { error: "شهرستان را انتخاب کنید." };
  const activityProvinceId = numeric(field(data, "activityProvinceId", 10)), activityCountyId = numeric(field(data, "activityCountyId", 10));
  if (activityCountyId) {
    const [activityCounty] = await db.select().from(counties).where(eq(counties.id, activityCountyId)).limit(1);
    if (!activityCounty || activityCounty.provinceId !== activityProvinceId) return { error: "شهرستان فعالیت با استان فعالیت سازگار نیست." };
  }
  const chosen = [...new Set(data.getAll("specialties").map((v) => numeric(String(v))).filter((v): v is number => v !== null))];
  if (chosen.length > 20) return { error: "تعداد تخصص‌ها معتبر نیست." };
  let found: Array<{ id: number; code: string; title: string }> = [];
  if (chosen.length) {
    found = await db.select({ id: specialties.id, code: specialties.code, title: specialties.title }).from(specialties).where(inArray(specialties.id, chosen));
    if (found.length !== chosen.length) return { error: "یکی از تخصص‌ها معتبر نیست." };
  }
  // (مرحله چهارم) جزئیات ساختاریافته تخصص‌ها و آثار مؤلف از فرم می‌آیند؛
  // جزئیات هر بار جایگزین می‌شوند (مانند خود تخصص‌ها) و آثار مؤلف فقط افزودنی
  // هستند و حذفشان از صفحه جزئیات پرونده انجام می‌شود.
  let detailRows: ReturnType<typeof parseSpecialtyDetailsInput>;
  let writingRows: ReturnType<typeof parseWritingsInput>;
  try {
    detailRows = parseSpecialtyDetailsInput(data);
    writingRows = parseWritingsInput(data);
  } catch {
    return { error: "جزئیات تخصص‌ها یا آثار مؤلف ارسالی معتبر نیست؛ مقادیر هر تخصص را بررسی کنید." };
  }
  const chosenCodes = new Set(found.map((row) => row.code));
  if (detailRows.some((row) => !chosenCodes.has(row.code))) return { error: "جزئیات برای تخصصی ارسال شده که انتخاب نشده است." };
  if (chosen.length) {
    const detailCodes = new Set(detailRows.map((row) => row.code));
    const incomplete = found.filter((row) => {
      const spec = specialtyDetailSpec[row.code];
      return spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist") && !detailCodes.has(row.code);
    });
    if (incomplete.length) return { error: `جزئیات این تخصص‌ها کامل نشده است: ${incomplete.map((row) => row.title).join("، ")}` };
  }
  const protectedId = nationalId ? await protectNationalId(nationalId) : null;
  const profile = {
    firstName, lastName, fatherName: fatherName || null,
    ...(protectedId ? { nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4 } : {}),
    birthDate, gender: gender || null, phone: phone || null, alternatePhone: alternatePhone || null, email: email || null,
    provinceId, countyId, city: field(data, "city", 120) || null, postalCode: postalCode || null, address: field(data, "address", 1000) || null,
    idCardNumber: idCard || null, idIssuePlace: idIssue || null, activityProvinceId, activityCountyId,
    activityPlace: field(data, "activityPlace", 180) || null, organization: field(data, "organization", 180) || null,
    job: job || null,
    notes: field(data, "notes", 4000) || null, updatedAt: new Date(),
  };
  // (مرحله سوم) اطلاعات تحصیلی چندگانه از فرم به‌صورت JSON می‌آید؛ هر ردیف
  // معتبر به‌صورت «افزودنی» ثبت می‌شود — رکوردهای قبلی هرگز توسط ذخیره فرم
  // حذف نمی‌شوند و حذف فقط از صفحه جزئیات پرونده انجام می‌شود.
  let educationRows: ReturnType<typeof parseEducationInput>;
  try { educationRows = parseEducationInput(data); } catch {
    return { error: "اطلاعات تحصیلی ارسالی معتبر نیست؛ نوع و مقطع هر ردیف را بررسی کنید." };
  }
  let workHistoryRows: ReturnType<typeof parseWorkHistoryInput>;
  try { workHistoryRows = parseWorkHistoryInput(data); } catch {
    return { error: "سوابق شغلی ارسالی معتبر نیست؛ عنوان و تاریخ هر ردیف را بررسی کنید." };
  }
  // Multi-criteria duplicate warning before any write: national ID, mobile number
  // and the name+father+birth-date combination are matched against existing rows.
  const duplicates: DuplicateHint[] = [];
  let globalIdDuplicate = false;
  if (!existing && (protectedId || phone || (fatherName && birthDate))) {
    const conditions: SQL[] = [];
    if (protectedId) conditions.push(eq(activists.nationalIdHash, protectedId.hash));
    if (phone) conditions.push(eq(activists.phone, phone));
    if (firstName && lastName && fatherName && birthDate) conditions.push(and(eq(activists.firstName, firstName), eq(activists.lastName, lastName), eq(activists.fatherName, fatherName), eq(activists.birthDate, birthDate))!);
    const [rows, global] = await Promise.all([
      db.select({ caseId: applications.id, status: applications.status, firstName: activists.firstName, lastName: activists.lastName, fatherMatch: activists.fatherName, hash: activists.nationalIdHash, birth: activists.birthDate, phoneMatch: activists.phone, province: provinces.name, county: counties.name })
        .from(activists).innerJoin(applications, eq(applications.activistId, activists.id))
        .leftJoin(provinces, eq(activists.provinceId, provinces.id)).leftJoin(counties, eq(activists.countyId, counties.id))
        .where(or(...conditions)).limit(6),
      protectedId ? db.select({ one: sql`1` }).from(activists).where(eq(activists.nationalIdHash, protectedId.hash)).limit(1) : Promise.resolve([] as { one: number }[]),
    ]);
    for (const row of rows) {
      const reasons: string[] = [];
      if (protectedId && row.hash === protectedId.hash) reasons.push("تطبیق کد ملی");
      if (phone && row.phoneMatch === phone) reasons.push("تطبیق شماره همراه");
      if (firstName && lastName && fatherName && birthDate && row.firstName === firstName && row.lastName === lastName && row.fatherMatch === fatherName && row.birth === birthDate) reasons.push("تطبیق نام، نام پدر و تاریخ تولد");
      if (!reasons.length) continue;
      duplicates.push({ caseId: row.caseId, name: `${row.firstName} ${row.lastName}`, location: [row.province, row.county].filter(Boolean).join("، ") || null, status: statusLabels[row.status as AppStatus] || String(row.status), reason: reasons.join(" + ") });
    }
    globalIdDuplicate = Boolean(global.length) && !duplicates.some((hint) => hint.reason.includes("کد ملی"));
  }
  if (!existing && (duplicates.length > 0 || globalIdDuplicate) && field(data, "dupAck", 4) !== "yes") {
    return { warning: true, duplicates, globalIdDuplicate };
  }
  let resultId = "";
  try {
    resultId = await db.transaction(async (tx) => {
      if (existing) {
        const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, existing.application.id)).for("update");
        if (!locked || locked.status !== existing.application.status || !["draft", "completing", "needs_correction"].includes(locked.status)) throw new Error("Case status changed");
        const [previous] = await tx.select().from(activists).where(eq(activists.id, existing.activist.id)).limit(1);
        const [oldSpecialties, oldDetails, oldWritings, oldDocuments, next] = await Promise.all([
          tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, existing.activist.id)),
          tx.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, existing.activist.id)),
          tx.select({ workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, existing.activist.id)),
          tx.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.applicationId, existing.application.id)),
          tx.select({ value: sql<number>`coalesce(max(${applicationVersions.version}), 0) + 1` }).from(applicationVersions).where(eq(applicationVersions.applicationId, existing.application.id)),
        ]);
        await tx.insert(applicationVersions).values({ applicationId: existing.application.id, version: Number(next[0].value), snapshot: { profile: previous, specialties: oldSpecialties, specialtyDetails: oldDetails, writings: oldWritings, documents: oldDocuments, status: locked.status }, reason: changeReason || "ویرایش اطلاعات توسط متقاضی", createdBy: user.id });
        await tx.update(activists).set(profile).where(eq(activists.id, existing.activist.id));
        await tx.delete(activistSpecialties).where(eq(activistSpecialties.activistId, existing.activist.id));
        if (chosen.length) await tx.insert(activistSpecialties).values(chosen.map((specialtyId) => ({ activistId: existing.activist.id, specialtyId })));
        await tx.delete(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, existing.activist.id));
        if (detailRows.length) {
          const codeToId = new Map(found.map((row) => [row.code, row.id]));
          await tx.insert(activistSpecialtyDetails).values(detailRows.map((row) => ({ activistId: existing.activist.id, specialtyId: codeToId.get(row.code)!, detailValue: row.value, detailOptions: row.options })));
        }
        if (writingRows.length) await tx.insert(activistWritings).values(writingRows.map((row) => ({ ...row, activistId: existing.activist.id, createdBy: user.id })));
        if (educationRows.length) await tx.insert(educationRecords).values(educationRows.map((row) => ({ ...row, activistId: existing.activist.id, createdBy: user.id })));
        if (workHistoryRows.length) await tx.insert(workHistory).values(workHistoryRows.map((row) => ({ ...row, activistId: existing.activist.id, createdBy: user.id })));
        const nextStatus = locked.status === "draft" ? "completing" : locked.status;
        await tx.update(applications).set({ status: nextStatus, updatedAt: new Date() }).where(eq(applications.id, existing.application.id));
        if (nextStatus !== locked.status) await tx.insert(statusHistory).values({ applicationId: existing.application.id, fromStatus: locked.status, toStatus: nextStatus, actorId: user.id, note: "ادامه تکمیل اطلاعات" });
        await tx.insert(auditLogs).values({ actorId: user.id, action: "update_draft", targetType: "application", targetId: existing.application.id });
        return existing.application.id;
      }
      const [person] = await tx.insert(activists).values({ ...profile, userId: user.effectiveRole === "activist" ? user.id : null }).returning();
      if (chosen.length) await tx.insert(activistSpecialties).values(chosen.map((specialtyId) => ({ activistId: person.id, specialtyId })));
      if (detailRows.length) {
        const codeToId = new Map(found.map((row) => [row.code, row.id]));
        await tx.insert(activistSpecialtyDetails).values(detailRows.map((row) => ({ activistId: person.id, specialtyId: codeToId.get(row.code)!, detailValue: row.value, detailOptions: row.options })));
      }
      if (writingRows.length) await tx.insert(activistWritings).values(writingRows.map((row) => ({ ...row, activistId: person.id, createdBy: user.id })));
      if (educationRows.length) await tx.insert(educationRecords).values(educationRows.map((row) => ({ ...row, activistId: person.id, createdBy: user.id })));
      if (workHistoryRows.length) await tx.insert(workHistory).values(workHistoryRows.map((row) => ({ ...row, activistId: person.id, createdBy: user.id })));
      const [application] = await tx.insert(applications).values({ activistId: person.id, createdBy: user.id, source, status: "initial" }).returning();
      await tx.insert(statusHistory).values({ applicationId: application.id, toStatus: "initial", actorId: user.id, note: "شروع ثبت پرونده" });
      await tx.update(applications).set({ status: "draft" }).where(eq(applications.id, application.id));
      await tx.insert(statusHistory).values({ applicationId: application.id, fromStatus: "initial", toStatus: "draft", actorId: user.id, note: "ایجاد پیش‌نویس پرونده" });
      await tx.insert(auditLogs).values({ actorId: user.id, action: "create_draft", targetType: "application", targetId: application.id });
      return application.id;
    });
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if ((cause.code === "23505" || cause.cause?.code === "23505") && protectedId) {
      const [duplicate] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.nationalIdHash, protectedId.hash), isNull(applications.deletedAt), scopeCondition(user))).limit(1);
      return { error: "کد ملی قبلاً ثبت شده است؛ ایجاد پرونده تکراری مجاز نیست.", ...(duplicate ? { existingCaseId: duplicate.id } : {}) };
    }
    return { error: "ذخیره پرونده انجام نشد؛ اطلاعات یا وضعیت پرونده را دوباره بررسی کنید." };
  }
  revalidatePath("/dashboard"); revalidatePath("/cases");
  redirect(`/cases/${resultId}?m=${stashFlash("پیش‌نویس با موفقیت ذخیره شد.")}`);
}
