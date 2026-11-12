// Fine-grained permission matrix (requirement section 12 — «ماتریس مجوز ریزدانه»).
//
// Design notes:
// - The catalogue below is the single source of truth for every capability key
//   and its Persian label/category. Server actions and page guards call
//   `can(user, key)` instead of comparing `user.role` directly.
// - `roleDefaultPermissions` mirrors the exact behaviour the six built-in roles
//   had before the matrix existed; migration 0004 seeds these into
//   `role_permissions`, making the database rows authoritative afterwards.
// - Custom roles («نقش سفارشی») extend the model: a custom row carries a base
//   role (which only drives DATA SCOPING) and its own explicit grant list
//   (which drives CAPABILITIES). A user assigned a custom role gets
//   `effectiveRole = customRole.baseRole` and capabilities only from the
//   custom grant list.
// - Grants are cached per user object instance (WeakMap): one query per
//   session user per request, no cross-request staleness, no global memo that
//   could leak between feature-test users.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customRolePermissions, rolePermissions } from "@/db/schema";
import type { UserRole } from "@/lib/constants";

export type PermissionCategory = "پرونده‌ها" | "کاربران" | "تنظیمات پایه" | "پیام‌ها" | "رویدادها" | "گزارش و نظارت" | "دسترسی‌ها";

export type PermissionDef = { key: string; label: string; category: PermissionCategory; hint?: string };

export const permissionCatalogue: PermissionDef[] = [
  { key: "cases.view_all", label: "مشاهده بانک پرونده‌ها و کارتابل‌ها", category: "پرونده‌ها", hint: "مشاهده پرونده‌های درون محدوده جغرافیایی نقش" },
  { key: "cases.create", label: "ثبت پرونده جدید", category: "پرونده‌ها" },
  { key: "cases.edit", label: "ویرایش و تکمیل پرونده", category: "پرونده‌ها", hint: "وضعیت‌های پیش‌نویس، در حال تکمیل و نیازمند اصلاح؛ شامل بارگذاری مدرک و تصویر پرسنلی" },
  { key: "cases.submit", label: "آماده‌سازی و ارسال پرونده برای بررسی", category: "پرونده‌ها" },
  { key: "cases.review", label: "اعلام نقص و درخواست اصلاح", category: "پرونده‌ها", hint: "اقدام در کارتابل بررسی؛ برای کارشناس بررسی منوط به ارجاع پرونده" },
  { key: "cases.decide", label: "تصمیم نهایی تأیید یا رد پرونده", category: "پرونده‌ها", hint: "تصمیم‌گیرنده باید مستقل از ثبت‌کننده پرونده باشد" },
  { key: "cases.assign_expert", label: "ارجاع پرونده به کارشناس بررسی", category: "پرونده‌ها" },
  { key: "cases.refer_specialist", label: "ارجاع پرونده به بررسی تخصصی", category: "پرونده‌ها" },
  { key: "cases.specialist_opinion", label: "ثبت نظر تخصصی", category: "پرونده‌ها", hint: "کارشناس متقاضی‌شده در حوزه تخصصی پرونده" },
  { key: "cases.expert_notes", label: "ثبت یادداشت کارشناسی روی پرونده", category: "پرونده‌ها", hint: "یادداشت داخلی تیم بررسی؛ فعالِ صاحب پرونده این یادداشت‌ها را نمی‌بیند" },
  { key: "cases.request_revision", label: "درخواست بازنگری پرونده تأییدشده", category: "پرونده‌ها", hint: "با حفظ خودکار نسخه قبلی" },
  { key: "cases.appeal_submit", label: "ثبت اعتراض به نتیجه پرونده", category: "پرونده‌ها" },
  { key: "cases.appeal_manage", label: "ارجاع و تعیین تکلیف اعتراض", category: "پرونده‌ها", hint: "مسئول بررسی اعتراض باید مستقل از تصمیم‌گیرنده اولیه باشد" },
  { key: "cases.restore_version", label: "بازگردانی نسخه قبلی پرونده", category: "پرونده‌ها" },
  { key: "cases.claim", label: "اتصال پرونده ثبت‌شده به حساب شخصی", category: "پرونده‌ها" },
  { key: "cases.export", label: "خروجی اکسل فهرست پرونده‌ها", category: "پرونده‌ها" },
  { key: "users.manage", label: "مدیریت کاربران سازمانی", category: "کاربران", hint: "ایجاد، ویرایش و فعال/غیرفعال‌سازی حساب‌های سازمانی در محدوده مدیریتی" },
  { key: "settings.geo", label: "مدیریت تقسیمات جغرافیایی", category: "تنظیمات پایه", hint: "افزودن شهرستان به استان‌ها" },
  { key: "settings.references", label: "مدیریت تخصص‌ها و سازمان‌ها", category: "تنظیمات پایه" },
  { key: "messages.broadcast", label: "ارسال پیام گروهی به فعالان", category: "پیام‌ها", hint: "اطلاع‌رسانی دسته‌جمعی پیامک و اعلان به فعالان محدوده مدیریتی بر اساس فیلتر جغرافیا، تخصص و وضعیت پرونده" },
  { key: "events.manage", label: "مدیریت رویدادها و اطلاع‌رسانی آن‌ها", category: "رویدادها", hint: "ثبت رویدادهای کشوری/استانی/شهرستانی، دعوت فعالان و یادآور پیامکی پیش از رویداد" },
  { key: "reports.view", label: "مشاهده گزارش‌ها و آمار", category: "گزارش و نظارت" },
  { key: "reminders.send", label: "ارسال یادآور پیامکی پرونده‌های معوق", category: "گزارش و نظارت", hint: "ارسال یادآور به مسئول هر پرونده معوق؛ در صفحات «یادآور معوق‌ها» و کرون روزانه" },
  { key: "audit.view", label: "مشاهده رویدادهای حساس", category: "گزارش و نظارت" },
  { key: "outbox.view", label: "مشاهده صندوق پیام‌ها", category: "گزارش و نظارت" },
  { key: "permissions.manage", label: "مدیریت نقش‌ها و مجوزها", category: "دسترسی‌ها", hint: "تغییر ماتریس مجوزها و تعریف نقش سفارشی" },
];

