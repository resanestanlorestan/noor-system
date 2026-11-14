/**
 * Phase 2 demo data: county-admin test user (6th role) + sample cases in the
 * remaining workflow statuses so every dashboard card, filter and status lane
 * has a visible example. Idempotent — safe to re-run.
 * Usage:  env -u DATABASE_URL npx tsx scripts/seed-phase2.ts
 */
import "dotenv/config";
import { randomUUID, scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { toGregorian } from "jalaali-js";
import { db, pool } from "../src/db";
import {
  activistSpecialties, activists, applications, counties, documents, expertReferrals,
  organizations, provinces, specialties, statusHistory, users, userSpecialties,
} from "../src/db/schema";
import { privateDir, protectNationalId } from "../src/lib/local-secrets";

type AppStatus = "draft" | "pending" | "needs_correction" | "approved" | "rejected" | "specialist_review" | "initial" | "completing" | "ready";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
async function passwordHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(password, salt, 64)).toString("hex")}`;
}
const jalaliIso = (jy: number, jm: number, jd: number) => {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
};
const MINIMAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF", "utf8");
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);

async function main() {
  const [admin] = await db.select().from(users).where(eq(users.email, "admin@noor.local")).limit(1);
  if (!admin) throw new Error("run scripts/seed.ts first");
  const [tehran] = await db.select().from(provinces).where(eq(provinces.name, "تهران")).limit(1);
  const [tehranCounty] = await db.select().from(counties).where(and(eq(counties.provinceId, tehran.id), eq(counties.name, "تهران"))).limit(1);
  const [reviewer] = await db.select().from(users).where(eq(users.email, "reviewer@noor.local")).limit(1);
  const [specialist] = await db.select().from(users).where(eq(users.email, "specialist@noor.local")).limit(1);
  const specRows = await db.select().from(specialties);
  const specId = (code: string) => specRows.find((row) => row.code === code)!.id;

  // 1) County-admin demo user (item 14: a test user for every role)
  const [existingCounty] = await db.select().from(users).where(eq(users.email, "county@noor.local")).limit(1);
  if (!existingCounty) {
    await db.insert(users).values({
      fullName: "مدیر شهرستان تهران", email: "county@noor.local", passwordHash: await passwordHash("County2026!x"),
      role: "county_admin", phone: "09121110005", provinceId: tehran.id, countyId: tehranCounty.id, emailVerifiedAt: new Date(),
    });
    console.log("seeded county admin: county@noor.local / County2026!x");
  }

  // 2) A fully-profiled organization to demo the new institution fields
  const [org] = await db.select().from(organizations).where(eq(organizations.name, "کانون قرآنی مساجد کشور")).limit(1);
  if (!org) {
    await db.insert(organizations).values({
      name: "کانون قرآنی مساجد کشور", type: "قرآنی", provinceId: tehran.id, countyId: tehranCounty.id,
      address: "تهران، خیابان انقلاب، روبه‌روی دانشگاه تهران، پلاک ۱۲۳",
      phone: "02166401234", managerName: "حاج آقا موسوی",
    });
    console.log("seeded full-profile organization");
  }

  // 3) Sample cases across statuses (item 15)
  const cases: { key: string; person: { first: string; last: string; father: string; gender: string; nid: string; birth: [number, number, number]; phone: string }; status: AppStatus; source: "self" | "manager" | "expert" | "paper"; createdBy: string; assigned?: string; history: { from: string | null; to: string; actor: string; note: string; days: number }[]; specialties: string[]; referral?: string }[] = [
    {
      key: "approved", person: { first: "مریم", last: "صادقی", father: "حسن", gender: "female", nid: "0021345678", birth: [1372, 2, 10], phone: "09123334455" },
      status: "approved", source: "manager", createdBy: "province", assigned: reviewer.id, specialties: ["reciter", "memorizer"],
      history: [
        { from: null, to: "draft", actor: "province", note: "ثبت اولیه توسط مدیر استان", days: 40 },
        { from: "draft", to: "ready", actor: "province", note: "تکمیل اطلاعات و آماده‌سازی", days: 38 },
        { from: "ready", to: "pending", actor: "province", note: "ارسال برای بررسی", days: 37 },
        { from: "pending", to: "needs_correction", actor: "reviewer", note: "درخواست مدرک فعالیت", days: 30 },
        { from: "needs_correction", to: "pending", actor: "province", note: "پاسخ و بارگذاری مدرک", days: 25 },
        { from: "pending", to: "specialist_review", actor: "reviewer", note: "ارجاع برای نظرسنجی تخصصی", days: 20 },
        { from: "specialist_review", to: "pending", actor: "specialist", note: "نظر تخصصی مثبت ثبت شد", days: 15 },
        { from: "pending", to: "approved", actor: "admin", note: "تأیید نهایی پرونده", days: 10 },
      ],
    },
    {
      key: "rejected", person: { first: "رضا", last: "کریمی", father: "اصغر", gender: "male", nid: "0034567890", birth: [1368, 7, 25], phone: "09125556677" },
      status: "rejected", source: "expert", createdBy: "reviewer", assigned: reviewer.id, specialties: ["teacher"],
      history: [
        { from: null, to: "draft", actor: "reviewer", note: "ثبت توسط کارشناس", days: 35 },
        { from: "draft", to: "pending", actor: "reviewer", note: "ارسال برای بررسی", days: 34 },
        { from: "pending", to: "rejected", actor: "admin", note: "عدم احراز شروط سند به دلیل نقص مدارک هویتی", days: 12 },
      ],
    },
    {
      key: "needs_correction", person: { first: "فاطمه", last: "حسینی", father: "علی", gender: "female", nid: "0045678901", birth: [1378, 12, 5], phone: "09127778899" },
      status: "needs_correction", source: "self", createdBy: "self", assigned: reviewer.id, specialties: ["memorizer"],
      history: [
        { from: null, to: "draft", actor: "self", note: "ایجاد پیش‌نویس", days: 22 },
        { from: "draft", to: "pending", actor: "self", note: "ارسال برای بررسی", days: 21 },
        { from: "pending", to: "needs_correction", actor: "reviewer", note: "بارگذاری تصویر کارت ملی الزامی است", days: 9 },
      ],
    },
    {
      key: "specialist_review", person: { first: "سمیه", last: "رحیمی", father: "محمدرضا", gender: "female", nid: "0056789012", birth: [1380, 5, 18], phone: "09128889900" },
      status: "specialist_review", source: "paper", createdBy: "manager_placeholder", assigned: reviewer.id, specialties: ["reciter"], referral: "reciter",
      history: [
        { from: null, to: "initial", actor: "admin", note: "ورود اطلاعات از فرم کاغذی", days: 16 },
        { from: "initial", to: "pending", actor: "admin", note: "تکمیل و ارسال برای بررسی", days: 14 },
        { from: "pending", to: "specialist_review", actor: "reviewer", note: "ارجاع تخصصی به کارشناس تلاوت", days: 6 },
      ],
    },
    {
      key: "ready", person: { first: "احمد", last: "نوری", father: "جعفر", gender: "male", nid: "0067890123", birth: [1375, 3, 8], phone: "09129990011" },
      status: "ready", source: "self", createdBy: "self", specialties: ["memorizer", "commentator"],
      history: [
        { from: null, to: "draft", actor: "self", note: "ایجاد پیش‌نویس", days: 8 },
        { from: "draft", to: "completing", actor: "self", note: "تکمیل اطلاعات", days: 6 },
        { from: "completing", to: "ready", actor: "self", note: "آماده ارسال", days: 4 },
      ],
    },
    {
      key: "completing", person: { first: "نرگس", last: "عزیزی", father: "یوسف", gender: "female", nid: "0078901234", birth: [1382, 9, 2], phone: "09121110022" },
      status: "completing", source: "manager", createdBy: "county_placeholder", specialties: ["cultural_activist"],
      history: [
        { from: null, to: "draft", actor: "admin", note: "ثبت اولیه توسط مدیر", days: 5 },
        { from: "draft", to: "completing", actor: "admin", note: "در انتظار تکمیل مدارک", days: 3 },
      ],
    },
  ];

  const userOf = async (email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  const countyAdmin = await userOf("county@noor.local");
  const provinceAdmin = await userOf("province@noor.local");
  const uploadsDir = path.join(privateDir, "uploads");
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });

  let created = 0;
  for (const item of cases) {
    const [exists] = await db.select({ id: activists.id }).from(activists).where(eq(activists.nationalIdLast4, item.person.nid.slice(-4))).limit(1);
    if (exists) continue;
    const creator = item.createdBy === "self" ? null : item.createdBy === "province" ? provinceAdmin : item.createdBy === "reviewer" ? reviewer : item.createdBy === "county_placeholder" ? countyAdmin : admin;
    const protectedId = await protectNationalId(item.person.nid);
    const [activist] = await db.insert(activists).values({
      firstName: item.person.first, lastName: item.person.last, fatherName: item.person.father,
      nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4,
      birthDate: jalaliIso(...item.person.birth), gender: item.person.gender, phone: item.person.phone,
      provinceId: tehran.id, countyId: tehranCounty.id, city: "تهران",
      address: "تهران، خیابان شهید بهشتی، پلاک ۴۵", activityPlace: "کانون قرآنی مسجد النور",
      organization: "کانون قرآنی مساجد کشور", activityProvinceId: tehran.id, activityCountyId: tehranCounty.id,
      idCardNumber: item.person.nid.slice(0, 8), idIssuePlace: "تهران", postalCode: "1234567890",
      activityHistory: "فعالیت در محافل و کانون‌های قرآنی",
    }).returning();
    await db.insert(activistSpecialties).values(item.specialties.map((code) => ({ activistId: activist.id, specialtyId: specId(code) })));
    const [application] = await db.insert(applications).values({
      activistId: activist.id, status: item.status, source: item.source,
      createdBy: creator ? creator.id : admin.id, assignedExpertId: item.assigned ?? null,
      createdAt: daysAgo(item.history[0].days), updatedAt: daysAgo(item.history[item.history.length - 1].days),
      submittedAt: item.history.some((h) => h.to === "pending") ? daysAgo(item.history.find((h) => h.to === "pending")!.days) : null,
    }).returning();
    const storageKey = randomUUID();
    await writeFile(path.join(uploadsDir, storageKey), MINIMAL_PDF, { flag: "wx", mode: 0o600 });
    await db.insert(documents).values({
      applicationId: application.id, storageKey, originalName: "evidence.pdf", title: "مدرک فعالیت قرآنی",
      docType: "activity_certificate", mimeType: "application/pdf", size: MINIMAL_PDF.length, uploadedBy: creator ? creator.id : admin.id,
      createdAt: daysAgo(item.history[0].days),
    });
    await db.insert(statusHistory).values(item.history.map((step) => ({
      applicationId: application.id, fromStatus: step.from as never, toStatus: step.to as never,
      actorId: step.actor === "self" ? (creator ? creator.id : admin.id) : step.actor === "province" ? provinceAdmin.id : step.actor === "reviewer" ? reviewer.id : step.actor === "specialist" ? specialist.id : admin.id,
      note: step.note, createdAt: daysAgo(step.days),
    })));
    if (item.referral) {
      await db.insert(expertReferrals).values({
        applicationId: application.id, specialistId: specialist.id, specialtyId: specId(item.referral),
        status: "pending", requestedBy: reviewer.id, requestNote: "اظهارنظر تخصصی درباره سطح تلاوت", createdAt: daysAgo(6),
      });
    }
    created += 1;
  }
  // specialist skills guard: specialist already has reciter+teacher (from seed.ts)
  const [hasSkills] = await db.select().from(userSpecialties).where(eq(userSpecialties.userId, specialist.id)).limit(1);
  if (!hasSkills) await db.insert(userSpecialties).values([{ userId: specialist.id, specialtyId: specId("reciter") }, { userId: specialist.id, specialtyId: specId("teacher") }]);

  console.log(`phase 2 seed complete — ${created} new sample case(s)`);
  await pool.end();
}

main().catch(async (error) => { console.error(error); await pool.end(); process.exit(1); });
