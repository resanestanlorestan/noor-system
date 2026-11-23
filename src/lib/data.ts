import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activists, applications, counties, documents, expertReferrals, provinces, specialties, userSpecialties } from "@/db/schema";
import type { MaybeSessionUser, SessionUser } from "@/lib/auth";
import { referenceProvinces, referenceSpecialties } from "@/lib/constants";
import { documentsChecks, identityChecks, locationChecks, specialtiesChecks } from "@/lib/case-steps";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import type { CaseFieldMetaMap } from "@/lib/case-field-catalog";

export async function ensureReferenceData() {
  await db.insert(provinces).values(referenceProvinces.map(([name]) => ({ name }))).onConflictDoNothing();
  // (مرحله چهارم) Reference specialty rows are upserted: existing rows keep
  // their id/code (so stored selections never break) while display titles are
  // synced with the current labels (e.g. مربی قرآن → معلم قرآن). Only the
  // reference codes are inserted here, so a conflict is always a reference row.
  await db.insert(specialties).values(referenceSpecialties).onConflictDoUpdate({
    target: specialties.code, set: { title: sql`excluded.title` },
  });
  const list = await db.select().from(provinces);
  const ids = new Map(list.map((province) => [province.name, province.id]));
  await db.insert(counties).values(referenceProvinces.map(([name, county]) => ({ provinceId: ids.get(name)!, name: county }))).onConflictDoNothing();
}
export function scopeCondition(user: MaybeSessionUser): SQL {
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return sql`true`;
  if (role === "activist") return eq(activists.userId, user.id);
  if (!user.provinceId || (role === "county_admin" && !user.countyId)) return sql`false`;
  const geo = user.countyId ? and(eq(activists.provinceId, user.provinceId), eq(activists.countyId, user.countyId))! : eq(activists.provinceId, user.provinceId);
  if (role === "reviewer") return and(geo, or(eq(applications.assignedExpertId, user.id), eq(applications.createdBy, user.id)))!;
  if (role === "specialist") {
    const referred = sql`exists (select 1 from ${expertReferrals} inner join ${userSpecialties} on ${userSpecialties.userId} = ${expertReferrals.specialistId} and ${userSpecialties.specialtyId} = ${expertReferrals.specialtyId} where ${expertReferrals.applicationId} = ${applications.id} and ${expertReferrals.specialistId} = ${user.id} and ${expertReferrals.status} = 'pending')`;
    return and(geo, referred)!;
  }
  return geo;
}
/** Manager group = capability-agnostic supervision roles; uses the effective
 *  (custom-role base) role so a custom role based on a manager role behaves
 *  like one. */
export const isManager = (user: Pick<MaybeSessionUser, "effectiveRole" | "role">) => ["super_admin", "province_admin", "county_admin"].includes(user.effectiveRole ?? user.role);
// الحاقیهٔ ۲.۱۰.۴ — پروندهٔ «حذف‌شده از فهرست فعال» برای همهٔ اکشن‌ها و صفحات
// کاری به‌صورت «پیدا نشد» برخورد می‌شود (همین یک گارد مرکزی، گردش‌کار، سابقه‌ها،
// یادداشت‌ها و مدارک را قفل می‌کند)؛ تنها جزئیات پرونده برای مدیر کل — برای
// بازبینی پیش از بازیابی یا حذف کلی — با allowDeleted باز می‌شود.
export async function getCaseForUser(user: MaybeSessionUser, id: string, opts?: { allowDeleted?: boolean }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await db.select({ application: applications, activist: activists }).from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .where(and(eq(applications.id, id), scopeCondition(user), opts?.allowDeleted ? undefined : isNull(applications.deletedAt))).limit(1);
  return row || null;
}
// الحاقیهٔ ۲.۲۶.۰ — گیت ارسال از موتور مرحله‌ها می‌خواند: برچسب، الزام و
// مخفی‌بودن فیلدهای ثابت از override مدیر (/steps) پیروی می‌کند؛ در نبود meta
// (فراخوانی‌های کهن) پیش‌فرض کاتالوگ اعمال می‌شود.
export function missingRequired(activist: typeof activists.$inferSelect, specialtyCount: number, documentCount: number, photoOk = true, fieldMeta?: CaseFieldMetaMap) {
  const missing: string[] = [
    ...identityChecks(activist, fieldMeta).map((check) => check.label),
    ...locationChecks(activist, fieldMeta).map((check) => check.label),
    ...specialtiesChecks({ specialtyCount, specialtyDetailMissing: [] }, fieldMeta).map((check) => check.label),
    ...documentsChecks({ evidenceCount: documentCount, photoOk }, fieldMeta).map((check) => check.label),
  ];
  return missing;
}
export async function completeness(activist: typeof activists.$inferSelect, applicationId: string) {
  const [specs, docs, fieldMeta] = await Promise.all([
    db.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, activist.id)),
    // the personnel photo is not an evidence document and never satisfies this check
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "evidence"))),
    loadCaseFieldMeta(),
  ]);
  return missingRequired(activist, specs.length, docs.length, Boolean(activist.photoDocumentId), fieldMeta);
}
