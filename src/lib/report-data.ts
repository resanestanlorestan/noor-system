import { and, count, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activists, applications, counties, documents, provinces, specialties, statusHistory, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { isManager, scopeCondition } from "@/lib/data";
import { statusLabels, type AppStatus } from "@/lib/constants";
import { isoToJalali, jalaliToIso } from "@/lib/format";

export type ReportFilters = { provinceId?: number; countyId?: number; specialtyId?: number; status?: AppStatus; from?: string; to?: string; fromIso?: string; toIso?: string };
export type ReportInput = { provinceId?: string; countyId?: string; specialtyId?: string; status?: string; from?: string; to?: string };
export function parseReportFilters(input: ReportInput): { filters: ReportFilters; error?: string } {
  const filters: ReportFilters = {};
  for (const key of ["provinceId", "countyId", "specialtyId"] as const) {
    const raw = input[key]; if (!raw) continue;
    if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) return { filters, error: "فیلتر جغرافیایی یا تخصص معتبر نیست." };
    filters[key] = Number(raw);
  }
  if (input.status) {
    if (!Object.hasOwn(statusLabels, input.status)) return { filters, error: "وضعیت پرونده معتبر نیست." };
    filters.status = input.status as AppStatus;
  }
  for (const key of ["from", "to"] as const) {
    const raw = input[key]?.trim(); if (!raw) continue;
    const iso = jalaliToIso(raw); if (!iso) return { filters, error: "تاریخ‌ها را به شکل شمسی معتبر، مانند ۱۴۰۳/۰۱/۰۱ وارد کنید." };
    filters[key] = raw; filters[key === "from" ? "fromIso" : "toIso"] = iso;
  }
  if (filters.fromIso && filters.toIso && filters.fromIso > filters.toIso) return { filters, error: "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد." };
  return { filters };
}
export function filterQuery(filters: ReportFilters) {
  const query = new URLSearchParams();
  for (const key of ["provinceId", "countyId", "specialtyId", "status", "from", "to"] as const) if (filters[key]) query.set(key, String(filters[key]));
  return query.toString();
}

export function monthTimeline(daily: { date: string; total: number }[], toIso?: string): { name: string; total: number }[] {
  const monthTotals = new Map<string, number>();
  for (const item of daily) { const month = isoToJalali(item.date).slice(0, 7); monthTotals.set(month, (monthTotals.get(month) || 0) + item.total); }
  const endJalali = toIso ? isoToJalali(toIso) : new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(new Date()).replace(/(\d+)\/(\d+)\/(\d+)/, "$3/$1/$2");
  let [year, month] = endJalali.split("/").map(Number); const timeline: { name: string; total: number }[] = [];
  for (let i = 0; i < 6; i++) { const key = `${year}/${String(month).padStart(2, "0")}`; timeline.unshift({ name: key, total: monthTotals.get(key) || 0 }); if (--month === 0) { month = 12; year--; } }
  return timeline;
}

