// Feature tests for the fine-grained permission matrix (gap item 17):
// toggling grants, the lock-out guards, custom roles and their scoping.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, pdfFile, completeProfile, nationalId,
  featureSeed, loginAs, resetCaseData, closeDb, type Fixture,
} from "./helpers";
import { saveCaseAction, submitCaseAction, prepareCaseAction, decisionAction, uploadDocumentAction } from "@/app/actions/cases";
import { toggleRolePermissionAction, resetRoleDefaultsAction, saveCustomRoleAction, deleteCustomRoleAction } from "@/app/actions/permissions";
import { updateStaffAction, addSpecialtyAction, addCountyAction } from "@/app/actions/management";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const toggle = (roleKey: string, permissionKey: string, allow: boolean) =>
  toggleRolePermissionAction({}, form({ roleKey, permissionKey, allow: allow ? "1" : "0" }));

/** Draft → evidence → ready → pending, created by the reviewer. */
async function pendingCaseByRev(overrides: Record<string, string | string[]> = {}) {
  await loginAs("rev");
  const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { source: "expert", ...overrides })));
  const caseId = caseIdOf(url);
  await loginAs("rev");
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  await loginAs("rev");
  await redirectOf(() => prepareCaseAction(form({ caseId })));
  await redirectOf(() => submitCaseAction(form({ caseId })));
  return caseId;
}

const REV_PHONE = "09361110001";
const assignCustomRole = async (userId: string, fullName: string, role: "reviewer", provinceId: number, customRoleId: string) => {
  const [firstName, ...rest] = fullName.split(" ");
  return redirectOf(() => updateStaffAction({}, form({
    userId, firstName, lastName: rest.join(" ") || firstName, phone: REV_PHONE, role, provinceId: String(provinceId), countyId: "", customRoleId,
  })));
};

