// Feature tests for الحاقیهٔ ۲.۱۰.۱/۲.۱۰.۲ — حذف حساب کاربر با دو مسیر.
// حساب بدون داده: حذف کامل ردیف. حساب متصل به داده (ممیزی، پرونده، پیام و…):
// حذف امن (گمنام‌سازی) — هویت پاک، ورود مسدود، خروج از فهرست، حفظ ممیزی.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs, resetCaseData, closeDb, FEATURE_PASSWORD, type Fixture } from "./helpers";
import { hashPassword } from "@/lib/auth";
import { saveCaseCore } from "@/lib/case-save";
import { deleteUserAction, toggleUserAction, updateStaffAction } from "@/app/actions/management";
import { inArray, or, and } from "drizzle-orm";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  // جدول کاربران در resetCaseData پاک نمی‌شود؛ کاربران آزمونی باید حذف شوند تا
  // در آزمون‌های بعدی (مثلاً صف پیامک ارسال پرونده) به‌عنوان مدیر ظاهر نشوند.
  if (createdUserIds.length) {
    await db.delete(s.auditLogs).where(or(inArray(s.auditLogs.actorId, createdUserIds), inArray(s.auditLogs.targetId, createdUserIds)));
    await db.delete(s.sessions).where(inArray(s.sessions.userId, createdUserIds));
    await db.delete(s.notifications).where(inArray(s.notifications.userId, createdUserIds));
    await db.delete(s.users).where(inArray(s.users.id, createdUserIds));
  }
  await closeDb();
});

const createdUserIds: string[] = [];

/** کاربر تازهٔ بدون هیچ دادهٔ متصل؛ با شمارهٔ موبایل یکتا. */
async function makeUser(role: "county_admin" | "super_admin" = "county_admin") {
  const phone = "0912" + String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  const [row] = await db.insert(s.users).values({
    fullName: "کاربر آزمون حذف", firstName: "کاربر", lastName: "آزمون",
    phone, role, passwordHash: await hashPassword(FEATURE_PASSWORD),
  }).returning({ id: s.users.id, fullName: s.users.fullName });
  createdUserIds.push(row.id);
  return row;
}

