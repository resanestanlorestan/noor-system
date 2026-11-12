"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activists, applicationVersions, applications, auditLogs, certificates, correctionRequests, counties, documentRequests, documents, educationRecords, provinces, specialties, statusHistory, users, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { completeness, getCaseForUser, isManager, missingRequired, scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import { managerInScope } from "@/lib/workflow-utils";
import { caseSubmittedSms, deliverOutbox, notifyUsers } from "@/lib/messaging";
import { jalaliToIso, normalizeDigits, normalizeText, validIdCardNumber, validNationalId, validPostalCode } from "@/lib/format";
import { documentTypeLabels, educationLevelOptions, educationTypeLabels, hafizJuzOptions, recitationLevelOptions, specialtyDetailSpec, statusLabels, writingTypeLabels, type AppStatus, type DocumentType, type EducationType, type WritingType } from "@/lib/constants";
import { privateDir, protectNationalId } from "@/lib/local-secrets";
import type { ActionState, DuplicateHint } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);
const numeric = (value: string) => /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
const messageRedirect: (id: string, message: string) => never = (id, message) => redirect(`/cases/${id}?message=${encodeURIComponent(message)}`);

/** (مرحله سوم) Parses the education-rows JSON posted by the profile form.
 *  Each row needs a valid type and a level matching that type; optional text
 *  fields are trimmed and length-capped. Invalid payload aborts the save. */
function parseEducationInput(data: FormData): Array<{ type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null }> {
  const raw = String(data.get("educationRecords") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-education-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-education-json");
  const rows: Array<{ type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-education-json");
    const record = item as Record<string, unknown>;
    const type = String(record.type || "");
    const level = normalizeText(String(record.level || "")).slice(0, 60);
    // Fully empty rows (the user opened a row but never picked anything) are
    // ignored, mirroring the client-side payload filter; partial rows abort.
    if (!type && !level) continue;
    if (!(type in educationTypeLabels) || !level) throw new Error("invalid-education-json");
    if (!(educationLevelOptions[type as EducationType] as readonly string[]).includes(level)) throw new Error("invalid-education-json");
    rows.push({
      type: type as EducationType, level,
      field: normalizeText(String(record.field || "")).slice(0, 120) || null,
      centerName: normalizeText(String(record.centerName || "")).slice(0, 180) || null,
      certificate: normalizeText(String(record.certificate || "")).slice(0, 180) || null,
    });
  }
  return rows;
}

/** (مرحله چهارم) Parses the specialty-details JSON posted by the profile form:
 *  [{ code, value?, options? }] for checked specialties that carry structured
 *  data — memorizer juz range ("1".."30"/"complete"), reciter level ("4".."7")
 *  and the checklist specialties. Unknown codes, values outside the spec or an
 *  empty checklist abort the save. Author works use parseWritingsInput. */
function parseSpecialtyDetailsInput(data: FormData): Array<{ code: string; value: string | null; options: string[] | null }> {
  const raw = String(data.get("specialtyDetails") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-specialty-details"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-specialty-details");
  const rows: Array<{ code: string; value: string | null; options: string[] | null }> = [];
  for (const item of parsed.slice(0, 20)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-specialty-details");
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    if (!code) continue;
    const spec = specialtyDetailSpec[code];
    if (!spec || spec.kind === "none" || spec.kind === "writings") throw new Error("invalid-specialty-details");
    if (spec.kind === "juz" || spec.kind === "level") {
      const value = String(record.value || "");
      const allowed = spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions;
      if (!(value in allowed)) throw new Error("invalid-specialty-details");
      rows.push({ code, value, options: null });
      continue;
    }
    const specOptions = spec.options ?? {};
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = [...new Set(rawOptions.map((option) => String(option)).filter((option) => option in specOptions))];
    if (!options.length) throw new Error("invalid-specialty-details");
    rows.push({ code, value: null, options });
  }
  return rows;
}

/** (مرحله چهارم) Author works (مؤلف): [{ workType, title, topic }]. Fully empty
 *  rows are skipped; rows with an invalid type or a short title abort. */
function parseWritingsInput(data: FormData): Array<{ workType: WritingType; title: string; topic: string | null }> {
  const raw = String(data.get("writings") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-writings-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-writings-json");
  const rows: Array<{ workType: WritingType; title: string; topic: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-writings-json");
    const record = item as Record<string, unknown>;
    const workType = String(record.workType || "");
    const title = normalizeText(String(record.title || "")).slice(0, 180);
    const topic = normalizeText(String(record.topic || "")).slice(0, 180);
    if (!workType && !title && !topic) continue;
    if (!(workType in writingTypeLabels) || title.length < 2) throw new Error("invalid-writings-json");
    rows.push({ workType: workType as WritingType, title, topic: topic || null });
  }
  return rows;
}

/** (مرحله پنجم) Parses the work-history JSON posted by the profile form:
 *  [{ title, employer?, position?, startDate?, endDate?, description? }] —
 *  Jalali dates are converted with jalaliToIso; rows without a title are
 *  ignored, invalid payloads or dates abort the save. */
function parseWorkHistoryInput(data: FormData): Array<{ title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> {
  const raw = String(data.get("workHistory") || "").slice(0, 20000);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid-work-history-json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid-work-history-json");
  const rows: Array<{ title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null }> = [];
  for (const item of parsed.slice(0, 30)) {
    if (typeof item !== "object" || item === null) throw new Error("invalid-work-history-json");
    const record = item as Record<string, unknown>;
    const title = normalizeText(String(record.title || "")).slice(0, 180);
    const startRaw = String(record.startDate || "").slice(0, 20);
    const endRaw = String(record.endDate || "").slice(0, 20);
    const startDate = startRaw ? jalaliToIso(startRaw) : null;
    const endDate = endRaw ? jalaliToIso(endRaw) : null;
    // Fully empty rows (the user opened a row but never picked anything) are
    // ignored, mirroring the education-rows behavior; a row carrying dates but
    // no title is partial and aborts.
    if (!title && !startRaw && !endRaw) continue;
    if (title.length < 2) throw new Error("invalid-work-history-json");
    if ((startRaw && !startDate) || (endRaw && !endDate)) throw new Error("invalid-work-history-json");
    if (startDate && endDate && startDate > endDate) throw new Error("invalid-work-history-json");
    rows.push({
      title,
      employer: normalizeText(String(record.employer || "")).slice(0, 180) || null,
      position: normalizeText(String(record.position || "")).slice(0, 120) || null,
      startDate, endDate,
      description: normalizeText(String(record.description || "")).slice(0, 2000) || null,
    });
  }
  return rows;
}

export async function saveCaseAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await can(user, "cases.create"))) return { error: "دسترسی ثبت پرونده ندارید." };
  const caseId = field(data, "caseId", 40);
  const existing = caseId ? await getCaseForUser(user, caseId) : null;
  if (caseId && !existing) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (existing && !["draft", "completing", "needs_correction"].includes(existing.application.status)) return { error: "این پرونده در وضعیت قابل ویرایش نیست." };
  const changeReason = field(data, "changeReason", 2000);
  if (existing && user.effectiveRole !== "activist" && changeReason.length < 5) return { error: "برای ویرایش سازمانی، دلیل اصلاح را با حداقل ۵ نویسه وارد کنید." };
  if (!existing && user.effectiveRole === "activist") {
    const [own] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(activists.userId, user.id)).limit(1);
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
      const [duplicate] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.nationalIdHash, protectedId.hash), scopeCondition(user))).limit(1);
      return { error: "کد ملی قبلاً ثبت شده است؛ ایجاد پرونده تکراری مجاز نیست.", ...(duplicate ? { existingCaseId: duplicate.id } : {}) };
    }
    return { error: "ذخیره پرونده انجام نشد؛ اطلاعات یا وضعیت پرونده را دوباره بررسی کنید." };
  }
  revalidatePath("/dashboard"); revalidatePath("/cases");
  redirect(`/cases/${resultId}?message=${encodeURIComponent("پیش‌نویس با موفقیت ذخیره شد.")}`);
}

