// آزمون‌های جریانی الحاقیهٔ ۲.۱۳.۰ — انتخاب تعاملی اجزای حفظ قرآن:
// پنجرهٔ انتخاب ۳۰ جزء با تعداد دقیق، ذخیرهٔ شمارهٔ جزءها در دیتابیس،
// نمایش در پروفایل (دوزیه) و مسدود شدن عدم تطابق تعداد در دو مسیر
// ثبت‌نام عمومی و ویزارد. همان الگوی رسمی آزمون‌های feature.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, caseIdOf, completeProfile, featureSeed, loginAs, nationalId,
  resetCaseData, closeDb, form, type Fixture,
} from "./feature/helpers";
import { registerCaseAction } from "@/app/actions/register-case";
import { saveCaseCore } from "@/lib/case-save";
import { saveSpecialtiesStepAction } from "@/app/actions/case-steps";
import { loadDossier } from "@/lib/dossier";
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

async function stageFile(bytes: Buffer, name: string, mime: string): Promise<{ key: string; name: string; mime: string; size: number }> {
  const key = crypto.randomUUID();
  const directory = path.join(privateDir, "uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, key), bytes, { flag: "wx", mode: 0o600 });
  return { key, name, mime, size: bytes.length };
}

// شماره‌های موبایل یکتا در هر اجرا (app_users.phone یکتاست)
const runSuffix = String(Date.now()).slice(-5);
let phoneSeq = 0;
const nextMobile = (prefix: string) => `${prefix}${runSuffix}${String(++phoneSeq).padStart(2, "0")}`;

async function memorizerId(): Promise<number> {
  const rows = await db.select().from(s.specialties);
  return rows.find((item) => item.code === "memorizer")!.id;
}

async function registerData(nationalIdValue: string, mobile: string, specialtyDetails: string) {
  const photo = await stageFile(PNG_BYTES, "photo.bin", "image/png");
  const degree = await stageFile(PDF_BYTES, "degree.bin", "application/pdf");
  return form({
    firstName: "حافظ", lastName: "جزءهای‌آزمون", mobile, email: "",
    password: "Passw0rdCase", confirmation: "Passw0rdCase",
    fatherName: "پدر", nationalId: nationalIdValue, idCardNumber: "123456", idIssuePlace: "تهران",
    birthDate: "1380/05/10", gender: "female", alternatePhone: nextMobile("0912"), contactEmail: "",
    provinceId: String(f.tehranProvinceId), countyId: String(f.tehranCountyId), city: "تهران", postalCode: "", address: "نشانی آزمون",
    activityProvinceId: "", activityCountyId: "", activityPlace: "", organization: "", job: "", notes: "",
    memorizationCertType: "specialized",
    specialties: [String(await memorizerId())],
    specialtyDetails,
    specialtyCertKeys: "[]",
    education: JSON.stringify([{ university: { level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "", docKey: degree.key }, seminary: { level: "", field: "", centerName: "", certificate: "", docKey: "" } }]),
    writings: "[]", workHistory: "[]", courses: "[]", activityRecords: "[]",
    stagedDocs: JSON.stringify([
      { ...photo, section: "photo" },
      { ...degree, section: "university" },
    ]),
  });
}

async function activistIdOfPhone(mobile: string): Promise<string> {
  const [user] = await db.select().from(s.users).where(eq(s.users.phone, mobile)).limit(1);
  const [person] = await db.select().from(s.activists).where(eq(s.activists.userId, user!.id)).limit(1);
  return person!.id;
}

describe("الحاقیهٔ ۲.۱۳.۰ — اجزای حفظ قرآن در ثبت‌نام عمومی", () => {
  it("ثبت‌نام با تأیید پنجرهٔ اجزا: شمارهٔ دقیق جزءها در دیتابیس ذخیره می‌شود", async () => {
    const mobile = nextMobile("0935");
    const data = await registerData(nationalId("700014311"), mobile, JSON.stringify([{ code: "memorizer", value: "5", juz: "20,5,12,1,2" }]));
    const url = await redirectOf(() => registerCaseAction({}, data));
    expect(url).toContain("register/verify");
    const personId = await activistIdOfPhone(mobile);
    const [detail] = await db.select().from(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, personId)).limit(1);
    expect(detail!.detailValue).toBe("5");
    expect(detail!.juzParts).toBe("1,2,5,12,20"); // مرتب‌شده در سطح سرور
  });

  it("عدم تطابق تعداد (اعلام ۵، انتخاب ۳) در ثبت‌نام پذیرفته نمی‌شود", async () => {
    const mobile = nextMobile("0935");
    const data = await registerData(nationalId("700014321"), mobile, JSON.stringify([{ code: "memorizer", value: "5", juz: "1,2,3" }]));
    const result = await registerCaseAction({}, data);
    expect(result.error || "").toContain("هم‌خوانی ندارد");
  });

  it("بدون تأیید پنجرهٔ انتخاب (بدون juz) ثبت‌نام متوقف می‌شود", async () => {
    const mobile = nextMobile("0935");
    const data = await registerData(nationalId("700014331"), mobile, JSON.stringify([{ code: "memorizer", value: "5" }]));
    const result = await registerCaseAction({}, data);
    expect(result.error || "").toContain("جزءهای حفظ‌شده");
  });

  it("«حفظ کل قرآن»: هر ۳۰ جزء خودکار ذخیره می‌شود", async () => {
    const mobile = nextMobile("0935");
    const data = await registerData(nationalId("700014341"), mobile, JSON.stringify([{ code: "memorizer", value: "complete" }]));
    await redirectOf(() => registerCaseAction({}, data));
    const personId = await activistIdOfPhone(mobile);
    const [detail] = await db.select().from(s.activistSpecialtyDetails).where(eq(s.activistSpecialtyDetails.activistId, personId)).limit(1);
    expect(detail!.detailValue).toBe("complete");
    expect(detail!.juzParts!.split(",").length).toBe(30);
    expect(detail!.juzParts!.endsWith("29,30")).toBe(true);
  });
});

