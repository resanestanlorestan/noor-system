import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { activistSpecialties, activists, applications, counties, provinces, specialties, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { isManager, scopeCondition } from "@/lib/data";
import { normalizeDigits } from "@/lib/format";
import { jalaliToIso } from "@/lib/format";
import { protectNationalId } from "@/lib/local-secrets";
import { sourceLabels, statusLabels, type AppStatus } from "@/lib/constants";

export const sortLabels = { newest: "جدیدترین", oldest: "قدیمی‌ترین", name: "نام (الفبا)" } as const;
export type CaseSort = keyof typeof sortLabels;
export type AppSource = keyof typeof sourceLabels;
export type CaseSearchInput = { q?: string; status?: string; provinceId?: string; countyId?: string; specialtyId?: string; expertId?: string; source?: string; institution?: string; from?: string; to?: string; sort?: string };
export type CaseSearchFilters = { q: string; status?: AppStatus; provinceId?: number; countyId?: number; specialtyId?: number; expertId?: string; source?: AppSource; institution?: string; from?: string; to?: string; fromIso?: string; toIso?: string; sort: CaseSort };

export function parseCaseFilters(input: CaseSearchInput): { filters: CaseSearchFilters; error?: string } {
  const q = (input.q || "").trim().slice(0, 100);
  const sort: CaseSort = input.sort && Object.hasOwn(sortLabels, input.sort) ? (input.sort as CaseSort) : "newest";
  const filters: CaseSearchFilters = { q, sort };
  if (input.status) {
    if (!Object.hasOwn(statusLabels, input.status)) return { filters, error: "وضعیت پرونده معتبر نیست." };
    filters.status = input.status as AppStatus;
  }
  if (input.source) {
    if (!Object.hasOwn(sourceLabels, input.source)) return { filters, error: "منبع ثبت معتبر نیست." };
    filters.source = input.source as AppSource;
  }
  for (const key of ["provinceId", "countyId", "specialtyId"] as const) {
    const raw = input[key]; if (!raw) continue;
    if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) return { filters, error: "فیلتر انتخاب‌شده معتبر نیست." };
    filters[key] = Number(raw);
  }
  if (input.expertId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.expertId)) return { filters, error: "کارشناس مسئول معتبر نیست." };
    filters.expertId = input.expertId;
  }
  const institution = (input.institution || "").trim().slice(0, 120);
  if (institution) filters.institution = institution;
  for (const key of ["from", "to"] as const) {
    const raw = input[key]?.trim(); if (!raw) continue;
    const iso = jalaliToIso(raw); if (!iso) return { filters, error: "تاریخ‌ها را به شکل شمسی معتبر، مانند ۱۴۰۳/۰۱/۰۱ وارد کنید." };
    filters[key] = raw; filters[key === "from" ? "fromIso" : "toIso"] = iso;
  }
  if (filters.fromIso && filters.toIso && filters.fromIso > filters.toIso) return { filters, error: "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد." };
  return { filters };
}

export async function buildCaseWhere(user: SessionUser, filters: CaseSearchFilters): Promise<SQL> {
  const conditions: SQL[] = [scopeCondition(user)];
  if (filters.q) {
    const input = normalizeDigits(filters.q);
    const matching = [ilike(activists.firstName, `%${filters.q}%`), ilike(activists.lastName, `%${filters.q}%`), ilike(activists.phone, `%${input}%`)];
    if (/^\d{10}$/.test(input)) matching.push(eq(activists.nationalIdHash, (await protectNationalId(input)).hash));
    conditions.push(or(...matching)!);
  }
  if (filters.status) conditions.push(eq(applications.status, filters.status));
  if (filters.expertId) conditions.push(eq(applications.assignedExpertId, filters.expertId));
  if (filters.source) conditions.push(eq(applications.source, filters.source));
  if (filters.institution) conditions.push(ilike(activists.organization, `%${filters.institution}%`));
  const localDate = sql`(${applications.createdAt} at time zone 'Asia/Tehran')::date`;
  if (filters.fromIso) conditions.push(sql`${localDate} >= ${filters.fromIso}::date`);
  if (filters.toIso) conditions.push(sql`${localDate} <= ${filters.toIso}::date`);
  if (filters.provinceId) conditions.push(eq(activists.provinceId, filters.provinceId));
  if (filters.countyId) conditions.push(eq(activists.countyId, filters.countyId));
  if (filters.specialtyId) conditions.push(sql`exists (select 1 from ${activistSpecialties} where ${activistSpecialties.activistId} = ${activists.id} and ${activistSpecialties.specialtyId} = ${filters.specialtyId})`);
  return and(...conditions)!;
}

