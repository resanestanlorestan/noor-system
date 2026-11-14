"use server";

// الحاقیهٔ ۲.۱۰.۰ — اکشن‌های ذخیرهٔ مرحله‌به‌مرحلهٔ پرونده (ویزارد ثبت اطلاعات).
// هر اکشن فقط فیلدهای همان مرحله را می‌نویسد، پیش از هر نوشتن زنجیرهٔ مراحل را
// از موتور src/lib/case-steps.ts کنترل می‌کند و پس از ذخیرهٔ موفق به مرحلهٔ
// بعدی هدایت می‌کند. خطای اعتبارسنجی یا قفل بودن مرحله هرگز اجازهٔ عبور نمی‌دهد.

import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activists, applicationVersions, applications, auditLogs, counties, educationRecords, provinces, specialties, statusHistory, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser, isManager, scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import { jalaliToIso, normalizeDigits, validIdCardNumber, validNationalId, validPostalCode } from "@/lib/format";
import { specialtyDetailSpec } from "@/lib/constants";
import { protectNationalId } from "@/lib/local-secrets";
import { field, numeric, parseEducationInput, parseSpecialtyDetailsInput, parseWritingsInput, parseWorkHistoryInput } from "@/lib/case-input";
import { CASE_STEPS, computeCaseSteps, loadCaseStepFacts, stepGateError, type CaseStepKey } from "@/lib/case-steps";
import type { ActionState, DuplicateHint } from "@/lib/action-state";

const EDITABLE_STATUSES = ["draft", "completing", "needs_correction"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];

const refresh = (id: string) => {
  revalidatePath("/dashboard"); revalidatePath("/cases");
  revalidatePath(`/cases/${id}`);
  for (let step = 1; step <= CASE_STEPS.length; step++) revalidatePath(`/cases/${id}/steps/${step}`);
};

/** Shared prologue: session, editable case, permission and the server-side
 *  step-chain gate. Returns an error ActionState when the write must abort. */
async function stepContext(caseId: string, stepKey: CaseStepKey) {
  const user = await requireUser();
  const row = await getCaseForUser(user, caseId);
  if (!row) return { user, error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." } as const;
  if (!EDITABLE_STATUSES.includes(row.application.status as EditableStatus)) return { user, error: "این پرونده در وضعیت قابل ویرایش نیست." } as const;
  if (!(await can(user, "cases.edit"))) return { user, error: "اجازه ویرایش اطلاعات پرونده را ندارید." } as const;
  const stepIndex = CASE_STEPS.findIndex((step) => step.key === stepKey);
  const facts = await loadCaseStepFacts(row.activist, row.application.status, row.application.id);
  const plan = computeCaseSteps(facts);
  const gate = stepGateError(plan, stepIndex, CASE_STEPS[stepIndex].title);
  if (gate) return { user, error: gate } as const;
  return { user, row, stepIndex } as const;
}

/** Applies one partial profile update inside a locked transaction with the
 *  same version-snapshot + audit trail the legacy save used. */
async function patchActivist(
  user: Awaited<ReturnType<typeof requireUser>>,
  row: NonNullable<Awaited<ReturnType<typeof getCaseForUser>>>,
  patch: Partial<typeof activists.$inferInsert>,
  stepTitle: string,
  nextStatus: "completing" | null,
) {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, row.application.id)).for("update");
    if (!locked || locked.status !== row.application.status || !EDITABLE_STATUSES.includes(locked.status as EditableStatus)) throw new Error("Case status changed");
    const [previous] = await tx.select().from(activists).where(eq(activists.id, row.activist.id)).limit(1);
    const [oldSpecialties, oldDetails, oldWritings, next] = await Promise.all([
      tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, row.activist.id)),
      tx.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, row.activist.id)),
      tx.select({ workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, row.activist.id)),
      tx.select({ value: sql<number>`coalesce(max(${applicationVersions.version}), 0) + 1` }).from(applicationVersions).where(eq(applicationVersions.applicationId, row.application.id)),
    ]);
    await tx.insert(applicationVersions).values({ applicationId: row.application.id, version: Number(next[0].value), snapshot: { profile: previous, specialties: oldSpecialties, specialtyDetails: oldDetails, writings: oldWritings, status: locked.status }, reason: `ذخیرهٔ مرحلهٔ «${stepTitle}» ویزارد ثبت`, createdBy: user.id });
    await tx.update(activists).set({ ...patch, updatedAt: new Date() }).where(eq(activists.id, row.activist.id));
    if (nextStatus && nextStatus !== locked.status) {
      await tx.update(applications).set({ status: nextStatus, updatedAt: new Date() }).where(eq(applications.id, row.application.id));
      await tx.insert(statusHistory).values({ applicationId: row.application.id, fromStatus: locked.status, toStatus: nextStatus, actorId: user.id, note: "ادامه تکمیل اطلاعات" });
    }
    await tx.insert(auditLogs).values({ actorId: user.id, action: "update_draft", targetType: "application", targetId: row.application.id, detail: `مرحلهٔ ${stepTitle}` });
    return locked.status;
  });
}

