"use server";

// الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای با بارگذاری مدارک درون‌بخشی.
// فرآیند دومرحله‌ای قبلی (ثبت حساب، سپس ورود و تکمیل ویزارد و بارگذاری مدارک)
// برای ثبت‌نام‌های عمومی حذف شده است: کاربر در همین یک فرم همهٔ اطلاعات هویتی،
// سکونت، تحصیلات، حافظ قرآن، تخصص‌ها، سوابق همکاری و دوره‌ها را ثبت و تمام
// مدارک را در همان بخش مربوط بارگذاری می‌کند و با یک «ثبت نهایی»، حساب کاربری
// و پروندهٔ کامل با وضعیت «در انتظار بررسی» ساخته می‌شود.
// اصول حفاظتی:
//  - هیچ فیلد یا امکان فعلی حذف نشده؛ ویزارد ثبت سازمانی و همهٔ اکشن‌های قبلی
//    سر جایشان هستند و دادهٔ این فرم با همان جداول و قواعد اعتبارسنجی ذخیره می‌شود.
//  - همهٔ ورودی‌ها سمت سرور بازاعتبارسنجی می‌شوند؛ توصیف فایل‌های بارگذاری‌شده
//    (staged) با کنترل وجود فایل روی دیسک، نوع واقعی محتوا و اندازه پذیرفته می‌شود.
//  - تکراری بودن کد ملی فقط برای پرونده‌های فعال مسدود است (رفع باگ ۲.۱۲.۰).

import { and, eq, inArray, isNull } from "drizzle-orm";
import { stat } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activityRecords, activists, applications, auditLogs, counties, documents, educationRecords, educationalCourses, specialties, statusHistory, users, workHistory } from "@/db/schema";
import { audit, createSession, hashPassword, throttleKey, isThrottled, clearFailures } from "@/lib/auth";
import { issueMobileVerification, issuePendingVerificationToken } from "@/lib/mobile-verification";
import { normalizeIranMobile, deliverOutbox, mobileVerificationSms, queueSms, smsProvider, notifyUsers } from "@/lib/messaging";
import { validEmailFormat, validIranMobile, validPasswordFormat, PASSWORD_POLICY_ERROR } from "@/lib/validation";
import { jalaliToIso, normalizeDigits, normalizeText, validIdCardNumber, validNationalId, validPostalCode } from "@/lib/format";
import { courseFieldOptions, cooperationTypeOptions, educationLevelOptions, educationTypeLabels, hafizJuzOptions, memorizationCertTypeOptions, recitationLevelOptions, specialtyDetailSpec, activityRecordKindLabels, writingTypeLabels, type EducationType, type WritingType } from "@/lib/constants";
import { protectNationalId, privateDir } from "@/lib/local-secrets";
import { resolveSmsTemplate } from "@/lib/sms-admin";
import { managerInScope } from "@/lib/workflow-utils";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);

type StagedDoc = { key: string; name: string; mime: string; size: number; section: string };
type EducationPayload = { level: string; field: string; centerName: string; certificate: string; docKey: string };
type WorkRow = { title: string; employer: string; cooperationType: string; position: string; startDate: string; endDate: string; description: string; docKey: string };
type CourseRow = { title: string; provider: string; field: string; completedDate: string; hours: string; docKey: string };
type ActivityRow = { kind: string; field: string; title: string; organization: string; position: string; startDate: string; endDate: string; description: string };

function parseJsonField<T>(raw: string, guard: (item: unknown) => T | null, max: number): T[] | null {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw.slice(0, 40000)); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const rows: T[] = [];
  for (const item of parsed.slice(0, max)) {
    const value = guard(item);
    if (value === null) return null;
    rows.push(value);
  }
  return rows;
}

const text = (value: unknown, max: number) => normalizeText(String(value ?? "")).slice(0, max);

