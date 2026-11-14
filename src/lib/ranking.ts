// Activist points & ranking (امتیازدهی و رتبه‌بندی فعالان — Release 2.4، فاز ۳).
//
// The score is a transparent, documented weighted sum of the structured
// records every case already carries: Quranic activities (by kind), courses
// (with hours), certificates and attended events. Weights are exported so the
// pin-tests never drift from the implementation.
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activists, specialties } from "@/db/schema";
import type { MaybeSessionUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";

export const SCORE_WEIGHTS = {
  activity: 2,       // فعال فرهنگی
  teaching: 4,       // تدریس
  judging: 3,        // داوری
  competition: 2,    // شرکت در مسابقات
  research: 3,       // پژوهش
  course: 2,         // هر دوره آموزشی
  courseHoursPerPoint: 20, // هر ۲۰ ساعت دوره → ۱ امتیاز
  certificate: 3,    // هر گواهینامه/حکم/تقدیرنامه
  eventAttended: 2,  // هر رویداد با حضور ثبت‌شده
} as const;

export const RANK_LEVELS = [
  { min: 25, label: "طلایی", color: "#c99a1c" },
  { min: 12, label: "نقره‌ای", color: "#8a97a5" },
  { min: 5, label: "برنزی", color: "#b07a4a" },
  { min: 0, label: "فعال", color: "#6f8f85" },
] as const;

// ---------- pure helpers (unit-testable) ----------

export type RankingInput = {
  activity: number; teaching: number; judging: number; competition: number; research: number;
  courses: number; courseHours: number; certificates: number; attended: number;
};

export function computeScore(input: RankingInput): number {
  const w = SCORE_WEIGHTS;
  const activityPoints = input.activity * w.activity + input.teaching * w.teaching + input.judging * w.judging
    + input.competition * w.competition + input.research * w.research;
  const coursePoints = input.courses * w.course + Math.floor(input.courseHours / w.courseHoursPerPoint);
  return activityPoints + coursePoints + input.certificates * w.certificate + input.attended * w.eventAttended;
}

export function rankLevel(score: number): { label: string; color: string } {
  const level = RANK_LEVELS.find((item) => score >= item.min) ?? RANK_LEVELS[RANK_LEVELS.length - 1];
  return { label: level.label, color: level.color };
}

// ---------- data layer ----------

const countExpr = (inner: SQL) => sql<number>`(${inner})::int`;

function aggregates() {
  const byKind = (kind: string) => countExpr(sql`select count(*) from activity_records ar where ar.activist_id = quranic_activists.id and ar.kind = ${kind}`);
  return {
    activityCount: byKind("activity"),
    teachingCount: byKind("teaching"),
    judgingCount: byKind("judging"),
    competitionCount: byKind("competition"),
    researchCount: byKind("research"),
    courseCount: countExpr(sql`select count(*) from educational_courses ec where ec.activist_id = quranic_activists.id`),
    courseHours: countExpr(sql`select coalesce(sum(ec.hours), 0) from educational_courses ec where ec.activist_id = quranic_activists.id`),
    certificateCount: countExpr(sql`select count(*) from certificates c where c.activist_id = quranic_activists.id`),
    attendedCount: countExpr(sql`select count(*) from event_participants ep where ep.activist_id = quranic_activists.id and ep.status = 'attended'`),
    specialtyTitles: sql<string>`(select string_agg(qs.title, '، ') from activist_specialties asp join quranic_specialties qs on qs.id = asp.specialty_id where asp.activist_id = quranic_activists.id)`,
    caseId: sql<string | null>`(select a.id from applications a where a.activist_id = quranic_activists.id limit 1)`,
  };
}

export type RankingRow = {
  activistId: string; fullName: string; province: string | null; county: string | null;
  specialtyTitles: string | null; caseId: string | null;
  activityCount: number; teachingCount: number; judgingCount: number; competitionCount: number; researchCount: number;
  courseCount: number; courseHours: number; certificateCount: number; attendedCount: number;
  score: number; level: { label: string; color: string };
};

export async function listRanking(user: MaybeSessionUser, filters: { provinceId?: number; countyId?: number; specialtyId?: number } = {}, limit = 200): Promise<RankingRow[]> {
  const conditions: SQL[] = [scopeCondition(user)];
  if (filters.provinceId) conditions.push(eq(activists.provinceId, filters.provinceId));
  if (filters.countyId) conditions.push(eq(activists.countyId, filters.countyId));
  if (filters.specialtyId) {
    conditions.push(sql`exists (select 1 from activist_specialties asp2 where asp2.activist_id = quranic_activists.id and asp2.specialty_id = ${filters.specialtyId})`);
  }
  const rows = await db.select({
    activistId: activists.id,
    fullName: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    province: sql<string | null>`(select p.name from provinces p where p.id = quranic_activists.province_id)`,
    county: sql<string | null>`(select c.name from counties c where c.id = quranic_activists.county_id)`,
    ...aggregates(),
  }).from(activists)
    .where(and(...conditions))
    .orderBy(asc(activists.lastName))
    .limit(limit);

  return rows.map((row) => {
    const { specialtyTitles, caseId, ...counts } = row;
    const score = computeScore({
      activity: Number(row.activityCount), teaching: Number(row.teachingCount), judging: Number(row.judgingCount),
      competition: Number(row.competitionCount), research: Number(row.researchCount),
      courses: Number(row.courseCount), courseHours: Number(row.courseHours),
      certificates: Number(row.certificateCount), attended: Number(row.attendedCount),
    });
    return { ...counts, specialtyTitles, caseId, activistId: row.activistId, fullName: row.fullName, province: row.province, county: row.county, score, level: rankLevel(score) };
  }).sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName, "fa"));
}


export async function listSpecialtyOptions() {
  return db.select({ id: specialties.id, title: specialties.title }).from(specialties).orderBy(asc(specialties.title));
}
