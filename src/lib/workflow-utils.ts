// Workflow role helpers shared across actions and pages.

import type { SessionUser } from "@/lib/auth";

export type ManagerUser = SessionUser;

/** Province/county admins and the super admin are "managers". */
export function isManager(user: SessionUser): boolean {
  return ["super_admin", "province_admin", "county_admin"].includes(user.effectiveRole);
}

/** Whether a manager account is inside the geographic scope of an activist row. */
export function managerInScope(
  manager: { role: string; effectiveRole?: string; provinceId: number | null; countyId: number | null },
  activist: { provinceId: number | null; countyId: number | null },
): boolean {
  const role = manager.effectiveRole || manager.role;
  if (role === "super_admin") return true;
  if (role === "province_admin") return manager.provinceId != null && manager.provinceId === activist.provinceId;
  if (role === "county_admin") {
    if (manager.countyId != null) return manager.countyId === activist.countyId && manager.provinceId === activist.provinceId;
    return manager.provinceId != null && manager.provinceId === activist.provinceId;
  }
  return false;
}
