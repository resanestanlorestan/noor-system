// Feature tests for the activist ranking: score weights, level thresholds,
// ordering, geographic scoping and the attended-events factor — against the
// real noor_feature database.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { computeScore, listRanking, rankLevel, SCORE_WEIGHTS } from "@/lib/ranking";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

type Counts = { activity?: number; teaching?: number; judging?: number; competition?: number; research?: number; courses?: number; hours?: number; certificates?: number };

/** Activist + optional structured records, inserted directly. */
async function rankedActivist(name: string, provinceId: number | null, countyId: number | null, counts: Counts = {}) {
  const [last, first] = name.split(" ");
  const [activist] = await db.insert(s.activists).values({
    firstName: first ?? last, lastName: last, fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", provinceId, countyId, city: "تهران",
  }).returning();
  const activityKinds: Array<[keyof Counts, string]> = [["activity", "activity"], ["teaching", "teaching"], ["judging", "judging"], ["competition", "competition"], ["research", "research"]];
  for (const [key, kind] of activityKinds) {
    const count = counts[key] ?? 0;
    for (let index = 0; index < count; index++) {
      await db.insert(s.activityRecords).values({ activistId: activist.id, kind: kind as "activity", title: `سابقه ${index + 1}`, createdBy: f.users.prov.id });
    }
  }
  for (let index = 0; index < (counts.courses ?? 0); index++) {
    await db.insert(s.educationalCourses).values({ activistId: activist.id, title: `دوره ${index + 1}`, hours: Math.floor((counts.hours ?? 0) / Math.max(1, counts.courses ?? 1)), createdBy: f.users.prov.id });
  }
  for (let index = 0; index < (counts.certificates ?? 0); index++) {
    await db.insert(s.certificates).values({ activistId: activist.id, title: `گواهی ${index + 1}`, createdBy: f.users.prov.id });
  }
  return activist;
}

describe("توابع خالص امتیاز", () => {
  it("وزن‌ها و سطوح", () => {
    expect(SCORE_WEIGHTS.teaching).toBeGreaterThan(SCORE_WEIGHTS.activity);
    expect(computeScore({ activity: 1, teaching: 0, judging: 0, competition: 0, research: 0, courses: 0, courseHours: 0, certificates: 0, attended: 0 })).toBe(2);
    expect(computeScore({ activity: 0, teaching: 1, judging: 0, competition: 0, research: 0, courses: 1, courseHours: 40, certificates: 1, attended: 1 })).toBe(4 + 2 + 2 + 3 + 2);
    expect(rankLevel(0).label).toBe("فعال");
    expect(rankLevel(5).label).toBe("برنزی");
    expect(rankLevel(12).label).toBe("نقره‌ای");
    expect(rankLevel(25).label).toBe("طلایی");
    expect(rankLevel(100).label).toBe("طلایی");
  });
});

describe("جدول رتبه‌بندی", () => {
  it("مرتب‌سازی بر اساس امتیاز نزولی و محاسبه از سوابق واقعی", async () => {
    const gold = await rankedActivist("موسوی زهرا", f.tehranProvinceId, f.tehranCountyId, { teaching: 3, certificates: 3, courses: 2, hours: 40 }); // 3*4 + 3*3 + 2*2 + floor(40/20) = 12+9+4+2 = 27
    const silver = await rankedActivist("احمدی رضا", f.tehranProvinceId, f.tehranCountyId, { judging: 2, courses: 3 }); // 6 + 6 = 12
    await rankedActivist("کریمی سارا", f.tehranProvinceId, f.tehranCountyId, {}); // 0
    await loginAs("prov");
    const rows = await listRanking(f.users.prov);
    expect(rows.length).toBe(3);
    expect(rows[0].activistId).toBe(gold.id);
    expect(rows[1].activistId).toBe(silver.id);
    expect(rows[0].score).toBe(27);
    expect(rows[0].level.label).toBe("طلایی");
    expect(rows[1].score).toBe(12);
    expect(rows[1].level.label).toBe("نقره‌ای");
    expect(rows[2].score).toBe(0);
    expect(rows[2].level.label).toBe("فعال");
  });

  it("حضور واقعی در رویدادها به امتیاز افزوده می‌شود", async () => {
    const activist = await rankedActivist("علومی مریم", f.tehranProvinceId, f.tehranCountyId, { activity: 1 });
    const [event] = await db.insert(s.events).values({
      title: "هم‌اندیشی ماهانه", kind: "meeting", startsAt: new Date(Date.now() + 86400000),
      provinceId: f.tehranProvinceId, reminderHours: 48, createdBy: f.users.prov.id,
    }).returning();
    await db.insert(s.eventParticipants).values({ eventId: event.id, activistId: activist.id, status: "attended" });
    await db.insert(s.eventParticipants).values({ eventId: event.id, activistId: activist.id, status: "invited" }).onConflictDoNothing();
    await loginAs("prov");
    const rows = await listRanking(f.users.prov);
    expect(rows[0].attendedCount).toBe(1);
    expect(rows[0].score).toBe(SCORE_WEIGHTS.activity + SCORE_WEIGHTS.eventAttended);
  });

  it("مدیر استان دیگر فعالان تهران را نمی‌بیند و فیلتر تخصص/شهرستان کار می‌کند", async () => {
    await rankedActivist("تهرانی سعید", f.tehranProvinceId, f.tehranCountyId, { teaching: 2 });
    await loginAs("provFars");
    expect((await listRanking(f.users.provFars)).length).toBe(0);
    await loginAs("prov");
    expect((await listRanking(f.users.prov, { specialtyId: f.specialtyId })).length).toBe(0); // no specialties attached
    expect((await listRanking(f.users.prov, { countyId: f.islamshahrCountyId })).length).toBe(0);
    expect((await listRanking(f.users.prov, { countyId: f.tehranCountyId })).length).toBe(1);
  });
});
