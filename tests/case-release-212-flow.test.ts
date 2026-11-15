// آزمون‌های جریانی الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای با بارگذاری درون‌بخشی
// مدارک + رفع باگ «کد ملی تکراری پس از حذف پرونده». همان الگوی رسمی آزمون‌های
// feature: اکشن‌های واقعی سرور روی بانک noor_feature با ماک درون‌فرآیندی
// next/headers، next/navigation و next/cache از tests/feature/helpers.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, featureSeed, resetCaseData, closeDb, form, nationalId, type Fixture } from "./feature/helpers";
import { registerCaseAction } from "@/app/actions/register-case";
import { privateDir } from "@/lib/local-secrets";

let f: Fixture;

beforeAll(async () => {
  f = await featureSeed();
  // مسیر پیامکی فعال تا اکشن به‌جای ساخت نشست (نیازمند کوکی واقعی) به صفحهٔ
  // تأیید OTP هدایت کند و در پیام صندوق ثبت شود.
  process.env.KAVENEGAR_API_KEY = "test-key-for-feature";
}, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  // پاک‌سازی اثر آزمون روی فیکسچر اشتراکی: شمارهٔ مدیر استان باید «بدون موبایل»
  // بماند تا آزمون‌های بعدی (یادآورها و خروجی‌ها) که به همین ویژگی تکیه دارند
  // دست‌نخورده اجرا شوند.
  await db.update(s.users).set({ phone: null }).where(eq(s.users.email, "prov@feature.local"));
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

// شماره‌های موبایل یکتا در هر اجرا (app_users.phone یکتاست و فیکسچرها truncate
// نمی‌شوند): پیشوند ۴ رقم + پسوند ۵ رقم زمان اجرا + شمارهٔ ردیف ۲ رقمی = ۱۱ رقم
const runSuffix = String(Date.now()).slice(-5);
let phoneSeq = 0;
const nextMobile = (prefix: string) => `${prefix}${runSuffix}${String(++phoneSeq).padStart(2, "0")}`;

async function buildFormData(nationalIdValue: string, mobile: string, marker: string) {
  const specialtyRows = await db.select().from(s.specialties);
  const memorizer = specialtyRows.find((item) => item.code === "memorizer")!;
  const researcher = specialtyRows.find((item) => item.code === "researcher")!;
  const photo = await stageFile(PNG_BYTES);
  const degree = await stageFile(PDF_BYTES);
  return form({
    firstName: `آزمون${marker}`,
    lastName: "پرونده‌آزمایی",
    mobile,
    email: "",
    password: "Passw0rdCase",
    confirmation: "Passw0rdCase",
    fatherName: "پدرِ آزمون",
    nationalId: nationalIdValue,
    idCardNumber: "123456",
    idIssuePlace: "تهران",
    birthDate: "1380/05/10",
    gender: "female",
    alternatePhone: nextMobile("0912"),
    contactEmail: "",
    provinceId: String(f.tehranProvinceId),
    countyId: String(f.tehranCountyId),
    city: "تهران",
    postalCode: "",
    address: "نشانی آزمون",
    activityProvinceId: "",
    activityCountyId: "",
    activityPlace: "",
    organization: "",
    job: "",
    notes: "",
    memorizationCertType: "specialized",
    specialties: [String(memorizer.id), String(researcher.id)],
    specialtyDetails: JSON.stringify([{ code: "memorizer", value: "3" }]),
    specialtyCertKeys: "[]",
    education: JSON.stringify([
      {
        university: { level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "", docKey: degree.key },
        seminary: { level: "سطح ۲", field: "", centerName: "", certificate: "", docKey: "" },
      },
    ]),
    writings: "[]",
    workHistory: JSON.stringify([{ title: "دبیری آموزش و پرورش", employer: "آموزش و پرورش", cooperationType: "fulltime", position: "دبیر", startDate: "1395/01/01", endDate: "", description: "", docKey: "" }]),
    courses: JSON.stringify([{ title: "دوره تجوید پیشرفته", provider: "کانون نور", field: "tajvid", completedDate: "1402/03/15", hours: "24", docKey: "" }]),
    activityRecords: JSON.stringify([{ kind: "teaching", field: "hifz", title: "تدریس حفظ", organization: "خانه قرآن", position: "مربی", startDate: "1400/01/01", endDate: "", description: "" }]),
    stagedDocs: JSON.stringify([
      { ...photo, section: "photo" },
      { ...degree, section: "university" },
    ]),
  });
}

async function registerThroughAction(nationalIdValue: string, mobile: string, marker: string) {
  const data = await buildFormData(nationalIdValue, mobile, marker);
  const url = await redirectOf(() => registerCaseAction({}, data));
  expect(url).toContain("register/verify");
  const [user] = await db.select().from(s.users).where(eq(s.users.phone, mobile)).limit(1);
  expect(user).toBeTruthy();
  const [person] = await db.select().from(s.activists).where(eq(s.activists.userId, user!.id)).limit(1);
  expect(person).toBeTruthy();
  const [application] = await db.select().from(s.applications).where(eq(s.applications.activistId, person!.id)).limit(1);
  expect(application).toBeTruthy();
  return { user: user!, person: person!, application: application! };
}

describe("الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای", () => {
  it("ثبت کامل با مدارک درون‌بخشی: حساب، پروندهٔ در انتظار بررسی، تحصیلات، همکاری، دوره، سابقه و پیامک", async () => {
    // شمارهٔ مدیر استان تهران تا پیامک «ارسال پرونده برای بررسی» صف شود
    const managerPhone = nextMobile("0935");
    await db.update(s.users).set({ phone: managerPhone }).where(eq(s.users.email, "prov@feature.local"));
    const mobile = nextMobile("0935");
    const { user, person, application } = await registerThroughAction(nationalId(`70001${runSuffix.slice(-3)}1`), mobile, "یک");

    expect(user.role).toBe("activist");
    expect(user.active).toBe(false); // در انتظار تأیید کد پیامکی

    expect(person.universityLevel).toBe("کارشناسی");
    expect(person.seminaryLevel).toBe("سطح ۲");
    expect(person.memorizationCertType).toBe("specialized");
    expect(person.photoDocumentId).toBeTruthy();

    expect(application.status).toBe("pending");
    expect(application.submittedAt).toBeTruthy();
    expect(application.source).toBe("self");

    const docs = await db.select().from(s.documents).where(eq(s.documents.applicationId, application.id));
    expect(docs.length).toBe(2);
    expect(docs.find((item) => item.kind === "id_photo")).toBeTruthy();
    expect(docs.find((item) => item.docType === "university_degree")).toBeTruthy();

    const education = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id));
    expect(education.find((item) => item.type === "university")?.level).toBe("کارشناسی");
    expect(education.find((item) => item.type === "university")?.documentId).toBeTruthy();
    expect(education.find((item) => item.type === "seminary")?.level).toBe("سطح ۲");

    const [workRow] = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id)).limit(1);
    expect(workRow?.cooperationType).toBe("fulltime");
    const [courseRow] = await db.select().from(s.educationalCourses).where(eq(s.educationalCourses.activistId, person.id)).limit(1);
    expect(courseRow?.field).toBe("tajvid");
    const [activityRow] = await db.select().from(s.activityRecords).where(eq(s.activityRecords.activistId, person.id)).limit(1);
    expect(activityRow?.kind).toBe("teaching");
    expect(activityRow?.field).toBe("hifz");

    const otpSms = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.recipient, mobile));
    expect(otpSms.some((item) => item.body.includes("کد تأیید"))).toBe(true);
    const submittedSms = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.recipient, managerPhone));
    expect(submittedSms.some((item) => item.templateKey === "case_submitted")).toBe(true);
  });

  it("کد ملی تکراری برای پروندهٔ فعال مسدود است", async () => {
    const id = nationalId("700012351");
    await registerThroughAction(id, nextMobile("0935"), "دو");
    const data = await buildFormData(id, nextMobile("0935"), "سه");
    const result = await registerCaseAction({}, data);
    expect(result.error || "").toContain("کد ملی");
  });

  it("پس از حذف پرونده (حذف نرم)، ثبت‌نام مجدد با همان کد ملی موفق می‌شود — ریشهٔ باگ ۲.۱۲.۰", async () => {
    const id = nationalId("700012361");
    const { person: first } = await registerThroughAction(id, nextMobile("0935"), "چهار");
    // همان کاری که deleteCaseAction در حالت «حذف از فهرست فعال» می‌کند
    const now = new Date();
    await db.update(s.applications).set({ deletedAt: now }).where(eq(s.applications.activistId, first.id));
    await db.update(s.activists).set({ deletedAt: now }).where(eq(s.activists.id, first.id));
    // ثبت‌نام مجدد با همان کد ملی: پیش از ۲.۱۲.۰ با خطای «کد ملی تکراری» مسدود می‌شد
    const { person: second } = await registerThroughAction(id, nextMobile("0935"), "پنج");
    expect(second.id).not.toBe(first.id);
  });

  it("بازیابی دو ردیف فعال با یک کد ملی در سطح دیتابیس مسدود است (یکتای جزئی)", async () => {
    const id = nationalId("700012371");
    const { person: first } = await registerThroughAction(id, nextMobile("0935"), "شش");
    const now = new Date();
    await db.update(s.applications).set({ deletedAt: now }).where(eq(s.applications.activistId, first.id));
    await db.update(s.activists).set({ deletedAt: now }).where(eq(s.activists.id, first.id));
    await registerThroughAction(id, nextMobile("0935"), "هفت");
    // بازیابی رکورد اول باید با نقض ایندکس یکتای جزئی (23505) شکست بخورد
    await db.update(s.applications).set({ deletedAt: null }).where(eq(s.applications.activistId, first.id));
    let violated = false;
    try {
      await db.update(s.activists).set({ deletedAt: null }).where(eq(s.activists.id, first.id));
    } catch (error) {
      const cause = error as { code?: string; cause?: { code?: string } };
      violated = cause.code === "23505" || cause.cause?.code === "23505";
    }
    expect(violated).toBe(true);
  });
});