export async function registerCaseAction(_state: ActionState, data: FormData): Promise<ActionState> {
  /* ---------------- حساب کاربری ---------------- */
  const firstName = field(data, "firstName", 80), lastName = field(data, "lastName", 100);
  if (firstName.length < 2 || lastName.length < 2) return { error: "نام و نام خانوادگی (حداقل ۲ نویسه) را وارد کنید." };
  const mobile = normalizeIranMobile(normalizeDigits(field(data, "mobile", 20)));
  const email = field(data, "email", 254).toLowerCase();
  const password = String(data.get("password") || ""); const confirmation = String(data.get("confirmation") || "");
  if (email && !validEmailFormat(email)) return { error: "ایمیل اختیاری است؛ اما اگر وارد می‌کنید باید معتبر باشد." };
  if (!validIranMobile(mobile)) return { error: "شماره موبایل معتبر وارد کنید؛ مانند ۰۹۱۲۳۴۵۶۷۸۹." };
  if (!validPasswordFormat(password)) return { error: PASSWORD_POLICY_ERROR };
  if (password !== confirmation) return { error: "تکرار گذرواژه با گذرواژه یکسان نیست." };
  const throttle = await throttleKey(`register-case:${mobile}`);
  if (await isThrottled(throttle)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید." };

  /* ---------------- اطلاعات هویتی ---------------- */
  const fatherName = field(data, "fatherName", 80);
  const nationalId = normalizeDigits(field(data, "nationalId", 20)).replace(/\s/g, "");
  if (!validNationalId(nationalId)) return { error: "کد ملی معتبر نیست؛ ده رقم و رقم کنترل را بررسی کنید." };
  const idCard = normalizeDigits(field(data, "idCardNumber", 20)).replace(/\s/g, "");
  if (!idCard || !validIdCardNumber(idCard)) return { error: "شماره شناسنامه باید فقط شامل رقم و حداکثر ۱۰ رقم باشد." };
  const idIssue = field(data, "idIssuePlace", 80);
  if (!idIssue) return { error: "محل صدور شناسنامه را وارد کنید." };
  const birthRaw = field(data, "birthDate", 20);
  const birthDate = birthRaw ? jalaliToIso(birthRaw) : null;
  if (!birthDate) return { error: "تاریخ تولد را از تقویم شمسی انتخاب کنید." };
  const gender = field(data, "gender", 20);
  if (!["female", "male"].includes(gender)) return { error: "جنسیت را انتخاب کنید." };
  const alternatePhone = normalizeDigits(field(data, "alternatePhone", 20)).replace(/\s/g, "");
  if (!/^09\d{9}$/.test(alternatePhone)) return { error: "شماره همراه جایگزین باید ۱۱ رقم و با ۰۹ شروع شود." };
  const contactEmail = field(data, "contactEmail", 254).toLowerCase();
  if (contactEmail && !validEmailFormat(contactEmail)) return { error: "ایمیل تماس معتبر نیست." };

  /* ---------------- سکونت و محل فعالیت ---------------- */
  const provinceId = Number(field(data, "provinceId", 10)), countyId = Number(field(data, "countyId", 10));
  if (!Number.isSafeInteger(provinceId) || provinceId <= 0 || !Number.isSafeInteger(countyId) || countyId <= 0) return { error: "استان و شهرستان سکونت را انتخاب کنید." };
  const [county] = await db.select().from(counties).where(eq(counties.id, countyId)).limit(1);
  if (!county || county.provinceId !== provinceId) return { error: "شهرستان با استان انتخاب‌شده سازگار نیست." };
  const postalCode = normalizeDigits(field(data, "postalCode", 10)).replace(/\s/g, "");
  if (postalCode && !validPostalCode(postalCode)) return { error: "کد پستی باید ۱۰ رقم باشد." };
  const activityProvinceId = Number(field(data, "activityProvinceId", 10)) || null;
  const activityCountyId = Number(field(data, "activityCountyId", 10)) || null;
  if (activityCountyId) {
    const [activityCounty] = await db.select().from(counties).where(eq(counties.id, activityCountyId)).limit(1);
    if (!activityCounty || activityCounty.provinceId !== activityProvinceId) return { error: "شهرستان فعالیت با استان فعالیت سازگار نیست." };
  }

  /* ---------------- تخصص‌ها و جزئیات ---------------- */
  const chosen = [...new Set(data.getAll("specialties").map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))];
  if (!chosen.length) return { error: "انتخاب حداقل یک تخصص قرآنی الزامی است." };
  if (chosen.length > 20) return { error: "تعداد تخصص‌ها معتبر نیست." };
  const found = await db.select({ id: specialties.id, code: specialties.code, title: specialties.title }).from(specialties).where(inArray(specialties.id, chosen));
  if (found.length !== chosen.length) return { error: "یکی از تخصص‌ها معتبر نیست." };
  const detailRows = parseJsonField<{ code: string; value: string | null; options: string[] | null }>(String(data.get("specialtyDetails") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    const spec = specialtyDetailSpec[code];
    if (!spec || spec.kind === "none" || spec.kind === "writings") return null;
    if (spec.kind === "juz" || spec.kind === "level") {
      const value = String(record.value || "");
      const allowed = spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions;
      if (!(value in allowed)) return null;
      return { code, value, options: null };
    }
    const specOptions = spec.options ?? {};
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = [...new Set(rawOptions.map((option) => String(option)).filter((option) => option in specOptions))];
    if (!options.length) return null;
    return { code, value: null, options };
  }, 20);
  if (detailRows === null) return { error: "جزئیات تخصص‌ها معتبر نیست؛ مقادیر هر تخصص را بررسی کنید." };
  const chosenCodes = new Set(found.map((item) => item.code));
  if (detailRows.some((item) => !chosenCodes.has(item.code))) return { error: "جزئیات برای تخصصی ارسال شده که انتخاب نشده است." };
  const detailCodes = new Set(detailRows.map((item) => item.code));
  const incomplete = found.filter((item) => {
    const spec = specialtyDetailSpec[item.code];
    return spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist") && !detailCodes.has(item.code);
  });
  if (incomplete.length) return { error: `جزئیات این تخصص‌ها کامل نشده است: ${incomplete.map((item) => item.title).join("، ")}` };
  const writingRows = parseJsonField<{ workType: WritingType; title: string; topic: string | null }>(String(data.get("writings") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const workType = String(record.workType || "");
    const title = text(record.title, 180);
    const topic = text(record.topic, 180);
    if (!workType && !title && !topic) return null;
    if (!(workType in writingTypeLabels) || title.length < 2) return null;
    return { workType: workType as WritingType, title, topic: topic || null };
  }, 30);
  if (writingRows === null) return { error: "اطلاعات آثار مؤلف معتبر نیست." };
  const authorSelected = chosenCodes.has("author");
  if (authorSelected && writingRows.length === 0) return { error: "برای تخصص «مؤلف قرآنی» ثبت حداقل یک اثر الزامی است." };

  /* ---------------- حافظ قرآن: نوع مدرک ---------------- */
  const memorizationCertTypeRaw = field(data, "memorizationCertType", 20);
  const memorizationCertType = memorizationCertTypeRaw && memorizationCertTypeRaw in memorizationCertTypeOptions ? memorizationCertTypeRaw : null;
  if (memorizationCertTypeRaw && !memorizationCertType) return { error: "نوع مدرک حافظ معتبر نیست." };

  /* ---------------- تحصیلات دانشگاهی و حوزوی ---------------- */
  const educationPayload = parseJsonField<{ university: EducationPayload; seminary: EducationPayload }>(String(data.get("education") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const pick = (key: string): EducationPayload | null => {
      const part = record[key];
      if (part === undefined || part === null) return { level: "", field: "", centerName: "", certificate: "", docKey: "" };
      if (typeof part !== "object") return null;
      const value = part as Record<string, unknown>;
      return { level: text(value.level, 60), field: text(value.field, 120), centerName: text(value.centerName, 180), certificate: text(value.certificate, 180), docKey: String(value.docKey || "").slice(0, 40) };
    };
    const university = pick("university"); const seminary = pick("seminary");
    return university && seminary ? { university, seminary } : null;
  }, 1);
  if (educationPayload === null || !educationPayload.length) return { error: "اطلاعات تحصیلی معتبر نیست." };
  const educationRows: Array<{ type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null; docKey: string }> = [];
  for (const type of ["university", "seminary"] as const) {
    const part = educationPayload[0][type];
    if (!part.level) continue;
    if (!(educationLevelOptions[type as EducationType] as readonly string[]).includes(part.level)) return { error: `مقطع تحصیلات ${educationTypeLabels[type as EducationType]} معتبر نیست.` };
    educationRows.push({ type: type as EducationType, level: part.level, field: part.field || null, centerName: part.centerName || null, certificate: part.certificate || null, docKey: part.docKey });
  }

  /* ---------------- سوابق شغلی و همکاری ---------------- */
  const workRows = parseJsonField<WorkRow>(String(data.get("workHistory") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const title = text(record.title, 180);
    const startRaw = text(record.startDate, 20); const endRaw = text(record.endDate, 20);
    if (!title && !startRaw && !endRaw) return null;
    if (title.length < 2) return null;
    const cooperationType = text(record.cooperationType, 40);
    if (cooperationType && !(cooperationType in cooperationTypeOptions)) return null;
    return { title, employer: text(record.employer, 180), cooperationType: cooperationType || "", position: text(record.position, 120), startDate: startRaw, endDate: endRaw, description: text(record.description, 2000), docKey: String(record.docKey || "").slice(0, 40) };
  }, 30);
  if (workRows === null) return { error: "سوابق همکاری و شغلی معتبر نیست." };

  /* ---------------- دوره‌های گذرانده‌شده ---------------- */
  const courseRows = parseJsonField<CourseRow>(String(data.get("courses") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const title = text(record.title, 180);
    const selectedField = text(record.field, 40);
    if (!title && !selectedField) return null;
    if (title.length < 2) return null;
    if (selectedField && !(selectedField in courseFieldOptions)) return null;
    const hours = text(record.hours, 10);
    if (hours && !/^\d{1,4}$/.test(hours)) return null;
    return { title, provider: text(record.provider, 180), field: selectedField, completedDate: text(record.completedDate, 20), hours, docKey: String(record.docKey || "").slice(0, 40) };
  }, 30);
  if (courseRows === null) return { error: "اطلاعات دوره‌های گذرانده‌شده معتبر نیست." };

  /* ---------------- سوابق فعالیت قرآنی (با کشویی وابستهٔ رشته) ---------------- */
  const activityRows = parseJsonField<ActivityRow>(String(data.get("activityRecords") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const kind = text(record.kind, 20);
    const title = text(record.title, 180);
    const selectedField = text(record.field, 40);
    if (!kind && !title) return null;
    if (!(kind in activityRecordKindLabels) || title.length < 2) return null;
    if (selectedField && !(selectedField in courseFieldOptions)) return null;
    if (selectedField && !["teaching", "judging"].includes(kind)) return null;
    return { kind, field: selectedField, title, organization: text(record.organization, 180), position: text(record.position, 120), startDate: text(record.startDate, 20), endDate: text(record.endDate, 20), description: text(record.description, 2000) };
  }, 30);
  if (activityRows === null) return { error: "سوابق فعالیت قرآنی معتبر نیست." };

  /* ---------------- مدارک بارگذاری‌شده (staged) ---------------- */
  const stagedDocs = parseJsonField<StagedDoc>(String(data.get("stagedDocs") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const key = String(record.key || "");
    const name = text(record.name, 180);
    const mime = String(record.mime || "");
    const size = Number(record.size);
    const section = String(record.section || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return null;
    if (!name || !["application/pdf", "image/png", "image/jpeg"].includes(mime)) return null;
    if (!Number.isSafeInteger(size) || size <= 0 || size > 5 * 1024 * 1024) return null;
    if (!/^(photo|evidence|university|seminary|memorization|specialty:[a-z_]+|work:\d+|course:\d+)$/.test(section)) return null;
    return { key, name, mime, size, section };
  }, 20);
  if (stagedDocs === null) return { error: "فهرست مدارک بارگذاری‌شده معتبر نیست." };
  if (stagedDocs.length !== new Set(stagedDocs.map((doc) => doc.key)).size) return { error: "هر فایل فقط یک‌بار باید پیوست شود." };
  const photoDoc = stagedDocs.find((doc) => doc.section === "photo");
  if (!photoDoc) return { error: "تصویر پرسنلی برای ارسال پرونده الزامی است." };
  if (photoDoc.size > 500 * 1024) return { error: "حجم تصویر پرسنلی نباید بیش از ۵۰۰ کیلوبایت باشد." };
  if (photoDoc.mime === "application/pdf") return { error: "تصویر پرسنلی باید PNG یا JPEG باشد." };
  const evidenceDocs = stagedDocs.filter((doc) => doc.section.startsWith("specialty:") || ["evidence", "university", "seminary", "memorization"].includes(doc.section));
  const rowLinkedDocs = stagedDocs.filter((doc) => /^(work|course):\d+$/.test(doc.section));
  if (!evidenceDocs.length) return { error: "برای ارسال پرونده، بارگذاری حداقل یک مدرک پشتیبان (مدرک تحصیلی، گواهی حفظ، گواهی تخصص یا کارت ملی) الزامی است." };
  for (const doc of stagedDocs) {
    const target = path.join(privateDir, "uploads", doc.key);
    try {
      const info = await stat(target);
      if (!info.isFile() || info.size !== doc.size) return { error: "یکی از فایل‌های بارگذاری‌شده یافت نشد؛ دوباره بارگذاری کنید." };
    } catch { return { error: "یکی از فایل‌های بارگذاری‌شده یافت نشد؛ دوباره بارگذاری کنید." }; }
  }
  const specialtyCertKeys = parseJsonField<{ code: string; key: string }>(String(data.get("specialtyCertKeys") || ""), (item) => {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const code = String(record.code || "");
    const key = String(record.key || "");
    return code && chosenCodes.has(code) && key ? { code, key } : null;
  }, 20);
  if (specialtyCertKeys === null) return { error: "پیوند گواهی تخصص‌ها معتبر نیست." };
  const certKeysUsed = new Set(specialtyCertKeys.map((item) => item.key));
  if (certKeysUsed.size !== specialtyCertKeys.length) return { error: "هر گواهی تخصص فقط به یک تخصص متصل می‌شود." };
  const workDocKeys = new Set(workRows.map((row) => row.docKey).filter(Boolean));
  const courseDocKeys = new Set(courseRows.map((row) => row.docKey).filter(Boolean));
  if (rowLinkedDocs.some((doc) => {
    const [kind] = doc.section.split(":");
    const keys = kind === "work" ? workDocKeys : courseDocKeys;
    return !keys.has(doc.key);
  })) return { error: "پیوند مدرک ردیف‌های سابقه/دوره معتبر نیست." };

  /* ---------------- کنترل کد ملی تکراری (فقط پرونده‌های فعال) ---------------- */
  const protectedId = await protectNationalId(nationalId);
  const [activeDuplicate] = await db.select({ id: activists.id })
    .from(activists)
    .where(and(eq(activists.nationalIdHash, protectedId.hash), isNull(activists.deletedAt)))
    .limit(1);
  if (activeDuplicate) return { error: "کد ملی واردشده در سامانه برای یک پروندهٔ فعال قبلاً ثبت شده است؛ ثبت کد ملی تکراری مجاز نیست. اگر پروندهٔ قبلی متعلق به شماست و حذف شده، از مدیر سامانه بخواهید آن را بازیابی کند." };

  /* ---------------- ساخت حساب + پرونده در یک تراکنش ---------------- */
  const fullName = normalizeText(`${firstName} ${lastName}`);
  const otpRequired = !!smsProvider();
  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ fullName, firstName, lastName, email: email || null, passwordHash: await hashPassword(password), role: "activist", phone: mobile, active: !otpRequired }).returning({ id: users.id });
      const [person] = await tx.insert(activists).values({
        firstName, lastName, fatherName: fatherName || null,
        nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4,
        birthDate, gender, phone: mobile, alternatePhone, email: contactEmail || null,
        provinceId, countyId,
        city: field(data, "city", 120) || null,
        postalCode: postalCode || null,
        address: field(data, "address", 1000) || null,
        activityProvinceId, activityCountyId,
        activityPlace: field(data, "activityPlace", 180) || null,
        organization: field(data, "organization", 180) || null,
        job: field(data, "job", 120) || null,
        notes: field(data, "notes", 4000) || null,
        memorizationCertType,
        userId: user.id,
      }).returning({ id: activists.id });
      const [application] = await tx.insert(applications).values({ activistId: person.id, createdBy: user.id, source: "self", status: "pending", submittedAt: new Date() }).returning({ id: applications.id });
      await tx.insert(statusHistory).values({ applicationId: application.id, toStatus: "pending", actorId: user.id, note: "ثبت‌نام یک‌مرحله‌ای؛ پرونده با همهٔ اطلاعات و مدارک برای بررسی ارسال شد" });

      // مدارک: همهٔ فایل‌های staged به پرونده متصل می‌شوند و نگاشت کلید ← شناسه ساخته می‌شود
      const docIdByKey = new Map<string, string>();
      for (const doc of stagedDocs) {
        const docType = doc.section === "university" ? "university_degree"
          : doc.section === "seminary" ? "seminary_certificate"
          : doc.section === "memorization" ? "memorization_certificate"
          : doc.section.startsWith("specialty:") ? "specialty_certificate"
          : doc.section.startsWith("work:") ? "work_cooperation_document"
          : doc.section.startsWith("course:") ? "course_certificate"
          : null;
        const [inserted] = await tx.insert(documents).values({
          applicationId: application.id,
          storageKey: doc.key,
          originalName: doc.name,
          title: doc.section === "photo" ? "تصویر پرسنلی"
            : doc.section === "university" ? "مدرک تحصیلی دانشگاهی"
            : doc.section === "seminary" ? "مدرک تحصیلی حوزوی"
            : doc.section === "memorization" ? "گواهی حفظ قرآن"
            : doc.section.startsWith("specialty:") ? "گواهی تخصص قرآنی"
            : doc.section.startsWith("work:") ? "مدرک سابقه همکاری"
            : doc.section.startsWith("course:") ? "گواهی پایان دوره"
            : "مدرک پشتیبان",
          docType,
          kind: doc.section === "photo" ? "id_photo" : "evidence",
          mimeType: doc.mime,
          size: doc.size,
          uploadedBy: user.id,
        }).returning({ id: documents.id });
        docIdByKey.set(doc.key, inserted.id);
      }
      await tx.update(activists).set({
        photoDocumentId: photoDoc ? docIdByKey.get(photoDoc.key)! : null,
        universityLevel: educationRows.find((row) => row.type === "university")?.level ?? null,
        universityDocumentId: educationRows.find((row) => row.type === "university")?.docKey ? docIdByKey.get(educationRows.find((row) => row.type === "university")!.docKey) ?? null : null,
        seminaryLevel: educationRows.find((row) => row.type === "seminary")?.level ?? null,
        seminaryDocumentId: educationRows.find((row) => row.type === "seminary")?.docKey ? docIdByKey.get(educationRows.find((row) => row.type === "seminary")!.docKey) ?? null : null,
        memorizationDocumentId: stagedDocs.find((doc) => doc.section === "memorization") ? docIdByKey.get(stagedDocs.find((doc) => doc.section === "memorization")!.key) ?? null : null,
        updatedAt: new Date(),
      }).where(eq(activists.id, person.id));

      if (chosen.length) await tx.insert(activistSpecialties).values(chosen.map((specialtyId) => ({ activistId: person.id, specialtyId })));
      if (detailRows.length) {
        const codeToId = new Map(found.map((item) => [item.code, item.id]));
        await tx.insert(activistSpecialtyDetails).values(detailRows.map((item) => ({
          activistId: person.id,
          specialtyId: codeToId.get(item.code)!,
          detailValue: item.value,
          detailOptions: item.options,
          certDocumentId: specialtyCertKeys.find((entry) => entry.code === item.code) ? docIdByKey.get(specialtyCertKeys.find((entry) => entry.code === item.code)!.key) ?? null : null,
        })));
      }
      if (writingRows.length) await tx.insert(activistWritings).values(writingRows.map((item) => ({ ...item, activistId: person.id, createdBy: user.id })));
      if (educationRows.length) await tx.insert(educationRecords).values(educationRows.map((row) => ({
        activistId: person.id, type: row.type, level: row.level, field: row.field, centerName: row.centerName, certificate: row.certificate,
        documentId: row.docKey ? docIdByKey.get(row.docKey) ?? null : null, createdBy: user.id,
      })));
      if (workRows.length) await tx.insert(workHistory).values(workRows.map((row) => ({
        activistId: person.id, title: row.title, employer: row.employer || null,
        cooperationType: row.cooperationType || null,
        position: row.position || null,
        startDate: row.startDate ? jalaliToIso(row.startDate) : null,
        endDate: row.endDate ? jalaliToIso(row.endDate) : null,
        description: row.description || null,
        documentId: row.docKey ? docIdByKey.get(row.docKey) ?? null : null,
        createdBy: user.id,
      })));
      if (courseRows.length) await tx.insert(educationalCourses).values(courseRows.map((row) => ({
        activistId: person.id, title: row.title, provider: row.provider || null,
        field: row.field || null,
        completedDate: row.completedDate ? jalaliToIso(row.completedDate) : null,
        hours: row.hours ? Number(row.hours) : null,
        documentId: row.docKey ? docIdByKey.get(row.docKey) ?? null : null,
        createdBy: user.id,
      })));
      if (activityRows.length) await tx.insert(activityRecords).values(activityRows.map((row) => ({
        activistId: person.id,
        kind: row.kind as typeof activityRecords.$inferInsert.kind,
        title: row.title, organization: row.organization || null, position: row.position || null,
        field: row.field || null,
        startDate: row.startDate ? jalaliToIso(row.startDate) : null,
        endDate: row.endDate ? jalaliToIso(row.endDate) : null,
        description: row.description || null,
        createdBy: user.id,
      })));

      await tx.insert(auditLogs).values({ actorId: user.id, action: "register", targetType: "user", targetId: user.id, detail: "ثبت‌نام یک‌مرحله‌ای با مدارک" });
      await tx.insert(auditLogs).values({ actorId: user.id, action: "submit", targetType: "application", targetId: application.id, detail: "ارسال خودکار پس از ثبت‌نام یک‌مرحله‌ای" });

      // آگاه‌سازی کارکنان بررسی — همان الگوی ارسال پرونده در ویزارد
      const managers = await tx.select().from(users).where(and(inArray(users.role, ["super_admin", "province_admin", "county_admin"]), eq(users.active, true)));
      const recipients = managers.filter((manager) => managerInScope(manager, { provinceId, countyId })).map((manager) => manager.id);
      const notice = await resolveSmsTemplate("case_submitted", { name: fullName, app: "سامانه نور" });
      await notifyUsers(tx, recipients, "پرونده آماده بررسی", "یک پرونده از مسیر ثبت‌نام یک‌مرحله‌ای برای بررسی ارسال شد.", application.id, notice ? { sms: notice.body, smsCategory: notice.category, smsTemplateKey: notice.key } : undefined);
      return { userId: user.id, applicationId: application.id };
    });

    await clearFailures(throttle);
    if (otpRequired) {
      const pendingToken = await db.transaction(async (tx) => {
        const code = await issueMobileVerification(tx, created.userId, mobile);
        await queueSms(tx, mobile, mobileVerificationSms(code).body, { userId: created.userId });
        return issuePendingVerificationToken(tx, created.userId);
      });
      void deliverOutbox();
      redirect(`/register/verify/${pendingToken}`);
    }
    void deliverOutbox();
    await audit(created.userId, "register", "user", created.userId);
    await createSession(created.userId);
    redirect("/dashboard?welcome=1");
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string }; digest?: string };
    if (cause.digest?.startsWith("NEXT_")) throw error;
    if ((cause.code === "23505" || cause.cause?.code === "23505")) return { error: "ثبت ممکن نشد؛ کد ملی یا شماره موبایل/ایمیل واردشده قبلاً برای یک پروندهٔ فعال ثبت شده است." };
    return { error: "ثبت نهایی انجام نشد؛ دوباره تلاش کنید. اگر مشکل ادامه یافت با پشتیبانی تماس بگیرید." };
  }
}
