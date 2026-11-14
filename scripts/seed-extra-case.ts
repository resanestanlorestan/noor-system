/** Adds one more demo case (linked to the test user) to exercise case-event e-mails. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { activistSpecialties, activists, applications, documents, provinces, specialties, statusHistory, users } from "../src/db/schema";
import { privateDir, protectNationalId } from "../src/lib/local-secrets";

const MINIMAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF", "utf8");

async function main() {
  const [testUser] = await db.select().from(users).where(eq(users.email, "test-user@noor.local")).limit(1);
  if (!testUser) throw new Error("run scripts/seed.ts first");
  const [already] = await db.select().from(activists).where(eq(activists.userId, testUser.id)).limit(1);
  if (already) { console.log("extra case already exists"); await pool.end(); return; }
  const [tehran] = await db.select().from(provinces).where(eq(provinces.name, "تهران")).limit(1);
  const protectedId = await protectNationalId("0012345679");
  const activist = (await db.insert(activists).values({
    userId: testUser.id, firstName: "محمد", lastName: "حسینی", fatherName: "قاسم",
    nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4,
    birthDate: "1985-03-11", gender: "male", phone: "09121112233",
    provinceId: tehran.id, city: "تهران", activityPlace: "کانون مسجد النور",
  }).returning())[0];
  const [memorizer] = await db.select().from(specialties).where(eq(specialties.code, "memorizer")).limit(1);
  await db.insert(activistSpecialties).values({ activistId: activist.id, specialtyId: memorizer.id });
  const application = (await db.insert(applications).values({
    activistId: activist.id, status: "pending", source: "self", createdBy: testUser.id, submittedAt: new Date(),
  }).returning())[0];
  const storageKey = randomUUID();
  const uploadsDir = path.join(privateDir, "uploads");
  await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(uploadsDir, storageKey), MINIMAL_PDF, { flag: "wx", mode: 0o600 });
  await db.insert(documents).values({
    applicationId: application.id, storageKey, originalName: "id-card.pdf",
    title: "مدرک هویتی", mimeType: "application/pdf", size: MINIMAL_PDF.length, uploadedBy: testUser.id,
  });
  await db.insert(statusHistory).values([
    { applicationId: application.id, fromStatus: null, toStatus: "draft", actorId: testUser.id, note: "ایجاد پیش‌نویس" },
    { applicationId: application.id, fromStatus: "ready", toStatus: "pending", actorId: testUser.id, note: "ارسال پرونده برای بررسی" },
  ]);
  console.log("extra pending case created for", testUser.email, "application:", application.id);
  await pool.end();
}

main().catch(async (error) => { console.error(error); await pool.end(); process.exit(1); });
