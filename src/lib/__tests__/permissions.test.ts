import { describe, expect, it } from "vitest";
import { canSync, ROLE_PERMISSIONS, type PermissionUser } from "@/lib/permissions";
import { isManager, managerInScope } from "@/lib/workflow-utils";
import { missingRequired } from "@/lib/data";

function user(role: PermissionUser["role"], customPermissions?: readonly string[]): PermissionUser {
  return { role, effectiveRole: role, customPermissions: customPermissions as PermissionUser["customPermissions"] };
}

describe("permission matrix", () => {
  it("super admin has every capability", () => {
    expect(canSync(user("super_admin"), "users.manage")).toBe(true);
    expect(canSync(user("super_admin"), "cases.decide")).toBe(true);
    expect(canSync(user("super_admin"), "cases.export")).toBe(true);
  });
  it("activist can create/edit/submit but not decide or manage users", () => {
    expect(canSync(user("activist"), "cases.create")).toBe(true);
    expect(canSync(user("activist"), "cases.submit")).toBe(true);
    expect(canSync(user("activist"), "cases.decide")).toBe(false);
    expect(canSync(user("activist"), "users.manage")).toBe(false);
  });
  it("reviewer can review but not decide", () => {
    expect(canSync(user("reviewer"), "cases.review")).toBe(true);
    expect(canSync(user("reviewer"), "cases.decide")).toBe(false);
  });
  it("custom role grants override base role", () => {
    const custom: PermissionUser = { role: "activist", effectiveRole: "reviewer", customPermissions: ["cases.review"] };
    expect(canSync(custom, "cases.review")).toBe(true);
    expect(canSync(custom, "cases.create")).toBe(false);
  });
  it("every role has a defined permission list", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(Array.isArray(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS])).toBe(true);
    }
  });
});

describe("workflow scope helpers", () => {
  it("isManager covers admins only", () => {
    expect(isManager({ ...user("super_admin"), id: "", fullName: "", firstName: null, lastName: null, email: null, phone: null, customPermissions: null, provinceId: null, countyId: null, mfaEnabled: false, mfaSecretCipher: null, mobileVerifiedAt: null })).toBe(true);
    expect(isManager({ ...user("reviewer"), id: "", fullName: "", firstName: null, lastName: null, email: null, phone: null, customPermissions: null, provinceId: null, countyId: null, mfaEnabled: false, mfaSecretCipher: null, mobileVerifiedAt: null })).toBe(false);
  });
  it("managerInScope for province admin", () => {
    const manager = { role: "province_admin", effectiveRole: "province_admin", provinceId: 4, countyId: null };
    expect(managerInScope(manager, { provinceId: 4, countyId: null })).toBe(true);
    expect(managerInScope(manager, { provinceId: 3, countyId: null })).toBe(false);
  });
  it("managerInScope for county admin", () => {
    const manager = { role: "county_admin", effectiveRole: "county_admin", provinceId: 4, countyId: 7 };
    expect(managerInScope(manager, { provinceId: 4, countyId: 7 })).toBe(true);
    expect(managerInScope(manager, { provinceId: 4, countyId: 9 })).toBe(false);
  });
  it("super admin is always in scope", () => {
    const manager = { role: "super_admin", effectiveRole: "super_admin", provinceId: null, countyId: null };
    expect(managerInScope(manager, { provinceId: 99, countyId: 99 })).toBe(true);
  });
});

describe("missingRequired (sync submit gate)", () => {
  const base = {
    firstName: "علی", lastName: "رضایی", fatherName: "حسن", nationalIdHash: "h",
    birthDate: "1996-03-20", gender: "male", phone: "09123456789", alternatePhone: "09121112233",
    idCardNumber: "12345", idIssuePlace: "تهران", provinceId: 4, job: "معلم",
  };
  it("returns nothing for a complete profile", () => {
    expect(missingRequired(base as never, 3, 2)).toEqual([]);
  });
  it("flags identity gaps", () => {
    const result = missingRequired({ ...base, fatherName: null, gender: null } as never, 3, 2);
    expect(result).toContain("نام پدر");
    expect(result).toContain("جنسیت");
  });
  it("flags standalone job field (stage 3)", () => {
    const result = missingRequired({ ...base, job: null } as never, 3, 2);
    expect(result).toContain("شغل");
  });
  it("flags specialties and documents", () => {
    const result = missingRequired(base as never, 0, 0);
    expect(result).toContain("انتخاب حداقل یک تخصص");
    expect(result).toContain("بارگذاری حداقل یک مدرک");
  });
});
