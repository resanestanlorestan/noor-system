/**
 * Seeds demo data for local testing/preview. Idempotent: skips when the
 * admin account already exists. Run from the project root:
 *   env -u DATABASE_URL bun run scripts/seed.ts
 */
import "dotenv/config";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { toGregorian } from "jalaali-js";
import { db, pool } from "../src/db";
import {
  activistSpecialties, activists, applications, auditLogs, counties, documents,
  notifications, organizations, provinces, specialties, statusHistory, users,
  userSpecialties,
} from "../src/db/schema";
import { referenceSpecialties } from "../src/lib/constants";
import { privateDir, protectNationalId } from "../src/lib/local-secrets";

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await scrypt(password, salt, 64)).toString("hex")}`;
}
const jalaliIso = (jy: number, jm: number, jd: number) => {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
};

const ACCOUNTS = {
  admin: { email: "admin@noor.local", password: "NoorAdmin2026!x", fullName: "مدیر کل سامانه", phone: "09121110001" },
  province: { email: "province@noor.local", password: "Province2026!x", fullName: "مدیر استانی تهران", phone: "09121110004" },
  reviewer: { email: "reviewer@noor.local", password: "Reviewer2026!x", fullName: "حسین رضایی", phone: "09121110002" },
  specialist: { email: "specialist@noor.local", password: "Specialist2026!x", fullName: "استاد محمد کریمی", phone: "09121110003" },
  activist: { email: "activist@noor.local", password: "Activist2026!x", fullName: "علی احمدی", phone: null as string | null },
  activist2: { email: "zahra@noor.local", password: "Zahra2026!!xx", fullName: "زهرا موسوی", phone: null as string | null },
};

async function upsertProvince(name: string) {
  const [row] = await db.insert(provinces).values({ name }).onConflictDoNothing().returning();
  if (row) return row.id;
  const [existing] = await db.select().from(provinces).where(eq(provinces.name, name));
  return existing.id;
}
async function upsertCounty(provinceId: number, name: string) {
  const [row] = await db.insert(counties).values({ provinceId, name }).onConflictDoNothing().returning();
  if (row) return row.id;
  const all = await db.select().from(counties).where(eq(counties.provinceId, provinceId));
  return all.find((item) => item.name === name)!.id;
}

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF",
  "utf8",
);

async function main() {
  const [existingAdmin] = await db.select().from(users).where(eq(users.email, ACCOUNTS.admin.email)).limit(1);
  if (existingAdmin) { console.log("Seed skipped: demo admin already exists."); await pool.end(); return; }

  // Geography
  const tehran = await upsertProvince("تهران");
  const esfahan = await upsertProvince("اصفهان");
  const fars = await upsertProvince("فارس");
  await upsertProvince("خراسان رضوی");
  const tehranCounty = await upsertCounty(tehran, "تهران");
  await upsertCounty(esfahan, "اصفهان");
  await upsertCounty(fars, "شیراز");

  // Specialties
  const specialtyIds: Record<string, number> = {};
  for (const item of referenceSpecialties) {
    const [row] = await db.insert(specialties).values(item).onConflictDoNothing().returning();
    if (row) specialtyIds[item.code] = row.id;
    else {
      const [existing] = await db.select().from(specialties).where(eq(specialties.code, item.code));
      specialtyIds[item.code] = existing.id;
    }
  }

  // Organizations
  await db.insert(organizations).values({ name: "مؤسسه فرهنگی قرآنی نور", type: "قرآنی" }).onConflictDoNothing();
  await db.insert(organizations).values({ name: "اداره کل اوقاف و امور خیریه استان تهران", type: "دولتی" }).onConflictDoNothing();

  // Users (all e-mails pre-verified so the demo starts clean)
  const makeUser = async (account: { email: string; password: string; fullName: string; phone: string | null }, role: "super_admin" | "province_admin" | "reviewer" | "specialist" | "activist", scope?: { provinceId?: number; countyId?: number }) =>
    (await db.insert(users).values({
      fullName: account.fullName, email: account.email, passwordHash: await hashPassword(account.password),
      role, phone: account.phone, provinceId: scope?.provinceId ?? null, countyId: scope?.countyId ?? null,
      emailVerifiedAt: new Date(),
    }).returning())[0];

  const admin = await makeUser(ACCOUNTS.admin, "super_admin");
  await makeUser(ACCOUNTS.province, "province_admin", { provinceId: tehran });
  const reviewer = await makeUser(ACCOUNTS.reviewer, "reviewer", { provinceId: tehran, countyId: tehranCounty });
  const specialist = await makeUser(ACCOUNTS.specialist, "specialist", { provinceId: tehran, countyId: tehranCounty });
  const activistUser = await makeUser(ACCOUNTS.activist, "activist");
  const activist2User = await makeUser(ACCOUNTS.activist2, "activist");
  await db.insert(auditLogs).values({ actorId: admin.id, action: "bootstrap_admin", targetType: "user", targetId: admin.id });

  // Specialist skills (multi-specialty expert)
  await db.insert(userSpecialties).values([
    { userId: specialist.id, specialtyId: specialtyIds.reciter },
    { userId: specialist.id, specialtyId: specialtyIds.teacher },
  ]);

  // Case 1 — submitted, awaiting review (owner: علی احمدی)
  const id1 = await protectNationalId("0079279902");
  const activist1 = (await db.insert(activists).values({
    userId: activistUser.id, firstName: "علی", lastName: "احمدی", fatherName: "محمود",
    nationalIdCipher: id1.cipher, nationalIdHash: id1.hash, nationalIdLast4: id1.last4,
    birthDate: jalaliIso(1370, 4, 15), gender: "male", phone: "09121234567",
    provinceId: tehran, countyId: tehranCounty, city: "تهران",
    address: "تهران، خیابان ولیعصر، کوچه یاس، پلاک ۱۲", activityPlace: "مسجد جامع نور",
    organization: "مؤسسه فرهنگی قرآنی نور",
    activityHistory: "ده سال تدریس قرآن و فعالیت در محافل حفظ",
  }).returning())[0];
  await db.insert(activistSpecialties).values([
    { activistId: activist1.id, specialtyId: specialtyIds.memorizer },
    { activistId: activist1.id, specialtyId: specialtyIds.teacher },
  ]);

  // Case 2 — draft (owner: زهرا موسوی) for testing the edit/submission flow
  const id2 = await protectNationalId("1234567891");
  const activist2 = (await db.insert(activists).values({
    userId: activist2User.id, firstName: "زهرا", lastName: "موسوی", fatherName: "رضا",
    nationalIdCipher: id2.cipher, nationalIdHash: id2.hash, nationalIdLast4: id2.last4,
    birthDate: jalaliIso(1375, 9, 20), gender: "female", phone: "09127654321",
    provinceId: tehran, countyId: tehranCounty, city: "تهران",
    activityPlace: "کانون قرآنی مسجدالنبی",
  }).returning())[0];
  await db.insert(activistSpecialties).values([
    { activistId: activist2.id, specialtyId: specialtyIds.reciter },
  ]);

  // Application for case 1 with a sample document, submitted for review
  const application = (await db.insert(applications).values({
    activistId: activist1.id, status: "pending", source: "self", createdBy: activistUser.id,
    submittedAt: new Date(),
  }).returning())[0];
  const storageKey = crypto.randomUUID();
  const uploadsDir = path.join(privateDir, "uploads");
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadsDir, storageKey), MINIMAL_PDF, { flag: "wx", mode: 0o600 });
  await db.insert(documents).values({
    applicationId: application.id, storageKey, originalName: "national-card.pdf",
    title: "تصویر کارت ملی", mimeType: "application/pdf", size: MINIMAL_PDF.length, uploadedBy: activistUser.id,
  });
  await db.insert(statusHistory).values([
    { applicationId: application.id, fromStatus: null, toStatus: "draft", actorId: activistUser.id, note: "ایجاد پیش‌نویس" },
    { applicationId: application.id, fromStatus: "draft", toStatus: "completing", actorId: activistUser.id, note: "تکمیل اطلاعات" },
    { applicationId: application.id, fromStatus: "completing", toStatus: "ready", actorId: activistUser.id, note: "کنترل کامل بودن و آماده‌سازی ارسال" },
    { applicationId: application.id, fromStatus: "ready", toStatus: "pending", actorId: activistUser.id, note: "ارسال پرونده برای بررسی" },
  ]);
  await db.insert(notifications).values([
    { userId: admin.id, applicationId: application.id, title: "پرونده آماده بررسی", body: "یک پرونده برای بررسی ارسال شده است." },
    { userId: reviewer.id, applicationId: application.id, title: "پرونده آماده بررسی", body: "یک پرونده برای بررسی ارسال شده است." },
  ]);
  await db.insert(auditLogs).values([
    { actorId: activistUser.id, action: "create_draft", targetType: "application", targetId: application.id },
    { actorId: activistUser.id, action: "upload_document", targetType: "application", targetId: application.id },
    { actorId: activistUser.id, action: "submit", targetType: "application", targetId: application.id },
  ]);

  console.log("Seed complete:");
  for (const [key, account] of Object.entries(ACCOUNTS)) console.log(`  ${key.padEnd(10)} ${account.email}  /  ${account.password}`);
  await pool.end();
}

main().catch(async (error) => { console.error(error); await pool.end(); process.exit(1); });