describe("ماتریس مجوز ریزدانه", () => {
  it("بدون مجوز «مدیریت نقش‌ها و مجوزها» تغییر ماتریس ممنوع است", async () => {
    await loginAs("prov");
    const result = await toggle("county_admin", "reports.view", false);
    expect(result.error).toContain("مدیریت نقش‌ها");
  });

  it("کلید مجوز نامعتبر پذیرفته نمی‌شود", async () => {
    await loginAs("super");
    const result = await toggle("county_admin", "cases.not_a_key", true);
    expect(result.error).toContain("کلید مجوز");
  });

  it("حذف permissions.manage از مدیر کل و از نقش خودِ کاربر ممنوع است", async () => {
    await loginAs("super");
    expect((await toggle("super_admin", "permissions.manage", false)).error).toContain("قابل حذف نیست");
    // Grant the capability to the province role, then the province admin is
    // still not allowed to strip it from their own role.
    expect((await toggle("province_admin", "permissions.manage", true)).success).toBeTruthy();
    await loginAs("prov");
    expect((await toggle("province_admin", "permissions.manage", false)).error).toContain("نقشِ خودتان");
    // Restore: the super admin strips the extra grant again.
    await loginAs("super");
    expect((await toggle("province_admin", "permissions.manage", false)).success).toBeTruthy();
  });

  it("سلب مجوز تصمیم‌گیری از مدیر شهرستان، تصمیم را می‌بندد و بازنشانی برمی‌گرداند", async () => {
    const first = await pendingCaseByRev();
    const second = await pendingCaseByRev({
      firstName: "مریم", lastName: "کاظمی", fatherName: "رضا", birthDate: "1368/03/03",
      phone: "09121110006", nationalId: nationalId("512356789"),
    });

    await loginAs("county");
    await redirectOf(() => decisionAction(form({ caseId: first, decision: "correction", note: "بررسی اولیه مدیر شهرستان" })));
    await loginAs("super");
    expect((await toggle("county_admin", "cases.decide", false)).success).toBeTruthy();

    await loginAs("county");
    const denied = await redirectOf(() => decisionAction(form({ caseId: second, decision: "approve" })));
    expect(messageOf(denied)).toContain("تصمیم نهایی");

    await loginAs("super");
    expect((await resetRoleDefaultsAction({}, form({ roleKey: "county_admin" }))).success).toBeTruthy();
    await loginAs("county");
    await redirectOf(() => decisionAction(form({ caseId: second, decision: "approve" })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, second)))[0].status).toBe("approved");
  }, 40_000);

  it("افزودن مجوز از ماتریس، قابلیت تازه را واقعاً فعال می‌کند", async () => {
    // پاک‌سازی بقایای اجرای قبلی تا آزمون قابل‌تکرار بماند
    await db.delete(s.counties).where(eq(s.counties.name, "شهرستان آزمون مجوز"));
    await loginAs("super");
    await toggle("province_admin", "settings.geo", false);
    await loginAs("prov");
    expect((await addCountyAction({}, form({ name: "شهرستان آزمون مجوز", provinceId: String(f.tehranProvinceId) }))).error).toContain("مجوز");
    await loginAs("super");
    expect((await toggle("province_admin", "settings.geo", true)).success).toBeTruthy();
    await loginAs("prov");
    expect((await addCountyAction({}, form({ name: "شهرستان آزمون مجوز", provinceId: String(f.tehranProvinceId) }))).success).toBeTruthy();
    await loginAs("super");
    await toggle("province_admin", "settings.geo", false);
    // پاک‌سازی پس از آزمون
    await db.delete(s.counties).where(eq(s.counties.name, "شهرستان آزمون مجوز"));
  });

  it("نقش سفارشی مجوز تازه می‌دهد؛ حذف نقش تخصیص‌یافته ممنوع است", async () => {
    // پاک‌سازی بقایای اجرای قبلی تا آزمون قابل‌تکرار بماند
    await db.delete(s.specialties).where(eq(s.specialties.title, "تخصص نمونه ماتریس"));
    await loginAs("super");
    const create = await saveCustomRoleAction({}, (() => {
      const data = form({ label: "کارشناس پشتیبان تنظیمات", baseRole: "reviewer", description: "دسترسی نمونه" });
      data.append("permissionKeys", "settings.references");
      data.append("permissionKeys", "cases.view_all");
      return data;
    })());
    expect(create.error).toBeUndefined();
    const [role] = await db.select().from(s.customRoles).where(eq(s.customRoles.label, "کارشناس پشتیبان تنظیمات"));
    expect(role.baseRole).toBe("reviewer");

    await assignCustomRole(f.users.rev.id, f.users.rev.fullName, "reviewer", f.tehranProvinceId, role.id);

    // The reviewer now holds settings.references: adding a specialty succeeds.
    await loginAs("rev");
    const add = await addSpecialtyAction({}, form({ title: "تخصص نمونه ماتریس" }));
    expect(add.error).toBeUndefined();
    expect((await db.select().from(s.specialties).where(eq(s.specialties.title, "تخصص نمونه ماتریس"))).length).toBe(1);

    // Deleting an assigned custom role is blocked until it is unassigned.
    await loginAs("super");
    expect((await deleteCustomRoleAction({}, form({ customRoleId: role.id }))).error).toContain("تخصیص‌یافته");
    await assignCustomRole(f.users.rev.id, f.users.rev.fullName, "reviewer", f.tehranProvinceId, "");
    expect((await deleteCustomRoleAction({}, form({ customRoleId: role.id }))).success).toBeTruthy();
    expect((await db.select().from(s.customRoles).where(eq(s.customRoles.id, role.id))).length).toBe(0);
    // پاک‌سازی پس از آزمون
    await db.delete(s.specialties).where(eq(s.specialties.title, "تخصص نمونه ماتریس"));
  }, 40_000);

  it("ویرایش نقش سفارشی، نشست‌های کاربران تخصیص‌یافته را باطل می‌کند", async () => {
    await loginAs("super");
    await saveCustomRoleAction({}, form({ label: "نقش موقت", baseRole: "reviewer" }));
    const [role] = await db.select().from(s.customRoles).where(eq(s.customRoles.label, "نقش موقت"));
    await assignCustomRole(f.users.rev.id, f.users.rev.fullName, "reviewer", f.tehranProvinceId, role.id);
    await db.insert(s.sessions).values({ tokenHash: "a".repeat(64), userId: f.users.rev.id, expiresAt: new Date(Date.now() + 3_600_000) });
    await saveCustomRoleAction({}, form({ customRoleId: role.id, label: "نقش موقت", baseRole: "specialist" }));
    expect(await db.select().from(s.sessions).where(eq(s.sessions.userId, f.users.rev.id))).toHaveLength(0);
    const [updated] = await db.select().from(s.customRoles).where(eq(s.customRoles.id, role.id));
    expect(updated.baseRole).toBe("specialist");
    // Cleanup for later assertions in this run.
    await assignCustomRole(f.users.rev.id, f.users.rev.fullName, "reviewer", f.tehranProvinceId, "");
    await deleteCustomRoleAction({}, form({ customRoleId: role.id }));
  }, 40_000);
});