/* ------------------------- مرحلهٔ ۱ — هویتی و تماس ------------------------- */

export async function saveIdentityStepAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const caseId = field(data, "caseId", 40);
  const existing = caseId ? await getCaseForUser(user, caseId) : null;
  if (caseId && !existing) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (existing) {
    if (!EDITABLE_STATUSES.includes(existing.application.status as EditableStatus)) return { error: "این پرونده در وضعیت قابل ویرایش نیست." };
    if (!(await can(user, "cases.edit"))) return { error: "اجازه ویرایش اطلاعات پرونده را ندارید." };
    const changeReason = field(data, "changeReason", 2000);
    if (user.effectiveRole !== "activist" && changeReason.length < 5) return { error: "برای ویرایش سازمانی، دلیل اصلاح را با حداقل ۵ نویسه وارد کنید." };
  } else {
    if (!(await can(user, "cases.create"))) return { error: "دسترسی ثبت پرونده ندارید." };
    if (user.effectiveRole === "activist") {
      const [own] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.userId, user.id), isNull(applications.deletedAt))).limit(1);
      if (own) return { error: "برای حساب شما پرونده‌ای وجود دارد؛ آن را از فهرست پرونده‌ها باز کنید.", ...(own ? { existingCaseId: own.id } : {}) };
    }
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
  const identityMissing: string[] = [];
  if (firstName.length < 2) identityMissing.push("نام");
  if (lastName.length < 2) identityMissing.push("نام خانوادگی");
  if (!fatherName) identityMissing.push("نام پدر");
  if (!existing && !nationalId) identityMissing.push("کد ملی");
  if (existing && nationalId) { /* کد ملی اختیاری در ویرایش؛ فقط اگر وارد شود اعتبارسنجی و جایگزین می‌شود */ }
  if (!idCard) identityMissing.push("شماره شناسنامه");
  if (!idIssue) identityMissing.push("محل صدور شناسنامه");
  if (!birth) identityMissing.push("تاریخ تولد شمسی");
  if (!gender) identityMissing.push("جنسیت");
  if (!phone) identityMissing.push("شماره همراه");
  if (!alternatePhone) identityMissing.push("شماره همراه جایگزین");
  if (identityMissing.length) return { error: `فیلدهای اجباری مرحلهٔ هویتی را تکمیل کنید: ${identityMissing.join("، ")}` };
  const protectedId = nationalId ? await protectNationalId(nationalId) : null;

  if (existing) {
    try {
      await patchActivist(user, existing, {
        firstName, lastName, fatherName: fatherName || null,
        ...(protectedId ? { nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4 } : {}),
        birthDate, gender, phone, alternatePhone, email: email || null,
        idCardNumber: idCard || null, idIssuePlace: idIssue || null,
      }, CASE_STEPS[0].title, existing.application.status === "draft" ? "completing" : null);
    } catch {
      return { error: "ذخیرهٔ مرحلهٔ هویتی انجام نشد؛ وضعیت پرونده را دوباره بررسی کنید." };
    }
    refresh(existing.application.id);
    redirect(`/cases/${existing.application.id}/steps/2`);
  }

  // ایجاد پیش‌نویس جدید با اطلاعات هویتی — هشدار تکراری بودن پیش از هر نوشتن
  const sourceInput = field(data, "source", 12);
  const defaultSource = user.effectiveRole === "activist" ? "self" : isManager(user) ? "manager" : "expert";
  const source = (sourceInput || defaultSource) as "self" | "manager" | "expert" | "paper";
  const allowedSources: string[] = user.effectiveRole === "activist" ? ["self"] : isManager(user) ? ["manager", "expert", "paper"] : ["expert", "paper"];
  if (!allowedSources.includes(source)) return { error: "منبع ثبت انتخاب‌شده معتبر نیست." };
  const duplicates: DuplicateHint[] = [];
  let globalIdDuplicate = false;
  if (protectedId || phone || (fatherName && birthDate)) {
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
      duplicates.push({ caseId: row.caseId, name: `${row.firstName} ${row.lastName}`, location: [row.province, row.county].filter(Boolean).join("، ") || null, status: "در سامانه", reason: reasons.join(" + ") });
    }
    globalIdDuplicate = Boolean(global.length) && !duplicates.some((hint) => hint.reason.includes("کد ملی"));
  }
  if ((duplicates.length > 0 || globalIdDuplicate) && field(data, "dupAck", 4) !== "yes") {
    return { warning: true, duplicates, globalIdDuplicate };
  }
  let resultId = "";
  try {
    resultId = await db.transaction(async (tx) => {
      const [person] = await tx.insert(activists).values({
        firstName, lastName, fatherName: fatherName || null,
        ...(protectedId ? { nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4 } : {}),
        birthDate, gender, phone, alternatePhone, email: email || null,
        idCardNumber: idCard || null, idIssuePlace: idIssue || null,
        userId: user.effectiveRole === "activist" ? user.id : null,
      }).returning();
      const [application] = await tx.insert(applications).values({ activistId: person.id, createdBy: user.id, source, status: "initial" }).returning();
      await tx.insert(statusHistory).values({ applicationId: application.id, toStatus: "initial", actorId: user.id, note: "شروع ثبت پرونده" });
      await tx.update(applications).set({ status: "draft" }).where(eq(applications.id, application.id));
      await tx.insert(statusHistory).values({ applicationId: application.id, fromStatus: "initial", toStatus: "draft", actorId: user.id, note: "ایجاد پیش‌نویس پرونده" });
      await tx.insert(auditLogs).values({ actorId: user.id, action: "create_draft", targetType: "application", targetId: application.id, detail: "مرحلهٔ هویتی ویزارد" });
      return application.id;
    });
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if ((cause.code === "23505" || cause.cause?.code === "23505") && protectedId) {
      const [duplicate] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.nationalIdHash, protectedId.hash), isNull(applications.deletedAt), scopeCondition(user))).limit(1);
      return { error: "کد ملی قبلاً ثبت شده است؛ ایجاد پرونده تکراری مجاز نیست.", ...(duplicate ? { existingCaseId: duplicate.id } : {}) };
    }
    return { error: "ذخیرهٔ مرحلهٔ هویتی انجام نشد؛ دوباره تلاش کنید." };
  }
  refresh(resultId);
  redirect(`/cases/${resultId}/steps/2`);
}