export async function getReportData(user: SessionUser, filters: ReportFilters) {
  if (!isManager(user)) throw new Error("Forbidden");
  const clauses: SQL[] = [scopeCondition(user), isNull(applications.deletedAt)];
  if (filters.provinceId) clauses.push(eq(activists.provinceId, filters.provinceId));
  if (filters.countyId) clauses.push(eq(activists.countyId, filters.countyId));
  if (filters.status) clauses.push(eq(applications.status, filters.status));
  if (filters.specialtyId) clauses.push(sql`exists (select 1 from ${activistSpecialties} where ${activistSpecialties.activistId} = ${activists.id} and ${activistSpecialties.specialtyId} = ${filters.specialtyId})`);
  const localDate = sql<string>`(${applications.createdAt} at time zone 'Asia/Tehran')::date`;
  if (filters.fromIso) clauses.push(sql`${localDate} >= ${filters.fromIso}::date`);
  if (filters.toIso) clauses.push(sql`${localDate} <= ${filters.toIso}::date`);
  const where = and(...clauses);
  const incomplete = or(isNull(activists.fatherName), isNull(activists.nationalIdHash), isNull(activists.birthDate), isNull(activists.gender), isNull(activists.phone), isNull(activists.provinceId), isNull(activists.countyId), sql`not exists (select 1 from ${activistSpecialties} where ${activistSpecialties.activistId} = ${activists.id})`, sql`not exists (select 1 from ${documents} where ${documents.applicationId} = ${applications.id})`);
  const expertClauses: SQL[] = [eq(users.active, true), inArray(users.role, ["reviewer", "specialist"])];
  if (user.effectiveRole !== "super_admin") { if (!user.provinceId || (user.effectiveRole === "county_admin" && !user.countyId)) expertClauses.push(sql`false`); else expertClauses.push(eq(users.provinceId, user.provinceId)); if (user.countyId) expertClauses.push(eq(users.countyId, user.countyId)); }
  if (filters.provinceId) expertClauses.push(eq(users.provinceId, filters.provinceId));
  if (filters.countyId) expertClauses.push(eq(users.countyId, filters.countyId));
  const [statuses, provinceStats, countyStats, specialtyStats, sources, daily, incompleteCount, overdueCount, expertCount, performance, allProvinces, allCounties, allSpecialties] = await Promise.all([
    db.select({ name: applications.status, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(where).groupBy(applications.status),
    db.select({ name: provinces.name, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).leftJoin(provinces, eq(activists.provinceId, provinces.id)).where(where).groupBy(provinces.name).orderBy(desc(count())).limit(31),
    db.select({ name: counties.name, province: provinces.name, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).leftJoin(counties, eq(activists.countyId, counties.id)).leftJoin(provinces, eq(activists.provinceId, provinces.id)).where(where).groupBy(counties.name, provinces.name).orderBy(desc(count())).limit(30),
    db.select({ name: specialties.title, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).innerJoin(activistSpecialties, eq(activistSpecialties.activistId, activists.id)).innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id)).where(where).groupBy(specialties.title).orderBy(desc(count())),
    db.select({ name: applications.source, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(where).groupBy(applications.source),
    db.select({ date: sql<string>`${localDate}::text`, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(where).groupBy(localDate).orderBy(localDate),
    db.select({ total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(where, incomplete)),
    db.select({ total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(where, inArray(applications.status, ["pending", "specialist_review"]), lt(applications.updatedAt, new Date(Date.now() - 14 * 86400000)))),
    db.select({ total: count() }).from(users).where(and(...expertClauses)),
    db.select({ name: users.fullName, role: users.role, total: count() }).from(statusHistory).innerJoin(applications, eq(statusHistory.applicationId, applications.id)).innerJoin(activists, eq(applications.activistId, activists.id)).innerJoin(users, eq(statusHistory.actorId, users.id)).where(and(where, inArray(users.role, ["reviewer", "specialist"]), or(eq(statusHistory.toStatus, "needs_correction"), eq(statusHistory.fromStatus, "specialist_review"), eq(statusHistory.toStatus, "specialist_review")))).groupBy(users.id, users.fullName, users.role).orderBy(desc(count())).limit(20),
    db.select().from(provinces).orderBy(provinces.name), db.select().from(counties).orderBy(counties.name), db.select().from(specialties).orderBy(specialties.id),
  ]);
  const statusMap = Object.fromEntries(statuses.map((item) => [item.name, item.total])) as Partial<Record<AppStatus, number>>;
  const total = statuses.reduce((sum, item) => sum + item.total, 0);
  const submitted = total - (statusMap.initial || 0) - (statusMap.draft || 0) - (statusMap.completing || 0) - (statusMap.ready || 0);
  const completionRate = submitted > 0 ? Math.round((((statusMap.approved || 0) + (statusMap.rejected || 0)) / submitted) * 100) : 0;
  const timeline = monthTimeline(daily, filters.toIso);
  const selectedLabels = [filters.provinceId && `استان: ${allProvinces.find((p) => p.id === filters.provinceId)?.name || "نامشخص"}`, filters.countyId && `شهرستان: ${allCounties.find((c) => c.id === filters.countyId)?.name || "نامشخص"}`, filters.specialtyId && `تخصص: ${allSpecialties.find((s) => s.id === filters.specialtyId)?.title || "نامشخص"}`, filters.status && `وضعیت: ${statusLabels[filters.status]}`, filters.from && `از: ${filters.from}`, filters.to && `تا: ${filters.to}`].filter((item): item is string => !!item);
  return { total, completionRate, statusMap, provinceStats, countyStats, specialtyStats, sources, timeline, incomplete: incompleteCount[0]?.total || 0, overdue: overdueCount[0]?.total || 0, activeExperts: expertCount[0]?.total || 0, performance, selectedLabels, allProvinces, allCounties, allSpecialties };
}
export type ReportData = Awaited<ReturnType<typeof getReportData>>;
