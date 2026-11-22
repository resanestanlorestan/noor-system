// آزمون‌های الحاقیهٔ ۲.۲۴.۰ — حذف کامل تخصص از فرم‌ساز پویا روی دیتابیس واقعی
// noor_feature: همهٔ تخصص‌های موجود (قدیمی و جدید) مشمول حذف‌اند.
// ۱) ردِ بدون مجوز forms.manage؛ ۲) حذف موفق تخصص بی‌وابسته + ردپای ممیزی؛
// ۳) ردِ حذف تخصص دارای تعریف فرم پویا؛ ۴) ردِ حذف تخصص متصل به حساب کارشناس
// و سپس حذف موفق پس از پاک‌سازی وابستگی.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./env";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { closeDb, featureSeed, form, loginAs, messageOf, redirectOf, resetCaseData, type Fixture } from "./helpers";
import { deleteSpecialtyAction } from "@/app/actions/forms";

let f: Fixture;
beforeAll(async () => { await resetCaseData(); f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

const suffix = String(Date.now()).slice(-6);
const del = async (id: number) => redirectOf(() => deleteSpecialtyAction(form({ specialtyId: String(id) })));

describe("الحاقیهٔ ۲.۲۴.۰ — حذف تخصص از فرم‌ساز با گارد ارجاع", () => {
  it("حذف تخصص بدون مجوز فرم‌ساز رد می‌شود", async () => {
    await loginAs("rev");
    const url = await del(f.specialtyId);
    expect(url.startsWith("/forms")).toBe(true);
    expect(messageOf(url)).toContain("مجوز مدیریت تخصص‌ها و فرم‌ساز");
  });

  it("تخصص بی‌وابسته با تأیید حذف و ردپای ممیزی حذف می‌شود", async () => {
    await loginAs("super");
    const [sp] = await db.insert(s.specialties).values({ code: `tst-del-${suffix}`, title: `تخصص آزمون حذف ${suffix}` }).returning({ id: s.specialties.id, title: s.specialties.title });
    const url = await del(sp.id);
    expect(url.startsWith("/forms")).toBe(true);
    expect(messageOf(url)).toContain(`تخصص «${sp.title}» از فهرست حذف شد`);
    const [gone] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, sp.id));
    expect(gone).toBeUndefined();
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(eq(s.auditLogs.action, "delete_specialty"), eq(s.auditLogs.targetId, String(sp.id))));
    expect(auditRow).toBeDefined();
  });

  it("تخصص دارای تعریف فرم پویا حذف نمی‌شود و شمارش وابستگی اعلام می‌گردد", async () => {
    await loginAs("super");
    const [sp] = await db.insert(s.specialties).values({ code: `tst-form-${suffix}`, title: `تخصص دارای فرم ${suffix}` }).returning({ id: s.specialties.id });
    await db.insert(s.formDefinitions).values({ entityType: "specialty", entityId: sp.id, status: "published", version: 1, draftConfig: {}, publishedConfig: {} });
    const url = await del(sp.id);
    expect(url.startsWith("/forms")).toBe(true);
    expect(messageOf(url)).toContain("تعریف فرم پویا");
    const [left] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, sp.id));
    expect(left).toBeDefined();
  });

  it("تخصص متصل به حساب کارشناس حذف نمی‌شود؛ پس از پاک‌سازی وابستگی حذف انجام می‌شود", async () => {
    await loginAs("super");
    const [sp] = await db.insert(s.specialties).values({ code: `tst-spec-${suffix}`, title: `تخصص کارشناس ${suffix}` }).returning({ id: s.specialties.id });
    await db.insert(s.userSpecialties).values({ userId: f.users.spec.id, specialtyId: sp.id }).onConflictDoNothing();
    const blocked = await del(sp.id);
    expect(messageOf(blocked)).toContain("حساب کارشناس");
    const [left] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, sp.id));
    expect(left).toBeDefined();
    await db.delete(s.userSpecialties).where(and(eq(s.userSpecialties.userId, f.users.spec.id), eq(s.userSpecialties.specialtyId, sp.id)));
    const url = await del(sp.id);
    expect(messageOf(url)).toContain("از فهرست حذف شد");
    const [gone] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.id, sp.id));
    expect(gone).toBeUndefined();
  });
});