/* ---------------------- مرحلهٔ ۲ — سکونت و فعالیت ---------------------- */

export async function saveLocationStepAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const caseId = field(data, "caseId", 40);
  const context = await stepContext(caseId, "location");
  if ("error" in context) return { error: context.error };
  const { user, row } = context;
  const changeReason = field(data, "changeReason", 2000);
  if (user.effectiveRole !== "activist" && changeReason.length < 5) return { error: "برای ویرایش سازمانی، دلیل اصلاح را با حداقل ۵ نویسه وارد کنید." };
  let provinceId = numeric(field(data, "provinceId", 10)), countyId = numeric(field(data, "countyId", 10));
  if (!provinceId || !countyId) return { error: "انتخاب استان و شهرستان سکونت برای تکمیل این مرحله الزامی است." };
  if (user.effectiveRole !== "super_admin" && user.effectiveRole !== "activist") {
    if (!user.provinceId) return { error: "محدوده جغرافیایی حساب شما مشخص نیست." };
    if (provinceId !== user.provinceId || (user.countyId && countyId !== user.countyId)) return { error: "ثبت خارج از محدوده مجاز امکان‌پذیر نیست." };
  }
  const [county] = await db.select().from(counties).where(eq(counties.id, countyId)).limit(1);
  if (!county || county.provinceId !== provinceId) return { error: "شهرستان با استان انتخاب‌شده سازگار نیست." };
  const postalCode = normalizeDigits(field(data, "postalCode", 10)).replace(/\s/g, "");
  if (postalCode && !validPostalCode(postalCode)) return { error: "کد پستی باید ۱۰ رقم باشد." };
  const activityProvinceId = numeric(field(data, "activityProvinceId", 10)), activityCountyId = numeric(field(data, "activityCountyId", 10));
  if (activityCountyId) {
    const [activityCounty] = await db.select().from(counties).where(eq(counties.id, activityCountyId)).limit(1);
    if (!activityCounty || activityCounty.provinceId !== activityProvinceId) return { error: "شهرستان فعالیت با استان فعالیت سازگار نیست." };
  }
  try {
    await patchActivist(user, row, {
      provinceId, countyId,
      city: field(data, "city", 120) || null,
      postalCode: postalCode || null,
      address: field(data, "address", 1000) || null,
      activityProvinceId, activityCountyId,
      activityPlace: field(data, "activityPlace", 180) || null,
      organization: field(data, "organization", 180) || null,
    }, CASE_STEPS[1].title, null);
  } catch {
    return { error: "ذخیرهٔ مرحلهٔ سکونت و فعالیت انجام نشد؛ دوباره تلاش کنید." };
  }
  refresh(row.application.id);
  redirect(`/cases/${row.application.id}/steps/3`);
}

