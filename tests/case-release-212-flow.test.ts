// آزمون‌های جریانی الحاقیهٔ ۲.۱۴.۰ — تفکیک ثبت‌نام از پرونده:
// ۱) /register فقط حساب کاربری می‌سازد (بدون پرونده، با پیامک OTP).
// ۲) پرونده فقط از مسیر ویزارد /cases/new برای کاربر واردشده ساخته می‌شود و
//    همهٔ قابلیت‌های فرم قبلی ثبت‌نام (تحصیلات با مدرک، سابقهٔ همکاری با نوع
//    همکاری و مدرک، دوره‌ها، سوابق فعالیت قرآنی، مدرک حافظ، گواهی تخصص‌ها و
//    پنجرهٔ اجزای حفظ) در مرحلهٔ ۳ ویزارد با همان ستون‌های قبلی کار می‌کند.
// ۳) کد ملی تکراری برای پروندهٔ فعال مسدود است و پس از حذف نرم آزاد می‌شود.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, featureSeed, resetCaseData, closeDb, form, nationalId, type Fixture } from "./feature/helpers";
import { registerAction } from "@/app/actions/auth";
import { createSession } from "@/lib/auth";
import { saveIdentityStepAction, saveLocationStepAction, saveSpecialtiesStepAction } from "@/app/actions/case-steps";
import { privateDir } from "@/lib/local-secrets";

let f: Fixture;

beforeAll(async () => {
  f = await featureSeed();
  process.env.KAVENEGAR_API_KEY = "test-key-for-feature";
}, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  delete process.env.KAVENEGAR_API_KEY;
  await closeDb();
});

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

/** همانی که /api/register/upload انجام می‌دهد: فایل روی دیسک، کلید برای اکشن. */
async function stageFile(bytes: Buffer): Promise<{ key: string; name: string; mime: string; size: number }> {
  const key = crypto.randomUUID();
  const directory = path.join(privateDir, "uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, key), bytes, { flag: "wx", mode: 0o600 });
  return { key, name: `file-${key.slice(0, 8)}.bin`, mime: bytes[0] === 0x89 ? "image/png" : "application/pdf", size: bytes.length };
}

// شماره‌های موبایل یکتا در هر اجرا (app_users.phone یکتاست و فیکسچرها truncate نمی‌شوند)
const runSuffix = String(Date.now()).slice(-5);
let phoneSeq = 0;
const nextMobile = (prefix: string) => `${prefix}${runSuffix}${String(++phoneSeq).padStart(2, "0")}`;

/** ثبت‌نام حساب از مسیر جدید /register (فقط حساب، بدون پرونده). */
async function registerAccount(mobile: string, marker: string) {
  const url = await redirectOf(() => registerAction({}, form({
    firstName: `آزمون${marker}`, lastName: "حساب‌آزمایی",
    email: "", mobile, password: "Passw0rdCase", confirmation: "Passw0rdCase",
  })));
  expect(url).toContain("register/verify");
  const [user] = await db.select().from(s.users).where(eq(s.users.phone, mobile)).limit(1);
  expect(user).toBeTruthy();
  return user!;
}

async function loginDbUser(user: { id: string }) {
  // معادل گام تأیید OTP: حساب فعال می‌شود (پیامک در آزمون ثبت حساب در صندوق بررسی شده است)
  await db.update(s.users).set({ active: true }).where(eq(s.users.id, user.id));
  await createSession(user.id);
}

/** مرحلهٔ هویتی + مکانی ویزارد برای کاربر واردشده (بدون caseId = ساخت پروندهٔ تازه). */
async function createCaseThroughWizard(identity: Record<string, string>) {
  const identityData = form({
    caseId: "", dupAck: "yes",
    firstName: identity.firstName, lastName: identity.lastName, fatherName: identity.fatherName,
    nationalId: identity.nationalId, idCardNumber: "123456", idIssuePlace: "تهران",
    birthDate: "1380/05/10", gender: "female",
    phone: identity.phone, alternatePhone: nextMobile("0912"), contactEmail: "",
  });
  const url = await redirectOf(() => saveIdentityStepAction({}, identityData));
  const caseId = url.split("/cases/")[1]?.split("/")[0] || "";
  expect(caseId).toBeTruthy();
  await redirectOf(() => saveLocationStepAction({}, form({
    caseId, provinceId: String(f.tehranProvinceId), countyId: String(f.tehranCountyId),
    city: "تهران", postalCode: "", address: "نشانی آزمون",
    activityProvinceId: "", activityCountyId: "", activityPlace: "", organization: "",
  })));
  return caseId;
}

describe("الحاقیهٔ ۲.۱۴.۰ — ثبت‌نام فقط حساب کاربری", () => {
  it("ثبت‌نام حساب: کاربر ساخته می‌شود، پیامک OTP می‌رود و هیچ پرونده‌ای ایجاد نمی‌شود", async () => {
    const mobile = nextMobile("0936");
    const user = await registerAccount(mobile, "حساب");
    expect(user.role).toBe("activist");
    expect(user.active).toBe(false); // در انتظار تأیید کد پیامکی
    const [person] = await db.select().from(s.activists).where(eq(s.activists.userId, user.id)).limit(1);
    expect(person).toBeUndefined(); // بدون پرونده در ثبت‌نام
    const otpSms = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.recipient, mobile));
    expect(otpSms.some((item) => item.body.includes("کد تأیید"))).toBe(true);
  });

  it("موبایل تکراری حساب فعال ثبت‌نام نمی‌شود", async () => {
    const mobile = nextMobile("0936");
    await registerAccount(mobile, "اول");
    const result = await registerAction({}, form({
      firstName: "دوم", lastName: "حساب‌آزمایی", email: "", mobile,
      password: "Passw0rdCase", confirmation: "Passw0rdCase",
    }));
    expect(result.error || "").toContain("ثبت‌نام ممکن نشد");
  });
});