describe("الحاقیهٔ ۲.۱۳.۰ — اجزای حفظ در ویزارد و پروفایل", () => {
  /** saveCaseCore را اجرا می‌کند؛ خروجی: { error? } یا { url } از NEXT_REDIRECT. */
  async function runSave(data: FormData): Promise<{ url?: string; error?: string }> {
    try {
      const state = await saveCaseCore(data);
      return (state as { error?: string }) || {};
    } catch (error) {
      const digest = (error as { digest?: string })?.digest || "";
      if (digest.startsWith("NEXT_REDIRECT")) return { url: digest.split(";")[2] || "" };
      throw error;
    }
  }

  it("ذخیره با اجزای دقیق، ویرایش اجزا و برچسب دوزیه", async () => {
    const id = await memorizerId();
    await loginAs("act");
    const first = await runSave(completeProfile(f, {
      specialties: [String(id)],
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "3", juz: "3,1,2" }]),
    }));
    console.log("DBG-FIRST:", JSON.stringify(first));
    expect(first.error).toBeUndefined();
    const caseId = caseIdOf(first.url!);
    let dossier = await loadDossier(f.users.act, caseId);
    let line = dossier?.specialtyDetailLines.find((item) => item.title === "حافظ قرآن");
    expect(line?.detail).toBe("حفظ ۳ جزء (۱، ۲، ۳)");

    // ویرایش اجزا در ویزارد (گام تخصص‌ها): همان پرونده، تعداد و اجزای تازه
    const editUrl = await redirectOf(() => saveSpecialtiesStepAction({}, form({
      caseId,
      specialties: [String(id)],
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "2", juz: "20,5" }]),
    })));
    expect(editUrl).toContain("/steps/4");
    dossier = await loadDossier(f.users.act, caseId);
    line = dossier?.specialtyDetailLines.find((item) => item.title === "حافظ قرآن");
    expect(line?.detail).toBe("حفظ ۲ جزء (۵، ۲۰)");
  });

  it("عدم تطابق تعداد در ویزارد خطا برمی‌گرداند", async () => {
    const id = await memorizerId();
    await loginAs("act");
    const result = await saveCaseCore(completeProfile(f, {
      specialties: [String(id)],
      specialtyDetails: JSON.stringify([{ code: "memorizer", value: "5", juz: "1,2" }]),
    }));
    expect((result as { error?: string }).error).toContain("معتبر نیست");
  });
});
