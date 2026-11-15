// الحاقیهٔ ۲.۱۵.۲ — تخصیص نقش سفارشی هنگام ایجاد کاربر:
// مدیر ارشد می‌تواند در فرم «ایجاد کاربر» یک نقش سفارشی انتخاب کند؛
// نقش بالا مبنای محدوده می‌ماند، مجوزها از نقش سفارشی خوانده می‌شود،
// رد ممیزی با شناسهٔ نقش ثبت می‌شود و مدیر استانی حق تخصیص ندارد.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq, like } from "drizzle-orm";
import { redirectOf, form, featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { createStaffAction } from "@/app/actions/management";
import { saveCustomRoleAction, deleteCustomRoleAction } from "@/app/actions/permissions";

let f: Fixture;
const PHONE = "09362220911";

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const createUser = (overrides: Record<string, string> = {}) =>
  redirectOf(() => createStaffAction({}, form({
    firstName: "سارا", lastName: "نقش‌سفارشی", email: "", phone: PHONE,
    password: "Noor1234X", role: "reviewer", provinceId: String(f.tehranProvinceId), countyId: "", ...overrides,
  })));

describe("ایجاد کاربر با نقش سفارشی", () => {
  it("مدیر ارشد کاربر را با نقش سفارشی می‌سازد؛ نقش بالا محفوظ و رد ممیزی ثبت می‌شود", async () => {
    await loginAs("super");
    const create = await saveCustomRoleAction({}, (() => {
      const data = form({ label: "کارشناس ثبت آزمون ایجاد", baseRole: "reviewer", description: "آزمون ۲.۱۵.۲" });
      data.append("permissionKeys", "cases.view_all");
      return data;
    })());
    expect(create.error).toBeUndefined();
    const [role] = await db.select().from(s.customRoles).where(eq(s.customRoles.label, "کارشناس ثبت آزمون ایجاد"));

    await createUser({ customRoleId: role.id });

    const [user] = await db.select().from(s.users).where(eq(s.users.phone, PHONE));
    expect(user.role).toBe("reviewer");
    expect(user.customRoleId).toBe(role.id);
    const [audit] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "create_staff"), eq(s.auditLogs.targetId, user.id)));
    expect(audit.detail).toContain("custom:");
    expect(audit.detail).toContain(role.id);

    // پاک‌سازی برای تکرارپذیری آزمون
    await db.delete(s.users).where(eq(s.users.id, user.id));
    expect((await deleteCustomRoleAction({}, form({ customRoleId: role.id }))).success).toBeTruthy();
  }, 40_000);

  it("شناسهٔ نامعتبر نقش سفارشی پذیرفته نمی‌شود", async () => {
    await loginAs("super");
    const state = await createStaffAction({}, form({
      firstName: "سارا", lastName: "نقش‌سفارشی", email: "", phone: PHONE,
      password: "Noor1234X", role: "reviewer", provinceId: String(f.tehranProvinceId), countyId: "", customRoleId: "not-a-uuid",
    }));
    expect(state.error).toContain("معتبر نیست");
    expect(await db.select().from(s.users).where(eq(s.users.phone, PHONE))).toHaveLength(0);
  });

  it("مدیر استانی حق تخصیص نقش سفارشی ندارد", async () => {
    await loginAs("prov");
    const state = await createStaffAction({}, form({
      firstName: "سارا", lastName: "نقش‌سفارشی", email: "", phone: PHONE,
      password: "Noor1234X", role: "county_admin", provinceId: String(f.tehranProvinceId),
      countyId: String(f.tehranCountyId), customRoleId: "9d2b0a5e-1111-4111-8111-111111111111",
    }));
    expect(state.error).toContain("مدیر ارشد");
    expect(await db.select().from(s.users).where(eq(s.users.phone, PHONE))).toHaveLength(0);
  });

  it("بدون انتخاب نقش سفارشی، رفتار پیشین حفظ می‌شود", async () => {
    await loginAs("super");
    await createUser();
    const [user] = await db.select().from(s.users).where(eq(s.users.phone, PHONE));
    expect(user.role).toBe("reviewer");
    expect(user.customRoleId).toBeNull();
    const [audit] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "create_staff"), like(s.auditLogs.detail, "reviewer")));
    expect(audit.detail).not.toContain("custom:");
    await db.delete(s.users).where(eq(s.users.id, user.id));
  });
});