describe("الحاقیهٔ ۲.۱۴.۰ — ساخت پرونده در ویزارد با همهٔ قابلیت‌های منتقل‌شده", () => {
  it("مرحلهٔ ۳ ویزارد: تحصیلات با مدرک، سابقهٔ همکاری، دوره، فعالیت، مدرک حافظ، گواهی تخصص و اجزای حفظ", async () => {
    const user = await registerAccount(nextMobile("0936"), "صاحب");
    await loginDbUser(user);
    const caseId = await createCaseThroughWizard({
      firstName: "حافظ", lastName: "ویزاردآزمون", fatherName: "پدرِ آزمون",
      nationalId: nationalId(`70001${runSuffix.slice(-3)}1`), phone: nextMobile("0933"),
    });
    const memorizer = (await db.select().from(s.specialties)).find((item) => item.code === "memorizer")!;
    const researcher = (await db.select().from(s.specialties)).find((item) => item.code === "researcher")!;
    const degree = await stageFile(PDF_BYTES);
    const seminaryDoc = await stageFile(PDF_BYTES);
    const workDoc = await stageFile(PDF_BYTES);
    const courseDoc = await stageFile(PDF_BYTES);
    const memorizationDoc = await stageFile(PDF_BYTES);
    const certDoc = await stageFile(PDF_BYTES);
    const url = await redirectOf(() => saveSpecialtiesStepAction({}, form({
      caseId,
      specialties: [String(memorizer.id), String(researcher.id)],
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "5", juz: "1,2,5,12,20" }]),
      educationRecords: JSON.stringify([
        { type: "university", level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "", docKey: degree.key },
        { type: "seminary", level: "سطح ۲", field: "", centerName: "", certificate: "", docKey: seminaryDoc.key },
      ]),
      writings: "[]",
      workHistory: JSON.stringify([{ title: "دبیری آموزش و پرورش", employer: "آموزش و پرورش", cooperationType: "fulltime", position: "دبیر", startDate: "1395/01/01", endDate: "", description: "", docKey: workDoc.key }]),
      courses: JSON.stringify([{ title: "دوره تجوید پیشرفته", provider: "کانون نور", field: "tajvid", completedDate: "1402/03/15", hours: "24", docKey: courseDoc.key }]),
      activityRecords: JSON.stringify([{ kind: "teaching", field: "hifz", title: "تدریس حفظ", organization: "خانه قرآن", position: "مربی", startDate: "1400/01/01", endDate: "", description: "" }]),
      stagedDocs: JSON.stringify([
        { ...degree, section: "education:0" },
        { ...seminaryDoc, section: "education:1" },
        { ...workDoc, section: "work:0" },
        { ...courseDoc, section: "course:0" },
        { ...memorizationDoc, section: "memorization" },
        { ...certDoc, section: `specialty:memorizer` },
      ]),
      specialtyCertKeys: JSON.stringify([{ code: "memorizer", key: certDoc.key }]),
      memorizationCertType: "specialized",
      job: "معلم", notes: "",
    })));
    expect(url).toContain("/steps/4");

    const [application] = await db.select().from(s.applications).where(eq(s.applications.id, caseId)).limit(1);
    expect(application!.status).toBe("completing");
    const [person] = await db.select().from(s.activists).where(eq(s.activists.userId, user.id)).limit(1);
    expect(person!.universityLevel).toBe("کارشناسی");
    expect(person!.seminaryLevel).toBe("سطح ۲");
    expect(person!.memorizationCertType).toBe("specialized");
    expect(person!.memorizationDocumentId).toBeTruthy();

    const docs = await db.select().from(s.documents).where(eq(s.documents.applicationId, caseId));
    expect(docs.find((item) => item.docType === "university_degree")).toBeTruthy();
    expect(docs.find((item) => item.docType === "seminary_certificate")).toBeTruthy();
    expect(docs.find((item) => item.docType === "work_cooperation_document")).toBeTruthy();
    expect(docs.find((item) => item.docType === "course_certificate")).toBeTruthy();
    expect(docs.find((item) => item.docType === "memorization_certificate")).toBeTruthy();
    expect(docs.find((item) => item.docType === "specialty_certificate")).toBeTruthy();

    const education = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person!.id));
    expect(education.find((item) => item.type === "university")?.documentId).toBeTruthy();
    expect(education.find((item) => item.type === "seminary")?.documentId).toBeTruthy();
    const [workRow] = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person!.id)).limit(1);
    expect(workRow?.cooperationType).toBe("fulltime");
    expect(workRow?.documentId).toBeTruthy();
    const [courseRow] = await db.select().from(s.educationalCourses).where(eq(s.educationalCourses.activistId, person!.id)).limit(1);
    expect(courseRow?.field).toBe("tajvid");
    expect(courseRow?.documentId).toBeTruthy();
    const [activityRow] = await db.select().from(s.activityRecords).where(eq(s.activityRecords.activistId, person!.id)).limit(1);
    expect(activityRow?.kind).toBe("teaching");
    expect(activityRow?.field).toBe("hifz");
    const [detail] = await db.select().from(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, person!.id)).limit(1);
    expect(detail!.detailValue).toBe("5");
    expect(detail!.juzParts).toBe("1,2,5,12,20");
    expect(detail!.certDocumentId).toBeTruthy();
  });

  it("عدم تطابق تعداد اجزای حفظ در ویزارد پذیرفته نمی‌شود", async () => {
    const user = await registerAccount(nextMobile("0936"), "ناهم‌خوان");
    await loginDbUser(user);
    const caseId = await createCaseThroughWizard({
      firstName: "حافظ", lastName: "ناهم‌خوان", fatherName: "پدر",
      nationalId: nationalId(`70001${runSuffix.slice(-3)}2`), phone: nextMobile("0933"),
    });
    const memorizer = (await db.select().from(s.specialties)).find((item) => item.code === "memorizer")!;
    const result = await saveSpecialtiesStepAction({}, form({
      caseId,
      specialties: [String(memorizer.id)],
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "5", juz: "1,2" }]),
      educationRecords: "[]", writings: "[]", workHistory: "[]", courses: "[]", activityRecords: "[]",
      stagedDocs: "[]", specialtyCertKeys: "[]", job: "", notes: "",
    }));
    expect(result.error || "").toContain("معتبر نیست");
  });
});