function orderFor(sort: CaseSort) {
  return sort === "oldest" ? [asc(applications.createdAt)] : sort === "name" ? [asc(activists.lastName), asc(activists.firstName)] : [desc(applications.createdAt)];
}

export async function searchCases(user: SessionUser, filters: CaseSearchFilters, page: number, pageSize = 10) {
  const where = await buildCaseWhere(user, filters);
  const [rows, totals] = await Promise.all([
    db.select({ id: applications.id, firstName: activists.firstName, lastName: activists.lastName, nationalIdLast4: activists.nationalIdLast4, status: applications.status, createdAt: applications.createdAt, province: provinces.name, county: counties.name })
      .from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).leftJoin(provinces, eq(activists.provinceId, provinces.id)).leftJoin(counties, eq(activists.countyId, counties.id))
      .where(where).orderBy(...orderFor(filters.sort)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(where),
  ]);
  return { rows, total: totals[0]?.total || 0 };
}

export const MAX_EXPORT_ROWS = 5000;
export async function searchCasesForExport(user: SessionUser, filters: CaseSearchFilters) {
  if (!isManager(user)) throw new Error("Forbidden");
  const where = await buildCaseWhere(user, filters);
  const activityProvince = alias(provinces, "activity_province");
  const activityCounty = alias(counties, "activity_county");
  const rows = await db.select({
    firstName: activists.firstName, lastName: activists.lastName, nationalIdLast4: activists.nationalIdLast4, phone: activists.phone,
    idCardNumber: activists.idCardNumber, idIssuePlace: activists.idIssuePlace, postalCode: activists.postalCode,
    status: applications.status, source: applications.source, createdAt: applications.createdAt, province: provinces.name, county: counties.name,
    activityProvince: activityProvince.name, activityCounty: activityCounty.name,
    specialty: sql<string | null>`(select string_agg(${specialties.title}, '، ') from ${activistSpecialties} inner join ${specialties} on ${specialties.id} = ${activistSpecialties.specialtyId} where ${activistSpecialties.activistId} = ${activists.id})`,
  }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id))
    .leftJoin(provinces, eq(activists.provinceId, provinces.id)).leftJoin(counties, eq(activists.countyId, counties.id))
    .leftJoin(activityProvince, eq(activists.activityProvinceId, activityProvince.id)).leftJoin(activityCounty, eq(activists.activityCountyId, activityCounty.id))
    .where(where).orderBy(...orderFor(filters.sort)).limit(MAX_EXPORT_ROWS + 1);
  return { rows: rows.slice(0, MAX_EXPORT_ROWS), truncated: rows.length > MAX_EXPORT_ROWS };
}

export function caseFilterQuery(filters: CaseSearchFilters) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.provinceId) query.set("provinceId", String(filters.provinceId));
  if (filters.countyId) query.set("countyId", String(filters.countyId));
  if (filters.specialtyId) query.set("specialtyId", String(filters.specialtyId));
  if (filters.expertId) query.set("expertId", filters.expertId);
  if (filters.source) query.set("source", filters.source);
  if (filters.institution) query.set("institution", filters.institution);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.sort !== "newest") query.set("sort", filters.sort);
  return query.toString();
}

/** Experts (reviewer/specialist) available for the assigned-expert filter, scoped to the user's reach. */
export async function listFilterableExperts(user: SessionUser) {
  if (!isManager(user)) return [];
  const clauses = [eq(users.active, true), inArray(users.role, ["reviewer", "specialist"] as const)];
  if (user.effectiveRole !== "super_admin") {
    if (!user.provinceId || (user.effectiveRole === "county_admin" && !user.countyId)) return [];
    clauses.push(eq(users.provinceId, user.provinceId));
    if (user.countyId) clauses.push(eq(users.countyId, user.countyId));
  }
  return db.select({ id: users.id, fullName: users.fullName, role: users.role }).from(users).where(and(...clauses)).orderBy(asc(users.fullName)).limit(200);
}
