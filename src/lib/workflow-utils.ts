import type { AppUser } from "@/lib/auth";
import type { UserRole } from "@/lib/constants";
import type { activists } from "@/db/schema";

type ScopeUser = Pick<AppUser, "role" | "provinceId" | "countyId" | "active"> & { effectiveRole?: UserRole };

export function managerInScope(user: ScopeUser, person: Pick<typeof activists.$inferSelect, "provinceId" | "countyId">) {
  if (!user.active) return false;
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return true;
  if (!["province_admin", "county_admin"].includes(role) || !user.provinceId || user.provinceId !== person.provinceId) return false;
  if (role === "county_admin") return !!user.countyId && user.countyId === person.countyId;
  return !user.countyId || user.countyId === person.countyId;
}
export function notificationRows(userIds: (string | null | undefined)[], title: string, body: string, applicationId: string) {
  return [...new Set(userIds.filter((id): id is string => !!id))].map((userId) => ({ userId, applicationId, title, body }));
}
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
