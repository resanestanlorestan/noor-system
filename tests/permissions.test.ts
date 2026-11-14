// Unit tests for the permission matrix catalogue: integrity of keys, defaults
// and the SQL seed in migration 0004 (they must never drift apart).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { permissionCatalogue, permissionCategories, protectedGrants, roleDefaultPermissions, PERMISSION_KEYS } from "@/lib/permissions";
import { roleLabels, type UserRole } from "@/lib/constants";

const ROLES = Object.keys(roleLabels) as UserRole[];

describe("کاتالوگ مجوزها", () => {
  it("کلیدها یکتا و غیرخالی هستند", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const item of permissionCatalogue) {
      expect(item.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(item.label.length).toBeGreaterThan(3);
      expect(item.category.length).toBeGreaterThan(2);
    }
  });

  it("همه پیش‌فرض نقش‌ها زیرمجموعه کاتالوگ‌اند و هر شش نقش پوشش داده شده‌اند", () => {
    for (const role of ROLES) {
      const defaults = roleDefaultPermissions[role];
      expect(defaults, role).toBeDefined();
      for (const key of defaults) expect(permissionCatalogue.some((item) => item.key === key), `${role}:${key}`).toBe(true);
    }
  });

  it("مدیر کل همه مجوزها را دارد و مدیریت نقش‌ها در آن ثابت است", () => {
    expect([...roleDefaultPermissions.super_admin].sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(roleDefaultPermissions.super_admin).toContain("permissions.manage");
  });

  it("فعال قرآنی به بانک پرونده‌ها و تصمیم نهایی دسترسی ندارد", () => {
    expect(roleDefaultPermissions.activist).not.toContain("cases.view_all");
    expect(roleDefaultPermissions.activist).not.toContain("cases.decide");
    expect(roleDefaultPermissions.activist).toContain("cases.create");
    expect(roleDefaultPermissions.activist).toContain("cases.appeal_submit");
  });

  it("کارشناس تخصصی فقط مشاهده و ثبت نظر تخصصی دارد", () => {
    expect([...roleDefaultPermissions.specialist].sort()).toEqual(["cases.specialist_opinion", "cases.view_all"]);
  });

  it("مجوزهای محافظت‌شده شامل مدیریت نقش‌ها برای مدیر کل و نقش خود کاربر است", () => {
    expect(protectedGrants("super_admin", "super_admin")).toEqual(["permissions.manage"]);
    expect(protectedGrants("province_admin", "province_admin")).toEqual(["permissions.manage"]);
    expect(protectedGrants("province_admin", "super_admin")).toEqual([]);
    expect(protectedGrants("reviewer", "super_admin")).toEqual([]);
  });

  it("دسته‌بندی‌ها بدون تکرار و پوشش کامل هستند", () => {
    const used = new Set(permissionCatalogue.map((item) => item.category));
    expect([...used].sort()).toEqual([...permissionCategories].sort());
  });

  it("seed مهاجرت‌های ۰۰۰۴ تا ۰۰۱۴ دقیقاً با پیش‌فرض‌های کد هم‌خوان است", () => {
    const seeded = new Set<string>();
    const pattern = /\('([a-z_]+)','([a-z_.]+)'\)/g;
    // 0004 seeds the original catalogue; 0005 (reminders.send), 0006
    // (messages.broadcast), 0007 (events.manage) and 0014 (cases.expert_notes)
    // append later additions. Their union must equal the code defaults exactly.
    for (const file of ["0004_permission-matrix.sql", "0005_overdue-reminders.sql", "0006_group-broadcasts.sql", "0007_events.sql", "0014_expert-notes.sql"]) {
      const sql = readFileSync(path.join(process.cwd(), "drizzle", file), "utf8");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(sql))) seeded.add(`${match[1]}:${match[2]}`);
    }
    const expected = new Set<string>();
    for (const role of ROLES) for (const key of roleDefaultPermissions[role]) expected.add(`${role}:${key}`);
    expect([...seeded].sort()).toEqual([...expected].sort());
  });
});
