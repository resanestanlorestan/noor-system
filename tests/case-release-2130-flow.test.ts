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
import { registerAction } from "@/app/actions/auth";
import { createSession } from "@/lib/auth";
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


const runSuffix = String(Date.now()).slice(-5);
let phoneSeq = 0;
const nextMobile = (prefix: string) => `${prefix}${runSuffix}${String(++phoneSeq).padStart(2, "0")}`;

async function memorizerId(): Promise<number> {
  const rows = await db.select().from(s.specialties);
  return rows.find((item) => item.code === "memorizer")!.id;
}

describe("الحاقیهٔ ۲.۱۳.۰ — اجزای حفظ پس از تفکیک ثبت‌نام (الحاقیهٔ ۲.۱۴.۰)", () => {
  it("ثبت‌نام فقط حساب می‌سازد و پنجرهٔ اجزای حفظ در مسیر ویزارد کار می‌کند", async () => {
    // ثبت‌نام عمومی: فقط حساب، بدون هیچ پرونده
    const mobile = nextMobile("0937");
    const url = await redirectOf(() => registerAction({}, form({
      firstName: "حافظ", lastName: "جزءهای‌آزمون", email: "", mobile,
      password: "Passw0rdCase", confirmation: "Passw0rdCase",
    })));
    expect(url).toContain("register/verify");
    const [user] = await db.select().from(s.users).where(eq(s.users.phone, mobile)).limit(1);
    expect(user).toBeTruthy();
    const [person] = await db.select().from(s.activists).where(eq(s.activists.userId, user!.id)).limit(1);
    expect(person).toBeUndefined();
    void user;
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
