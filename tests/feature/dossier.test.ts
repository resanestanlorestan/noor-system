// Feature tests for the formal dossier loader: scope access (owner, in-scope
// manager, out-of-scope manager) and the assembled sections.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { loadDossier } from "@/lib/dossier";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const ago = (days: number) => new Date(Date.now() - days * 86400000);

async function dossierCase(options: { withUser?: boolean } = {}) {
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", phone: "09121110222",
    provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
    activityProvinceId: f.tehranProvinceId, activityPlace: "مسجد جامع",
    userId: options.withUser ? f.users.act.id : null,
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "pending", source: "manager",
    createdBy: f.users.prov.id, submittedAt: ago(20), createdAt: ago(30), updatedAt: ago(20),
  }).returning();
  await db.insert(s.activityRecords).values({ activistId: activist.id, kind: "teaching", title: "تدریس تجوید", organization: "مجمع قرآنی", startDate: "1400-05-01", endDate: "1401-06-01", createdBy: f.users.prov.id });
  await db.insert(s.educationalCourses).values({ activistId: activist.id, title: "دوره عقاید", provider: "مؤسسه تعلیمی", hours: 30, createdBy: f.users.prov.id });
  await db.insert(s.certificates).values({ activistId: activist.id, title: "گواهی افتخار", issuer: "اداره کل", createdBy: f.users.prov.id });
  await db.insert(s.statusHistory).values({ applicationId: application.id, fromStatus: null, toStatus: "pending", actorId: f.users.prov.id, note: "ارسال برای بررسی" });
  return { activist, application };
}

describe("دوزیه رسمی پرونده", () => {
  it("مدیر هم‌محدوده همه بخش‌ها را می‌بیند و امتیاز محاسبه می‌شود", async () => {
    const { activist, application } = await dossierCase();
    await loginAs("prov");
    const data = await loadDossier(f.users.prov, application.id);
    expect(data).not.toBeNull();
    expect(data!.person.id).toBe(activist.id);
    expect(data!.statusLabel).toBe("در انتظار بررسی");
    expect(data!.provinceName).toBe("تهران");
    expect(data!.activityProvinceName).toBe("تهران");
    expect(data!.activities.length).toBe(1);
    expect(data!.activities[0].kindLabel).toBe("تدریس");
    expect(data!.activities[0].period).toContain("تا");
    expect(data!.courses.length).toBe(1);
    expect(data!.courses[0].kindLabel).toBe("۳۰ ساعت");
    expect(data!.certificateRows.length).toBe(1);
    expect(data!.score).toBe(4 + 2 + 1 + 3); // teaching 4 + course 2 + hours bonus 1 + certificate 3
    expect(data!.history.length).toBeGreaterThan(0);
  });

  it("مدیر استان دیگر به دوزیه دسترسی ندارد", async () => {
    const { application } = await dossierCase();
    await loginAs("provFars");
    expect(await loadDossier(f.users.provFars, application.id)).toBeNull();
  });

  it("صاحب پرونده دوزیه پرونده خودش را می‌بیند", async () => {
    const { application } = await dossierCase({ withUser: true });
    await loginAs("act");
    const data = await loadDossier(f.users.act, application.id);
    expect(data).not.toBeNull();
    expect(data!.person.firstName).toBe("زهرا");
    expect(data!.statusLabel).toBe("در انتظار بررسی");
  });
});
