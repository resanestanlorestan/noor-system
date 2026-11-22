// آزمون‌های الحاقیهٔ ۲.۲۱.۰ — حذف اطلاعات پایه (شهرستان/تخصص/سازمان) با تأیید
// کاربر و گارد سمت سرور روی دیتابیس واقعی noor_feature:
// ۱) ردِ بدون مجوز (بررسی/کارشناس) برای هر سه موجودیت؛
// ۲) حذف موفق آیتم بدون وابستگی + ردپای ممیزی؛
// ۳) ردِ حذف آیتم در حال استفاده با شمارش دقیق وابستگی‌ها در پیام؛
// ۴) پس از پاک‌سازی وابستگی، حذف همان آیتم انجام می‌شود؛
// ۵) شهرستان دارای حساب کاربری (مدیر شهرستان فیکسچر) حذف نمی‌شود.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./env";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { closeDb, featureSeed, form, loginAs, messageOf, redirectOf, resetCaseData, type Fixture } from "./helpers";
import { deleteCountyAction, deleteOrganizationAction, deleteSpecialtyAction } from "@/app/actions/management";

let f: Fixture;
beforeAll(async () => { await resetCaseData(); f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

const suffix = String(Date.now()).slice(-6);
let seq = 0;
const nextMobile = () => `0912${suffix}${String(++seq).padStart(2, "0")}`;

const countyUrl = async (id: number) => redirectOf(() => deleteCountyAction(form({ countyId: String(id) })));
const specialtyUrl = async (id: number) => redirectOf(() => deleteSpecialtyAction(form({ specialtyId: String(id) })));
const orgUrl = async (id: number) => redirectOf(() => deleteOrganizationAction(form({ organizationId: String(id) })));

describe("الحاقیهٔ ۲.۲۱.۰ — حذف اطلاعات پایه با تأیید و گارد ارجاع", () => {
  it("حذف شهرستان بدون مجوز مدیریت تقسیمات رد می‌شود", async () => {
    await loginAs("rev");
    const url = await countyUrl(f.islamshahrCountyId);
    expect(url.startsWith("/settings")).toBe(true);
    expect(messageOf(url)).toContain("مجوز مدیریت تقسیمات جغرافیایی");
  });

  it("حذف تخصص و سازمان بدون مجوز مدیریت مرجع رد می‌شود", async () => {
    await loginAs("rev");
    const sp = await specialtyUrl(f.specialtyId);
    expect(messageOf(sp)).toContain("مجوز مدیریت تخصص‌ها و سازمان‌ها");
    const [org] = await db.insert(s.organizations).values({ name: `سازمان بی‌مجوز ${suffix}` }).returning({ id: s.organizations.id });
    const og = await orgUrl(org.id);
    expect(messageOf(og)).toContain("مجوز مدیریت تخصص‌ها و سازمان‌ها");
    const [left] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.id, org.id));
    expect(left).toBeDefined();
  });

  it("شهرستان بدون وابستگی با تأیید حذف و ردپای ممیزی ثبت می‌شود", async () => {
    await loginAs("super");
    const [county] = await db.insert(s.counties).values({ provinceId: f.tehranProvinceId, name: `آزمون‌شهر ${suffix}a` }).returning({ id: s.counties.id, name: s.counties.name });
    const url = await countyUrl(county.id);
    expect(url.startsWith("/settings")).toBe(true);
    expect(messageOf(url)).toContain(`شهرستان «${county.name}» از فهرست حذف شد`);
    const [gone] = await db.select({ id: s.counties.id }).from(s.counties).where(eq(s.counties.id, county.id));
    expect(gone).toBeUndefined();
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(eq(s.auditLogs.action, "delete_county"), eq(s.auditLogs.targetId, String(county.id))));
    expect(auditRow).toBeDefined();
  });

  it("شهرستان متصل به سازمان حذف نمی‌شود و تعداد وابستگی اعلام می‌گردد؛ پس از پاک‌سازی وابستگی حذف انجام می‌شود", async () => {
    await loginAs("super");
    const [county] = await db.insert(s.counties).values({ provinceId: f.tehranProvinceId, name: `آزمون‌شهر ${suffix}b` }).returning({ id: s.counties.id, name: s.counties.name });
    await db.insert(s.organizations).values({ name: `سازمان شهرستانی ${suffix}`, countyId: county.id });
    const url = await countyUrl(county.id);
    expect(messageOf(url)).toContain("ممکن نیست");
    expect(messageOf(url)).toContain("۱ سازمان");
    const [still] = await db.select({ id: s.counties.id }).from(s.counties).where(eq(s.counties.id, county.id));
    expect(still).toBeDefined();
    await db.delete(s.organizations).where(eq(s.organizations.countyId, county.id));
    const url2 = await countyUrl(county.id);
    expect(messageOf(url2)).toContain("از فهرست حذف شد");
  });

  it("شهرستان دارای حساب کاربری (مدیر شهرستان فیکسچر) حذف نمی‌شود", async () => {
    await loginAs("super");
    const url = await countyUrl(f.tehranCountyId);
    expect(messageOf(url)).toContain("ممکن نیست");
    expect(messageOf(url)).toContain("۱ حساب کاربری");
  });

  it("تخصصِ در حال استفاده در حساب کارشناس حذف نمی‌شود با شمارش دقیق", async () => {
    await loginAs("super");
    const url = await specialtyUrl(f.specialtyId);
    expect(messageOf(url)).toContain("ممکن نیست");
    expect(messageOf(url)).toContain("۱ حساب کارشناس");
    const [still] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, f.specialtyId));
    expect(still).toBeDefined();
  });

  it("تخصص بدون وابستگی حذف می‌شود و ممیزی ثبت می‌شود", async () => {
    await loginAs("super");
    const [specialty] = await db.insert(s.specialties).values({ code: `test-del-${suffix}`, title: `تخصص آزمون حذف ${suffix}` }).returning({ id: s.specialties.id, title: s.specialties.title });
    const url = await specialtyUrl(specialty.id);
    expect(messageOf(url)).toContain(`تخصص «${specialty.title}» از فهرست حذف شد`);
    const [gone] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, specialty.id));
    expect(gone).toBeUndefined();
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(eq(s.auditLogs.action, "delete_specialty"), eq(s.auditLogs.targetId, String(specialty.id))));
    expect(auditRow).toBeDefined();
  });

  it("سازمان متصل به رکورد همکاری فعالان حذف نمی‌شود؛ بدون وابستگی حذف می‌شود", async () => {
    await loginAs("super");
    // رکورد فعال کمینه (هم‌الگوی فیکسچر کلاس‌ها) برای اتصال همکاری
    const mobile = nextMobile();
    const [user] = await db.insert(s.users).values({
      fullName: "فعال آزمون حذف", phone: mobile, passwordHash: "scrypt$00000000000000000000000000000000$" + "00".repeat(64),
      role: "activist", active: true,
    }).returning({ id: s.users.id });
    const [activist] = await db.insert(s.activists).values({
      userId: user.id, firstName: "فعال", lastName: `حذف${seq}`, phone: mobile,
      provinceId: f.tehranProvinceId, countyId: f.tehranCountyId,
    }).returning({ id: s.activists.id });
    const [org] = await db.insert(s.organizations).values({ name: `سازمان وابسته ${suffix}` }).returning({ id: s.organizations.id, name: s.organizations.name });
    await db.insert(s.activistOrganizations).values({ activistId: activist.id, organizationId: org.id, createdBy: f.users.super.id });
    const url = await orgUrl(org.id);
    expect(messageOf(url)).toContain("ممکن نیست");
    expect(messageOf(url)).toContain("۱ رکورد همکاری فعالان");
    const [still] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.id, org.id));
    expect(still).toBeDefined();
    // بدون وابستگی: حذف موفق
    const [free] = await db.insert(s.organizations).values({ name: `سازمان آزاد ${suffix}` }).returning({ id: s.organizations.id, name: s.organizations.name });
    const url2 = await orgUrl(free.id);
    expect(messageOf(url2)).toContain(`سازمان «${free.name}» از فهرست حذف شد`);
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(eq(s.auditLogs.action, "delete_organization"), eq(s.auditLogs.targetId, String(free.id))));
    expect(auditRow).toBeDefined();
  });

  it("شناسهٔ نامعتبر رد می‌شود بدون آنکه چیزی حذف شود", async () => {
    await loginAs("super");
    const bad = await countyUrl(99999999);
    expect(messageOf(bad)).toContain("شهرستان پیدا نشد");
    const zero = await redirectOf(() => deleteCountyAction(form({ countyId: "" })));
    expect(messageOf(zero)).toContain("شهرستان معتبر نیست");
  });
});
