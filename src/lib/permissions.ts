// Permission matrix: capability checks per system role. Custom roles map to
// their base_role for scoping and use their own grant list when defined.

export type Role = "super_admin" | "province_admin" | "county_admin" | "reviewer" | "specialist" | "activist";

export type Permission =
  | "users.manage"
  | "cases.create"
  | "cases.edit"
  | "cases.view_all"
  | "cases.review"
  | "cases.decide"
  | "cases.assign_expert"
  | "cases.submit"
  | "cases.export"
  | "references.manage"
  | "messages.broadcast"
  | "events.manage";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [
    "users.manage", "cases.create", "cases.edit", "cases.view_all", "cases.review",
    "cases.decide", "cases.assign_expert", "cases.submit", "cases.export",
    "references.manage", "messages.broadcast", "events.manage",
  ],
  province_admin: [
    "cases.create", "cases.edit", "cases.view_all", "cases.review", "cases.decide",
    "cases.assign_expert", "cases.submit", "cases.export", "messages.broadcast", "events.manage",
  ],
  county_admin: [
    "cases.create", "cases.edit", "cases.view_all", "cases.review", "cases.submit", "cases.export",
  ],
  reviewer: ["cases.view_all", "cases.review"],
  specialist: ["cases.view_all", "cases.review"],
  activist: ["cases.create", "cases.edit", "cases.submit"],
};

export type PermissionUser = {
  role: Role;
  effectiveRole: Role;
  customPermissions?: readonly Permission[] | null;
};

export async function can(user: PermissionUser, permission: Permission): Promise<boolean> {
  if (user.effectiveRole !== user.role && user.customPermissions) {
    return user.customPermissions.includes(permission);
  }
  return ROLE_PERMISSIONS[user.effectiveRole].includes(permission);
}

export function canSync(user: PermissionUser, permission: Permission): boolean {
  if (user.effectiveRole !== user.role && user.customPermissions) {
    return user.customPermissions.includes(permission);
  }
  return ROLE_PERMISSIONS[user.effectiveRole].includes(permission);
}