describe("حذف حساب کاربر — گاردهای سروری", () => {
  it("مدیر کل، حساب بدون داده: حذف موفق با پاک‌سازی وابسته‌ها و ثبت ممیزی", async () => {
    const actor = await loginAs("super");
    const target = await makeUser();
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    // الحاقیهٔ ۲.۱۰.۳ — پیام دیگر داخل URL نیست؛ فقط توکن کوتاه فلش می‌آید و
    // صفحهٔ مقصد آن را یک‌بار مصرف و از نوار آدرس پاک می‌کند.
    expect(url.startsWith("/users?m=")).toBe(true);
    expect(url).not.toContain(encodeURIComponent("حذف"));
    expect(messageOf(url)).toContain("حذف شد");
    const [gone] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, target.id));
    expect(gone).toBeUndefined();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "delete_user"));
    expect(logs.some((log) => log.actorId === actor.id && log.targetId === target.id)).toBe(true);
  });

  it("حذف حساب خودِ مدیر کل رد می‌شود", async () => {
    const actor = await loginAs("super");
    const url = await redirectOf(() => deleteUserAction(form({ userId: actor.id })));
    expect(messageOf(url)).toContain("برای حساب‌های دیگر");
  });

  it("حذف حساب مدیر کل دیگر رد می‌شود", async () => {
    await loginAs("super");
    const otherSuper = await makeUser("super_admin");
    const url = await redirectOf(() => deleteUserAction(form({ userId: otherSuper.id })));
    expect(messageOf(url)).toContain("مدیر کل");
    const [still] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, otherSuper.id));
    expect(still).toBeDefined();
  });

  it("مدیر غیر کل (استانی) اجازهٔ حذف ندارد", async () => {
    await loginAs("prov");
    const target = await makeUser();
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(url)).toContain("فقط توسط مدیر کل");
    const [still] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, target.id));
    expect(still).toBeDefined();
  });

  it("حساب فقط متصل به ممیزی: الحاقیهٔ ۲.۱۷.۰ — حذف کامل با گمنام‌سازی ردپای ممیزی خودش", async () => {
    const actor = await loginAs("super");
    const target = await makeUser();
    await db.insert(s.auditLogs).values({ actorId: target.id, action: "login", targetType: "user", targetId: target.id });
    await db.insert(s.sessions).values({ tokenHash: "e".repeat(64), userId: target.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(url)).toContain("کامل حذف شد");
    expect(messageOf(url)).toContain("ثبت‌نام مجدد");
    // ردیف حساب کامل حذف شده است
    expect(await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, target.id))).toHaveLength(0);
    // نشست‌ها پاک شده‌اند
    expect((await db.select({ token: s.sessions.tokenHash }).from(s.sessions).where(eq(s.sessions.userId, target.id)))).toHaveLength(0);
    // ردپای ممیزی خودش حفظ شده ولی ارتباطش با حساب حذف‌شده گمنام است
    // (لاگ «حذف حساب» با targetId همین حساب جداگانه است و در شمارش نمی‌آید)
    const prior = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.targetId, target.id), eq(s.auditLogs.action, "login")));
    expect(prior.length).toBe(1);
    expect(prior[0].actorId).toBeNull();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "delete_user"));
    expect(logs.some((log) => log.actorId === actor.id && log.targetId === target.id)).toBe(true);
  });

  it("کاربر نقش‌داشته در پروندهٔ دیگران: حذف امن (گمنام‌سازی) و سپس گاردهای حساب گمنام", async () => {
    // پروندهٔ واقعی متعلق به کاربر «act» فیکسچر ساخته می‌شود
    await loginAs("act");
    const caseId = caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f))));
    const actor = await loginAs("super");
    const target = await makeUser();
    // کاربر به‌عنوان کارشناس پروندهٔ دیگری منصوب می‌شود → زنجیرهٔ کاری دیگران
    await db.update(s.applications).set({ assignedExpertId: target.id }).where(eq(s.applications.id, caseId));
    await db.insert(s.auditLogs).values({ actorId: target.id, action: "login", targetType: "user", targetId: target.id });
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(url)).toContain("محو");
    const [row] = await db.select().from(s.users).where(eq(s.users.id, target.id));
    expect(row.deletedAt).not.toBeNull();
    expect(row.active).toBe(false);
    expect(row.phone).toBeNull();
    const [session] = await db.select().from(s.sessions).where(eq(s.sessions.userId, target.id));
    expect(session).toBeUndefined();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "anonymize_user"));
    expect(logs.some((log) => log.actorId === actor.id && log.targetId === target.id)).toBe(true);
    // ممیزیِ قبلی کاربر با ارتباطش حفظ می‌ماند (حساب گمنام ردیف دارد)
    const prior = await db.select().from(s.auditLogs).where(eq(s.auditLogs.actorId, target.id));
    expect(prior.length).toBe(1);
    // ارجاع کاری پروندهٔ دیگران حفظ شده است
    const [appAfter] = await db.select({ expert: s.applications.assignedExpertId }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(appAfter.expert).toBe(target.id);
    await db.update(s.applications).set({ assignedExpertId: null }).where(eq(s.applications.id, caseId));
  });

  it("حساب گمنام‌شده دوباره قابل حذف نیست و ویرایش/تغییر وضعیت آن رد می‌شود", async () => {
    await loginAs("act");
    const caseId = caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f))));
    await loginAs("super");
    const target = await makeUser();
    await db.update(s.applications).set({ assignedExpertId: target.id }).where(eq(s.applications.id, caseId));
    await db.insert(s.auditLogs).values({ actorId: target.id, action: "login", targetType: "user", targetId: target.id });
    await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    const again = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(again)).toContain("پیش‌تر");
    const toggle = await redirectOf(() => toggleUserAction(form({ userId: target.id })));
    expect(messageOf(toggle)).toContain("امن حذف شده");
    const edit = await updateStaffAction({} as never, form({ userId: target.id, firstName: "ع", lastName: "ب", role: "reviewer", phone: "۰۹۱۲۱۲۳۴۵۶۷", provinceId: String(f.tehranProvinceId) }));
    expect(edit.error).toContain("امن حذف شده");
    await db.update(s.applications).set({ assignedExpertId: null }).where(eq(s.applications.id, caseId));
  });
});
