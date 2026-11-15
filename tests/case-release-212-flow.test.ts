import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { counties, provinces, specialties } from "@/db/schema";
import { applications, activists, documents, educationRecords, educationalCourses, messageOutbox, users, workHistory, activityRecords } from "@/db/schema";
import { registerCaseAction } from "@/app/actions/register-case";
import { initialActionState } from "@/lib/action-state";
import { ensureReferenceData } from "@/lib/data";
import { validNationalId } from "@/lib/format";
import { privateDir } from "@/lib/local-secrets";

// الحاقیهٔ ۲.۱۲.۰ — آزمون جریان ثبت‌نام یک‌مرحله‌ای + رفع باگ «کد ملی تکراری
// پس از حذف پرونده». پیش‌فرض: scripts/setup-feature-db.js پیش از اجرای آزمون‌ها
// بانک آزمون را از صفر می‌سازد و مسیر پیامک با KAVENEGAR_API_KEY موقت فعال
// می‌شود تا اکشن به‌جای ساخت نشست (نیازمند کوکی) به صفحهٔ تأیید OTP هدایت کند.

let idCounter = 4100;
/** کد ملی معتبرِ یکتا با رقم کنترل درست؛ هر فراخوانی متمایز. */
function nextValidNationalId(): string {
  for (;;) {
    const base = `7${String(++idCounter).padStart(8, "0")}`;
    const remainder = base.split("").reduce((sum, digit, position) => sum + Number(digit) * (10 - position), 0) % 11;
    const control = remainder < 2 ? remainder : 11 - remainder;
    const candidate = `${base}${control}`;
    if (validNationalId(candidate)) return candidate;
  }
}
let phoneCounter = 35100000;
const nextMobile = (prefix: string) => `${prefix}${String(++phoneCounter)}`;

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