/* -------------- مرحلهٔ ۳ — تخصص‌ها، تحصیلات و سوابق -------------- */

export async function saveSpecialtiesStepAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const caseId = field(data, "caseId", 40);
  const context = await stepContext(caseId, "specialties");
  if ("error" in context) return { error: context.error };
  const { user, row } = context;
  const changeReason = field(data, "changeReason", 2000);
  if (user.effectiveRole !== "activist" && changeReason.length < 5) return { error: "برای ویرایش سازمانی، دلیل اصلاح را با حداقل ۵ نویسه وارد کنید." };
  const chosen = [...new Set(data.getAll("specialties").map((v) => numeric(String(v))).filter((v): v is number => v !== null))];
  if (!chosen.length) return { error: "برای تکمیل این مرحله، انتخاب حداقل یک تخصص قرآنی الزامی است." };
  if (chosen.length > 20) return { error: "تعداد تخصص‌ها معتبر نیست." };
  const found = await db.select({ id: specialties.id, code: specialties.code, title: specialties.title }).from(specialties).where(inArray(specialties.id, chosen));
  if (found.length !== chosen.length) return { error: "یکی از تخصص‌ها معتبر نیست." };
  let detailRows: ReturnType<typeof parseSpecialtyDetailsInput>;
  let writingRows: ReturnType<typeof parseWritingsInput>;
  try {
    detailRows = parseSpecialtyDetailsInput(data);
    writingRows = parseWritingsInput(data);
  } catch {
    return { error: "جزئیات تخصص‌ها یا آثار مؤلف ارسالی معتبر نیست؛ مقادیر هر تخصص را بررسی کنید." };
  }
  const chosenCodes = new Set(found.map((item) => item.code));
  if (detailRows.some((item) => !chosenCodes.has(item.code))) return { error: "جزئیات برای تخصصی ارسال شده که انتخاب نشده است." };
  const detailCodes = new Set(detailRows.map((item) => item.code));
  const incomplete = found.filter((item) => {
    const spec = specialtyDetailSpec[item.code];
    return spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist") && !detailCodes.has(item.code);
  });
  if (incomplete.length) return { error: `جزئیات این تخصص‌ها کامل نشده است: ${incomplete.map((item) => item.title).join("، ")}` };
  let educationRows: ReturnType<typeof parseEducationInput>;
  try { educationRows = parseEducationInput(data); } catch {
    return { error: "اطلاعات تحصیلی ارسالی معتبر نیست؛ نوع و مقطع هر ردیف را بررسی کنید." };
  }
  let workHistoryRows: ReturnType<typeof parseWorkHistoryInput>;
  try { workHistoryRows = parseWorkHistoryInput(data); } catch {
    return { error: "سوابق شغلی ارسالی معتبر نیست؛ عنوان و تاریخ هر ردیف را بررسی کنید." };
  }
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, row.application.id)).for("update");
      if (!locked || locked.status !== row.application.status || !EDITABLE_STATUSES.includes(locked.status as EditableStatus)) throw new Error("Case status changed");
      const [previous] = await tx.select().from(activists).where(eq(activists.id, row.activist.id)).limit(1);
      const [oldSpecialties, oldDetails, oldWritings, next] = await Promise.all([
        tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, row.activist.id)),
        tx.select({ specialtyId: activistSpecialtyDetails.specialtyId, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, row.activist.id)),
        tx.select({ workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, row.activist.id)),
        tx.select({ value: sql<number>`coalesce(max(${applicationVersions.version}), 0) + 1` }).from(applicationVersions).where(eq(applicationVersions.applicationId, row.application.id)),
      ]);
      await tx.insert(applicationVersions).values({ applicationId: row.application.id, version: Number(next[0].value), snapshot: { profile: previous, specialties: oldSpecialties, specialtyDetails: oldDetails, writings: oldWritings, status: locked.status }, reason: `ذخیرهٔ مرحلهٔ «${CASE_STEPS[2].title}» ویزارد ثبت`, createdBy: user.id });
      await tx.update(activists).set({ job: field(data, "job", 120) || null, notes: field(data, "notes", 4000) || null, updatedAt: new Date() }).where(eq(activists.id, row.activist.id));
      await tx.delete(activistSpecialties).where(eq(activistSpecialties.activistId, row.activist.id));
      await tx.insert(activistSpecialties).values(chosen.map((specialtyId) => ({ activistId: row.activist.id, specialtyId })));
      await tx.delete(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.activistId, row.activist.id));
      if (detailRows.length) {
        const codeToId = new Map(found.map((item) => [item.code, item.id]));
        await tx.insert(activistSpecialtyDetails).values(detailRows.map((item) => ({ activistId: row.activist.id, specialtyId: codeToId.get(item.code)!, detailValue: item.value, detailOptions: item.options })));
      }
      if (writingRows.length) await tx.insert(activistWritings).values(writingRows.map((item) => ({ ...item, activistId: row.activist.id, createdBy: user.id })));
      if (educationRows.length) await tx.insert(educationRecords).values(educationRows.map((item) => ({ ...item, activistId: row.activist.id, createdBy: user.id })));
      if (workHistoryRows.length) await tx.insert(workHistory).values(workHistoryRows.map((item) => ({ ...item, activistId: row.activist.id, createdBy: user.id })));
      const nextStatus = locked.status === "draft" ? "completing" : locked.status;
      if (nextStatus !== locked.status) {
        await tx.update(applications).set({ status: nextStatus, updatedAt: new Date() }).where(eq(applications.id, row.application.id));
        await tx.insert(statusHistory).values({ applicationId: row.application.id, fromStatus: locked.status, toStatus: nextStatus, actorId: user.id, note: "ادامه تکمیل اطلاعات" });
      }
      await tx.insert(auditLogs).values({ actorId: user.id, action: "update_draft", targetType: "application", targetId: row.application.id, detail: `مرحلهٔ ${CASE_STEPS[2].title}` });
    });
  } catch {
    return { error: "ذخیرهٔ مرحلهٔ تخصص‌ها و سوابق انجام نشد؛ دوباره تلاش کنید." };
  }
  refresh(row.application.id);
  redirect(`/cases/${row.application.id}/steps/4`);
}
