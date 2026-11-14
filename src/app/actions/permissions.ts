"use server";
// Administration of the fine-grained permission matrix (gap item 17).
// Every mutation requires the `permissions.manage` capability and is audited.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, customRolePermissions, customRoles, rolePermissions, sessions, users } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { roleLabels, type UserRole } from "@/lib/constants";
import { normalizeText } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";
import { can, isPermissionKey, permissionCatalogue, protectedGrants, roleDefaultPermissions } from "@/lib/permissions";
import { isUuid } from "@/lib/workflow-utils";

const SYSTEM_ROLES = Object.keys(roleLabels) as UserRole[];

const deny = (message: string) => ({ error: message });

/** The current user must hold permissions.manage; returns the actor or null. */
async function manager() {
  const actor = await requireUser();
  if (!(await can(actor, "permissions.manage"))) return null;
  return actor;
}

function refresh() { revalidatePath("/permissions"); revalidatePath("/users"); }

export async function toggleRolePermissionAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await manager();
  if (!actor) return deny("فقط مدیر دارای مجوز «مدیریت نقش‌ها و مجوزها» می‌تواند ماتریس را تغییر دهد.");
  const roleKey = String(data.get("roleKey") || "") as UserRole;
  const permissionKey = String(data.get("permissionKey") || "");
  const allow = String(data.get("allow") || "") === "1";
  if (!SYSTEM_ROLES.includes(roleKey)) return deny("نقش سامانه‌ای معتبر انتخاب نشده است.");
  if (!isPermissionKey(permissionKey)) return deny("کلید مجوز معتبر نیست.");
  if (!allow && protectedGrants(roleKey, actor.effectiveRole).includes(permissionKey)) {
    return deny(roleKey === "super_admin"
      ? "مجوز «مدیریت نقش‌ها و مجوزها» برای نقش مدیر کل قابل حذف نیست."
      : "حذف مجوز «مدیریت نقش‌ها و مجوزها» از نقشِ خودتان مجاز نیست؛ ابتدا آن را برای حساب دیگری فراهم کنید.");
  }
  try {
    if (allow) await db.insert(rolePermissions).values({ roleKey, permissionKey }).onConflictDoNothing();
    else await db.delete(rolePermissions).where(and(eq(rolePermissions.roleKey, roleKey), eq(rolePermissions.permissionKey, permissionKey)));
  } catch { return deny("ثبت تغییر ماتریس انجام نشد؛ دوباره تلاش کنید."); }
  await audit(actor.id, "role_permission_changed", "role", roleKey, `${permissionKey}:${allow ? "grant" : "revoke"}`);
  refresh();
  return { success: allow ? "مجوز افزوده شد." : "مجوز حذف شد." };
}

export async function resetRoleDefaultsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await manager();
  if (!actor) return deny("فقط مدیر دارای مجوز «مدیریت نقش‌ها و مجوزها» می‌تواند ماتریس را تغییر دهد.");
  const roleKey = String(data.get("roleKey") || "") as UserRole;
  if (!SYSTEM_ROLES.includes(roleKey)) return deny("نقش سامانه‌ای معتبر انتخاب نشده است.");
  const defaults = roleDefaultPermissions[roleKey];
  try {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleKey, roleKey));
      await tx.insert(rolePermissions).values(defaults.map((permissionKey) => ({ roleKey, permissionKey })));
    });
  } catch { return deny("بازنشانی انجام نشد؛ دوباره تلاش کنید."); }
  await audit(actor.id, "role_defaults_restored", "role", roleKey);
  refresh();
  return { success: "مجوزهای پیش‌فرض این نقش بازنشانی شد." };
}