async function advanceCase(data: FormData, target: "ready" | "pending") {
  const user = await requireUser(); const id = field(data, "caseId", 40); const row = await getCaseForUser(user, id);
  const allowed = target === "ready" ? ["draft", "completing", "needs_correction"] : ["ready"];
  if (!row || !allowed.includes(row.application.status)) messageRedirect(id, "این انتقال برای وضعیت فعلی مجاز نیست.");
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ application: applications, activist: activists }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(applications.id, id)).for("update");
    if (!locked || locked.application.status !== row.application.status) return "وضعیت پرونده تغییر کرده است؛ دوباره تلاش کنید.";
    const [specs, docs] = await Promise.all([
      tx.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, locked.activist.id)),
      tx.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, id), eq(documents.kind, "evidence"))),
    ]);
    const missing = missingRequired(locked.activist, specs.length, docs.length);
    if (missing.length) return `برای ارسال تکمیل کنید: ${missing.join("، ")}`;
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
  if (!row || !["draft", "completing", "needs_correction"].includes(row.application.status)) return { error: "بارگذاری در این وضعیت مجاز نیست." };
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
      if (!locked || !["draft", "completing", "needs_correction"].includes(locked.status)) throw new Error("Case status changed");
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
  revalidatePath(`/cases/${id}`); return { success: "مدرک با موفقیت بارگذاری شد." };
}

export async function uploadPhotoAction(id: string, _state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser(); const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.edit")) || !["draft", "completing", "needs_correction"].includes(row.application.status)) return { error: "بارگذاری تصویر در این وضعیت مجاز نیست." };
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) return { error: "فایل تصویر پرسنلی را انتخاب کنید." };
  if (file.size > 5 * 1024 * 1024) return { error: "حجم فایل نباید بیش از ۵ مگابایت باشد." };
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
      if (!locked || !["draft", "completing", "needs_correction"].includes(locked.status)) throw new Error("Case status changed");
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
  revalidatePath(`/cases/${id}`); return { success: "تصویر پرسنلی با موفقیت بارگذاری شد." };
}

export async function removePhotoAction(data: FormData) {
  const user = await requireUser();
  const id = field(data, "caseId", 40);
  const row = await getCaseForUser(user, id);
  const editable = row && (await can(user, "cases.edit")) && ["draft", "completing", "needs_correction"].includes(row.application.status);
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
  revalidatePath(`/cases/${id}`);
  messageRedirect(id, "تصویر پرسنلی حذف شد.");
}
