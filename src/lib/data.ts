// Data-access helpers shared by pages and actions: scoped case loading,
// completeness checks and the required-field gate for submission.

import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activistWritings, activityRecords, applications, documents, educationRecords, workHistory } from "@/db/schema";
import { requiredIdentityFields } from "@/lib/constants";
import { isManager, managerInScope, type ManagerUser } from "@/lib/workflow-utils";
import type { SessionUser } from "@/lib/auth";
import type { AppStatus } from "@/lib/constants";

export { isManager, managerInScope };

export type CaseRow = {
  application: typeof applications.$inferSelect;
  activist: typeof activists.$inferSelect;
};

// imported late to avoid circular type inference noise
import { activists } from "@/db/schema";

/** Row-level scoping: managers see their province/county, experts their caseload, activists their own case. */
export function scopeCondition(user: SessionUser): SQL {
  const role = user.effectiveRole || user.role;
  if (role === "super_admin") return sql`true`;
  if (role === "province_admin") {
    return user.provinceId ? sql`${activists.provinceId} = ${user.provinceId}` : sql`false`;
  }
  if (role === "county_admin") {
    if (user.provinceId && user.countyId) return sql`(${activists.provinceId} = ${user.provinceId} AND ${activists.countyId} = ${user.countyId})`;
    return user.provinceId ? sql`${activists.provinceId} = ${user.provinceId}` : sql`false`;
  }
  if (role === "reviewer" || role === "specialist") {
    return sql`${activists.provinceId} = ${user.provinceId ?? -1}`;
  }
  return sql`${activists.userId} = ${user.id}`;
}

/** Loads one case with scope enforcement; returns null when out of scope. */
export async function getCaseForUser(user: SessionUser, caseId: string): Promise<CaseRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) return null;
  const [row] = await db
    .select({ application: applications, activist: activists })
    .from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .where(and(eq(applications.id, caseId), scopeCondition(user)))
    .limit(1);
  return row ?? null;
}

export function isManagerUser(user: SessionUser): boolean {
  return isManager(user);
}

/** Missing required identity/attachment fields before a case can be marked ready. Synchronous — mirrors the case-actions contract. */
export function missingRequired(
  activist: typeof activists.$inferSelect,
  specialtiesCount: number,
  documentsCount: number,
): string[] {
  const missing: string[] = [];
  requiredIdentityFields(missing, {
    firstName: activist.firstName, lastName: activist.lastName, fatherName: activist.fatherName,
    nationalIdHash: activist.nationalIdHash, birthDate: activist.birthDate, gender: activist.gender,
    phone: activist.phone, alternatePhone: activist.alternatePhone, idCardNumber: activist.idCardNumber,
    idIssuePlace: activist.idIssuePlace, provinceId: activist.provinceId,
  });
  if (!activist.job) missing.push("شغل");
  if (!specialtiesCount) missing.push("انتخاب حداقل یک تخصص");
  if (!documentsCount) missing.push("بارگذاری حداقل یک مدرک");
  return missing;
}

/** Full completeness audit used before final approval. */
export async function completeness(activist: typeof activists.$inferSelect, applicationId: string): Promise<string[]> {
  const missing: string[] = [];
  requiredIdentityFields(missing, {
    firstName: activist.firstName, lastName: activist.lastName, fatherName: activist.fatherName,
    nationalIdHash: activist.nationalIdHash, birthDate: activist.birthDate, gender: activist.gender,
    phone: activist.phone, alternatePhone: activist.alternatePhone, idCardNumber: activist.idCardNumber,
    idIssuePlace: activist.idIssuePlace, provinceId: activist.provinceId,
  });
  const [specs, docs, edu, works, activities] = await Promise.all([
    db.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, activist.id)),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "evidence"))),
    db.select({ id: educationRecords.id }).from(educationRecords).where(eq(educationRecords.activistId, activist.id)),
    db.select({ id: workHistory.id }).from(workHistory).where(eq(workHistory.activistId, activist.id)),
    db.select({ id: activityRecords.id }).from(activityRecords).where(eq(activityRecords.activistId, activist.id)),
  ]);
  if (!specs.length) missing.push("تخصص‌ها");
  if (!docs.length) missing.push("مدارک پیوست");
  if (!edu.length) missing.push("اطلاعات تحصیلی");
  // (مرحله پنجم) at least one work-history row OR one activity record is required
  if (!works.length && !activities.length) missing.push("سوابق کاری یا سوابق فعالیت");
  return missing;
}

/** Writing counts for dashboard/profile summaries. */
export async function countWritings(activistId: string): Promise<number> {
  const rows = await db.select({ id: activistWritings.id }).from(activistWritings).where(eq(activistWritings.activistId, activistId));
  return rows.length;
}

export type StatusCount = { status: AppStatus; count: number };

export async function statusCountsForScope(user: SessionUser): Promise<StatusCount[]> {
  const rows = await db
    .select({ status: applications.status, count: sql<number>`count(*)::int` })
    .from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .where(scopeCondition(user))
    .groupBy(applications.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}