export const PERMISSION_KEYS = permissionCatalogue.map((item) => item.key) as string[];
export const isPermissionKey = (value: string): value is string => PERMISSION_KEYS.includes(value);

export const permissionCategories: PermissionCategory[] = [...new Set(permissionCatalogue.map((item) => item.category))];

export const permissionLabel = (key: string) => permissionCatalogue.find((item) => item.key === key)?.label ?? key;

/** Defaults exactly mirror pre-matrix behaviour of the six built-in roles. */
export const roleDefaultPermissions: Record<UserRole, string[]> = {
  super_admin: PERMISSION_KEYS,
  province_admin: [
    "cases.view_all", "cases.create", "cases.edit", "cases.submit", "cases.review", "cases.decide",
    "cases.assign_expert", "cases.refer_specialist", "cases.expert_notes", "cases.request_revision", "cases.appeal_manage",
    "cases.restore_version", "cases.export", "users.manage", "reports.view", "reminders.send",
    "messages.broadcast", "events.manage",
  ],
  county_admin: [
    "cases.view_all", "cases.create", "cases.edit", "cases.submit", "cases.review", "cases.decide",
    "cases.assign_expert", "cases.refer_specialist", "cases.expert_notes", "cases.request_revision", "cases.appeal_manage",
    "cases.restore_version", "cases.export", "reports.view", "reminders.send",
    "messages.broadcast", "events.manage",
  ],
  reviewer: [
    "cases.view_all", "cases.create", "cases.edit", "cases.submit", "cases.review",
    "cases.refer_specialist", "cases.expert_notes", "cases.restore_version",
  ],
  specialist: ["cases.view_all", "cases.specialist_opinion"],
  activist: ["cases.create", "cases.edit", "cases.submit", "cases.request_revision", "cases.appeal_submit", "cases.restore_version", "cases.claim"],
};

const MANAGE = "permissions.manage";

type PermissionSubject = { role: UserRole; customRoleId: string | null };
type SessionLike = PermissionSubject & { effectiveRole?: UserRole };

const grantsCache = new WeakMap<object, Promise<Set<string>>>();

async function loadGrants(subject: PermissionSubject): Promise<Set<string>> {
  if (subject.customRoleId) {
    const rows = await db.select({ key: customRolePermissions.permissionKey }).from(customRolePermissions).where(eq(customRolePermissions.customRoleId, subject.customRoleId));
    return new Set(rows.map((row) => row.key));
  }
  const rows = await db.select({ key: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleKey, subject.role));
  if (rows.length) return new Set(rows.map((row) => row.key));
  return new Set(roleDefaultPermissions[subject.role] ?? []);
}

/** Effective capability set for a user; memoised per user-object instance. */
export function effectivePermissions(subject: PermissionSubject): Promise<Set<string>> {
  let cached = grantsCache.get(subject);
  if (!cached) { cached = loadGrants(subject); grantsCache.set(subject, cached); }
  return cached;
}

export async function can(subject: SessionLike | null | undefined, key: string): Promise<boolean> {
  if (!subject) return false;
  return (await effectivePermissions(subject)).has(key);
}

/** Permissions that may never be revoked, per role key. */
export function protectedGrants(roleKey: string, viewerEffectiveRole: UserRole): string[] {
  const locked: string[] = [];
  if (roleKey === "super_admin" || roleKey === viewerEffectiveRole) locked.push(MANAGE);
  return locked;
}