export async function saveCustomRoleAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await manager();
  if (!actor) return deny("فقط مدیر دارای مجوز «مدیریت نقش‌ها و مجوزها» می‌تواند نقش سفارشی تعریف کند.");
  const id = String(data.get("customRoleId") || "");
  const label = normalizeText(String(data.get("label") || "")).slice(0, 100);
  const description = normalizeText(String(data.get("description") || "")).slice(0, 500);
  const baseRole = String(data.get("baseRole") || "") as UserRole;
  const keys = [...new Set(data.getAll("permissionKeys").map((value) => String(value)).filter((value) => isPermissionKey(value)))];
  if (label.length < 3) return deny("عنوان نقش سفارشی را با حداقل ۳ نویسه وارد کنید.");
  if (!SYSTEM_ROLES.includes(baseRole)) return deny("نقش پایه (مبنای محدوده دسترسی جغرافیایی) را انتخاب کنید.");
  const editing = isUuid(id);
  try {
    const roleId = await db.transaction(async (tx) => {
      let target = id;
      if (editing) {
        const [existing] = await tx.select({ id: customRoles.id }).from(customRoles).where(eq(customRoles.id, id)).limit(1);
        if (!existing) throw new Error("missing");
        await tx.update(customRoles).set({ label, baseRole, description: description || null, updatedAt: new Date() }).where(eq(customRoles.id, id));
        await tx.delete(customRolePermissions).where(eq(customRolePermissions.customRoleId, id));
      } else {
        const [created] = await tx.insert(customRoles).values({ label, baseRole, description: description || null, createdBy: actor.id }).returning({ id: customRoles.id });
        target = created.id;
      }
      if (keys.length) await tx.insert(customRolePermissions).values(keys.map((permissionKey) => ({ customRoleId: target, permissionKey })));
      if (editing) {
        // Base role or grants may change scope/capabilities: invalidate live sessions.
        const assigned = await tx.select({ id: users.id }).from(users).where(eq(users.customRoleId, target));
        if (assigned.length) await tx.delete(sessions).where(inArray(sessions.userId, assigned.map((row) => row.id)));
      }
      await tx.insert(auditLogs).values({ actorId: actor.id, action: editing ? "custom_role_updated" : "custom_role_created", targetType: "custom_role", targetId: target, detail: `${label}|base:${baseRole}|grants:${keys.length}` });
      return target;
    });
    void roleId;
  } catch (error) {
    if ((error as Error).message === "missing") return deny("نقش سفارشی موردنظر پیدا نشد.");
    return deny("ثبت نقش سفارشی انجام نشد؛ دوباره تلاش کنید.");
  }
  refresh();
  return { success: editing ? "نقش سفارشی به‌روزرسانی شد." : "نقش سفارشی جدید ایجاد شد." };
}

export async function deleteCustomRoleAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await manager();
  if (!actor) return deny("فقط مدیر دارای مجوز «مدیریت نقش‌ها و مجوزها» می‌تواند نقش سفارشی را حذف کند.");
  const id = String(data.get("customRoleId") || "");
  if (!isUuid(id)) return deny("شناسه نقش سفارشی معتبر نیست.");
  const [assigned] = await db.select({ id: users.id }).from(users).where(eq(users.customRoleId, id)).limit(1);
  if (assigned) return deny("ابتدا این نقش را از حساب کاربران تخصیص‌یافته بردارید؛ حذف نقش در حال استفاده مجاز نیست.");
  try {
    const [existing] = await db.select({ label: customRoles.label }).from(customRoles).where(eq(customRoles.id, id)).limit(1);
    if (!existing) return deny("نقش سفارشی موردنظر پیدا نشد.");
    await db.delete(customRoles).where(eq(customRoles.id, id));
    await audit(actor.id, "custom_role_deleted", "custom_role", id, existing.label);
  } catch { return deny("حذف نقش سفارشی انجام نشد؛ دوباره تلاش کنید."); }
  refresh();
  return { success: "نقش سفارشی حذف شد." };
}

/** Server-side snapshot used by the /permissions page. */
export async function loadMatrix() {
  const actor = await requireUser();
  if (!(await can(actor, "permissions.manage"))) return null;
  const [grants, customRoleRows, assignments, customGrants] = await Promise.all([
    db.select().from(rolePermissions),
    db.select().from(customRoles).orderBy(customRoles.createdAt),
    db.select({ id: users.id, customRoleId: users.customRoleId }).from(users).where(isNotNull(users.customRoleId)),
    db.select().from(customRolePermissions),
  ]);
  const countByRole = new Map<string, number>();
  for (const row of assignments) if (row.customRoleId) countByRole.set(row.customRoleId, (countByRole.get(row.customRoleId) ?? 0) + 1);
  const systemGrants: Record<string, string[]> = {};
  for (const row of grants) (systemGrants[row.roleKey] ??= []).push(row.permissionKey);
  for (const role of SYSTEM_ROLES) if (!systemGrants[role]?.length) systemGrants[role] = [...roleDefaultPermissions[role]];
  return {
    catalogue: permissionCatalogue,
    systemRoles: SYSTEM_ROLES,
    systemGrants,
    customRoles: customRoleRows.map((role) => ({ ...role, userCount: countByRole.get(role.id) ?? 0, permissions: customGrants.filter((grant) => grant.customRoleId === role.id).map((grant) => grant.permissionKey) })),
    viewerEffectiveRole: actor.effectiveRole,
  };
}