async function stageFile(bytes: Buffer): Promise<{ key: string; name: string; mime: string; size: number }> {
  const key = crypto.randomUUID();
  const directory = path.join(privateDir, "uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, key), bytes, { flag: "wx", mode: 0o600 });
  return { key, name: `file-${key.slice(0, 8)}.bin`, mime: bytes[0] === 0x89 ? "image/png" : "application/pdf", size: bytes.length };
}

async function buildFormData(nationalId: string, mobile: string, marker: string) {
  const [tehran] = await db.select().from(provinces).where(eq(provinces.name, "تهران")).limit(1);
  const [tehranCounty] = await db.select().from(counties).where(eq(counties.provinceId, tehran!.id)).limit(1);
  const specialtyRows = await db.select().from(specialties);
  const memorizer = specialtyRows.find((item) => item.code === "memorizer")!;
  const researcher = specialtyRows.find((item) => item.code === "researcher")!;
  const photo = await stageFile(PNG_BYTES);
  const degree = await stageFile(PDF_BYTES);
  const data = new FormData();
  data.set("firstName", `آزمون${marker}`);
  data.set("lastName", "پرونده‌آزمایی");
  data.set("mobile", mobile);
  data.set("email", "");
  data.set("password", "Passw0rdCase");
  data.set("confirmation", "Passw0rdCase");
  data.set("fatherName", "پدرِ آزمون");
  data.set("nationalId", nationalId);
  data.set("idCardNumber", "123456");
  data.set("idIssuePlace", "تهران");
  data.set("birthDate", "1380/05/10");
  data.set("gender", "female");
  data.set("alternatePhone", nextMobile("0912"));
  data.set("contactEmail", "");
  data.set("provinceId", String(tehran!.id));
  data.set("countyId", String(tehranCounty!.id));
  data.set("city", "تهران");
  data.set("postalCode", "");
  data.set("address", "نشانی آزمون");
  data.set("activityProvinceId", "");
  data.set("activityCountyId", "");
  data.set("activityPlace", "");
  data.set("organization", "");
  data.set("job", "");
  data.set("notes", "");
  data.set("memorizationCertType", "specialized");
  data.append("specialties", String(memorizer.id));
  data.append("specialties", String(researcher.id));
  data.set("specialtyDetails", JSON.stringify([{ code: "memorizer", value: "3" }]));
  data.set("specialtyCertKeys", "[]");
  data.set("education", JSON.stringify([{ university: { level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "", docKey: degree.key }, seminary: { level: "سطح ۲", field: "", centerName: "", certificate: "", docKey: "" } }]));
  data.set("writings", "[]");
  data.set("workHistory", JSON.stringify([{ title: "دبیری آموزش و پرورش", employer: "آموزش و پرورش", cooperationType: "fulltime", position: "دبیر", startDate: "1395/01/01", endDate: "", description: "", docKey: "" }]));
  data.set("courses", JSON.stringify([{ title: "دوره تجوید پیشرفته", provider: "کانون نور", field: "tajvid", completedDate: "1402/03/15", hours: "24", docKey: "" }]));
  data.set("activityRecords", JSON.stringify([{ kind: "teaching", field: "hifz", title: "تدریس حفظ", organization: "خانه قرآن", position: "مربی", startDate: "1400/01/01", endDate: "", description: "" }]));
  data.set("stagedDocs", JSON.stringify([
    { ...photo, section: "photo" },
    { ...degree, section: "university" },
  ]));
  return data;
}

/** فراخوانی اکشن و انتظار پرتاب NEXT_REDIRECT (هدایت به صفحهٔ تأیید پیامکی). */
async function expectRedirect(action: Promise<unknown>): Promise<string> {
  try {
    await action;
    throw new Error("expected NEXT_REDIRECT");
  } catch (error) {
    const digest = (error as { digest?: string }).digest || "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest;
  }
}

async function registerThroughAction(nationalId: string, mobile: string, marker: string) {
  const digest = await expectRedirect(registerCaseAction(initialActionState, await buildFormData(nationalId, mobile, marker)));
  expect(digest).toContain("register/verify");
  const [user] = await db.select().from(users).where(eq(users.phone, mobile)).limit(1);
  expect(user).toBeTruthy();
  const [person] = await db.select().from(activists).where(eq(activists.userId, user!.id)).limit(1);
  expect(person).toBeTruthy();
  const [application] = await db.select().from(applications).where(eq(applications.activistId, person!.id)).limit(1);
  return { user: user!, person: person!, application: application! };
}

describe("الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای", () => {
  const savedKavenegar = process.env.KAVENEGAR_API_KEY;
  beforeAll(async () => {
    await ensureReferenceData();
    process.env.KAVENEGAR_API_KEY = "test-key-for-feature";
  });
  afterAll(() => {
    if (savedKavenegar === undefined) delete process.env.KAVENEGAR_API_KEY;
    else process.env.KAVENEGAR_API_KEY = savedKavenegar;
  });

  it("ثبت کامل با مدارک درون‌بخشی: حساب، پروندهٔ در انتظار بررسی، تحصیلات، همکاری، دوره، سابقه و پیامک", async () => {
    const mobile = nextMobile("0935");
    const { user, person, application } = await registerThroughAction(nextValidNationalId(), mobile, "یک");
    expect(user.role).toBe("activist");
    expect(user.active).toBe(false); // در انتظار تأیید کد پیامکی

    expect(person.universityLevel).toBe("کارشناسی");
    expect(person.seminaryLevel).toBe("سطح ۲");
    expect(person.memorizationCertType).toBe("specialized");
    expect(person.photoDocumentId).toBeTruthy();

    expect(application.status).toBe("pending");
    expect(application.submittedAt).toBeTruthy();
    expect(application.source).toBe("self");

    const docs = await db.select().from(documents).where(eq(documents.applicationId, application.id));
    expect(docs.length).toBe(2);
    expect(docs.find((item) => item.kind === "id_photo")).toBeTruthy();
    expect(docs.find((item) => item.docType === "university_degree")).toBeTruthy();

    const education = await db.select().from(educationRecords).where(eq(educationRecords.activistId, person.id));
    expect(education.find((item) => item.type === "university")?.level).toBe("کارشناسی");
    expect(education.find((item) => item.type === "university")?.documentId).toBeTruthy();
    expect(education.find((item) => item.type === "seminary")?.level).toBe("سطح ۲");

    const [workRow] = await db.select().from(workHistory).where(eq(workHistory.activistId, person.id)).limit(1);
    expect(workRow?.cooperationType).toBe("fulltime");
    const [courseRow] = await db.select().from(educationalCourses).where(eq(educationalCourses.activistId, person.id)).limit(1);
    expect(courseRow?.field).toBe("tajvid");
    const [activityRow] = await db.select().from(activityRecords).where(eq(activityRecords.activistId, person.id)).limit(1);
    expect(activityRow?.kind).toBe("teaching");
    expect(activityRow?.field).toBe("hifz");

    const otpSms = await db.select().from(messageOutbox).where(eq(messageOutbox.recipient, mobile));
    expect(otpSms.some((item) => item.body.includes("کد تأیید"))).toBe(true);
    const submittedSms = await db.select().from(messageOutbox).where(eq(messageOutbox.applicationId, application.id));
    expect(submittedSms.some((item) => item.templateKey === "case_submitted")).toBe(true);
  });

  it("کد ملی تکراری برای پروندهٔ فعال مسدود است", async () => {
    const nationalId = nextValidNationalId();
    await registerThroughAction(nationalId, nextMobile("0936"), "دو");
    const result = await registerCaseAction(initialActionState, await buildFormData(nationalId, nextMobile("0936"), "سه"));
    const error = (result as { error?: string }).error || "";
    expect(error).toContain("کد ملی");
  });

  it("پس از حذف پرونده (حذف نرم)، ثبت‌نام مجدد با همان کد ملی موفق می‌شود — ریشهٔ باگ ۲.۱۲.۰", async () => {
    const nationalId = nextValidNationalId();
    const { person } = await registerThroughAction(nationalId, nextMobile("0937"), "چهار");
    // همان کاری که deleteCaseAction در حالت «حذف از فهرست فعال» می‌کند
    const now = new Date();
    await db.update(applications).set({ deletedAt: now }).where(eq(applications.activistId, person.id));
    await db.update(activists).set({ deletedAt: now }).where(eq(activists.id, person.id));
    // ثبت‌نام مجدد با همان کد ملی: پیش از ۲.۱۲.۰ با 23505 مسدود می‌شد
    const { person: restored } = await registerThroughAction(nationalId, nextMobile("0937"), "پنج");
    expect(restored.id).not.toBe(person.id);
  });

  it("بازیابی دو ردیف فعال با یک کد ملی در سطح دیتابیس مسدود است (یکتای جزئی)", async () => {
    const nationalId = nextValidNationalId();
    const { person: first } = await registerThroughAction(nationalId, nextMobile("0938"), "شش");
    const now = new Date();
    await db.update(applications).set({ deletedAt: now }).where(eq(applications.activistId, first.id));
    await db.update(activists).set({ deletedAt: now }).where(eq(activists.id, first.id));
    const { person: second } = await registerThroughAction(nationalId, nextMobile("0938"), "هفت");
    // بازیابی رکورد اول باید با نقض ایندکس یکتای جزئی (23505) شکست بخورد
    await db.update(applications).set({ deletedAt: null }).where(eq(applications.activistId, first.id));
    let violated = false;
    try {
      await db.update(activists).set({ deletedAt: null }).where(eq(activists.id, first.id));
    } catch (error) {
      const cause = error as { code?: string; cause?: { code?: string } };
      violated = cause.code === "23505" || cause.cause?.code === "23505";
    }
    expect(violated).toBe(true);
    void second;
  });
});