describe("الحاقیهٔ ۲.۱۴.۰ — کد ملی تکراری و حذف نرم (ریشهٔ باگ ۲.۱۲.۰ در مسیر جدید)", () => {
  it("کد ملی پروندهٔ فعال برای کاربر دیگر مسدود است", async () => {
    const id = nationalId(`70002${runSuffix.slice(-3)}1`);
    const firstUser = await registerAccount(nextMobile("0936"), "اول‌ملی");
    await loginDbUser(firstUser);
    await createCaseThroughWizard({ firstName: "اول", lastName: "ملی‌آزمون", fatherName: "پدر", nationalId: id, phone: nextMobile("0933") });

    // کاربر دوم با همان کد ملی: هشدار تکراری بودن و پس از تأیید، مسدودی قطعی در سطح دیتابیس
    const secondUser = await registerAccount(nextMobile("0936"), "دوم‌ملی");
    await loginDbUser(secondUser);
    const warning = await saveIdentityStepAction({}, form({
      caseId: "", dupAck: "", firstName: "دوم", lastName: "ملی‌آزمون", fatherName: "پدر",
      nationalId: id, idCardNumber: "123456", idIssuePlace: "تهران", birthDate: "1380/05/10",
      gender: "female", phone: nextMobile("0933"), alternatePhone: nextMobile("0912"), contactEmail: "",
    }));
    expect(warning.warning).toBe(true);
    const blocked = await saveIdentityStepAction({}, form({
      caseId: "", dupAck: "yes", firstName: "دوم", lastName: "ملی‌آزمون", fatherName: "پدر",
      nationalId: id, idCardNumber: "123456", idIssuePlace: "تهران", birthDate: "1380/05/10",
      gender: "female", phone: nextMobile("0933"), alternatePhone: nextMobile("0912"), contactEmail: "",
    }));
    expect(blocked.error || "").toContain("کد ملی");
  });

  it("پس از حذف نرم پرونده، ایجاد پرونده با همان کد ملی موفق می‌شود", async () => {
    const id = nationalId(`70002${runSuffix.slice(-3)}2`);
    const firstUser = await registerAccount(nextMobile("0936"), "حذف‌اول");
    await loginDbUser(firstUser);
    const caseId = await createCaseThroughWizard({ firstName: "حذف", lastName: "ملی‌آزمون", fatherName: "پدر", nationalId: id, phone: nextMobile("0933") });
    const now = new Date();
    await db.update(s.applications).set({ deletedAt: now }).where(eq(s.applications.id, caseId));
    const [firstPerson] = await db.select().from(s.activists).where(eq(s.activists.userId, firstUser.id)).limit(1);
    await db.update(s.activists).set({ deletedAt: now }).where(eq(s.activists.id, firstPerson!.id));

    const secondUser = await registerAccount(nextMobile("0936"), "حذف‌دوم");
    await loginDbUser(secondUser);
    const secondCaseId = await createCaseThroughWizard({ firstName: "حذف۲", lastName: "ملی‌آزمون", fatherName: "پدر", nationalId: id, phone: nextMobile("0933") });
    expect(secondCaseId).toBeTruthy();
    expect(secondCaseId).not.toBe(caseId);
  });

  it("بازیابی دو ردیف فعال با یک کد ملی در سطح دیتابیس مسدود است (یکتای جزئی)", async () => {
    const id = nationalId(`70002${runSuffix.slice(-3)}3`);
    const firstUser = await registerAccount(nextMobile("0936"), "یکتااول");
    await loginDbUser(firstUser);
    const caseId = await createCaseThroughWizard({ firstName: "یکتا", lastName: "ملی‌آزمون", fatherName: "پدر", nationalId: id, phone: nextMobile("0933") });
    const now = new Date();
    await db.update(s.applications).set({ deletedAt: now }).where(eq(s.applications.id, caseId));
    const [firstPerson] = await db.select().from(s.activists).where(eq(s.activists.userId, firstUser.id)).limit(1);
    await db.update(s.activists).set({ deletedAt: now }).where(eq(s.activists.id, firstPerson!.id));

    const secondUser = await registerAccount(nextMobile("0936"), "یکتادوم");
    await loginDbUser(secondUser);
    const secondCaseId = await createCaseThroughWizard({ firstName: "یکتا۲", lastName: "ملی‌آزمون", fatherName: "پدر", nationalId: id, phone: nextMobile("0933") });
    expect(secondCaseId).toBeTruthy();
    await db.update(s.applications).set({ deletedAt: null }).where(eq(s.applications.id, caseId));
    let violated = false;
    try {
      await db.update(s.activists).set({ deletedAt: null }).where(eq(s.activists.id, firstPerson!.id));
    } catch (error) {
      const cause = error as { code?: string; cause?: { code?: string } };
      violated = cause.code === "23505" || cause.cause?.code === "23505";
    }
    expect(violated).toBe(true);
  });
});
