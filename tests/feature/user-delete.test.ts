// Feature tests for الحاقیهٔ ۲.۱۰.۱/۲.۱۰.۲ — حذف حساب کاربر با دو مسیر.
// حساب بدون داده: حذف کامل ردیف. حساب متصل به داده (ممیزی، پرونده، پیام و…):
// حذف امن (گمنام‌سازی) — هویت پاک، ورود مسدود، خروج از فهرست، حفظ ممیزی.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, messageOf, form, featureSeed, loginAs, resetCaseData, closeDb, FEATURE_PASSWORD, type Fixture } from "./helpers";
import { hashPassword } from "@/lib/auth";
import { deleteUserAction, toggleUserAction, updateStaffAction } from "@/app/actions/management";
import { inArray, or } from "drizzle-orm";

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

  it("حساب متصل به ممیزی: حذف امن (گمنام‌سازی) با پاک‌سازی هویت و مسدودسازی ورود", async () => {
    const actor = await loginAs("super");
    const target = await makeUser();
    const oldHash = (await db.select({ hash: s.users.passwordHash }).from(s.users).where(eq(s.users.id, target.id)))[0].hash;
    await db.insert(s.auditLogs).values({ actorId: target.id, action: "login", targetType: "user", targetId: target.id });
    await db.insert(s.sessions).values({ tokenHash: "e".repeat(64), userId: target.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const url = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(url)).toContain("امن حذف شد");
    const [row] = await db.select().from(s.users).where(eq(s.users.id, target.id));
    expect(row).toBeDefined();
    expect(row.deletedAt).not.toBeNull();
    expect(row.active).toBe(false);
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.fullName).toContain("حساب حذف‌شده");
    expect(row.passwordHash).not.toBe(oldHash);
    expect(row.mfaEnabled).toBe(false);
    const [session] = await db.select().from(s.sessions).where(eq(s.sessions.userId, target.id));
    expect(session).toBeUndefined();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "anonymize_user"));
    expect(logs.some((log) => log.actorId === actor.id && log.targetId === target.id)).toBe(true);
    // ممیزیِ قبلی کاربر دست‌نخورده می‌ماند (اتریبیوشن «حساب حذف‌شده» در صفحهٔ ممیزی)
    const prior = await db.select().from(s.auditLogs).where(eq(s.auditLogs.actorId, target.id));
    expect(prior.length).toBe(1);
  });

  it("حساب گمنام‌شده دوباره قابل حذف نیست و ویرایش/تغییر وضعیت آن رد می‌شود", async () => {
    await loginAs("super");
    const target = await makeUser();
    await db.insert(s.auditLogs).values({ actorId: target.id, action: "login", targetType: "user", targetId: target.id });
    await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    const again = await redirectOf(() => deleteUserAction(form({ userId: target.id })));
    expect(messageOf(again)).toContain("پیش‌تر");
    const toggle = await redirectOf(() => toggleUserAction(form({ userId: target.id })));
    expect(messageOf(toggle)).toContain("امن حذف شده");
    const edit = await updateStaffAction({} as never, form({ userId: target.id, firstName: "ع", lastName: "ب", role: "reviewer", phone: "۰۹۱۲۱۲۳۴۵۶۷", provinceId: String(f.tehranProvinceId) }));
    expect(edit.error).toContain("امن حذف شده");
  });
});
