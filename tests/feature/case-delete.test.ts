// Feature tests for الحاقیهٔ ۲.۱۰.۴ — حذف دو‌سطحی پرونده در بانک پرونده‌ها:
// سطح «حذف با ماندگاری در بانک» (برگشت‌پذیر با بازیابی) و «حذف کلی» (پاک‌سازی
// کامل وابسته‌ها). همچنین گارد دسترسی مدیر کل و قفل اکشن‌های کاری روی پروندهٔ
// حذف‌شده. همهٔ کنش‌ها با Server Actionهای واقعی روی دیتابیس noor_feature.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs, resetCaseData, closeDb,
  type Fixture, type UserKey,
} from "./helpers";
import type { AppUser, SessionUser } from "@/lib/auth";
const asSession = (user: AppUser): SessionUser => ({ ...user, effectiveRole: user.role, customRoleLabel: null });
import { deleteCaseAction, restoreCaseAction, submitCaseAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { searchCases } from "@/lib/case-search";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Creates a draft case as the given user and returns its id. */
async function createDraft(creator: UserKey) {
  await loginAs(creator);
  const url = await redirectOf(() => saveCaseCore(completeProfile(f)));
  return caseIdOf(url);
}

describe("حذف دو‌سطحی پرونده در بانک پرونده‌ها", () => {
  it("حذف با ماندگاری در بانک: از فهرست فعال خارج، در فیلتر حذف‌شده‌ها می‌آید، اکشن‌ها قفل و بازیابی برمی‌گرداند", async () => {
    const caseId = await createDraft("act");
    const user = await loginAs("super");
    const url = await redirectOf(() => deleteCaseAction(form({ caseId, mode: "bank" })));
    // آدرس ریدایرکت فقط توکن کوتاه فلش دارد؛ متن پیام در URL نیست — الحاقیهٔ ۲.۱۰.۳
    expect(url.startsWith("/cases?m=")).toBe(true);
    expect(url).not.toContain(encodeURIComponent("حذف"));
    expect(messageOf(url)).toContain("ماند");
    const active = await searchCases(asSession(user), { q: "", sort: "newest" }, 1);
    expect(active.total).toBe(0);
    const deleted = await searchCases(asSession(user), { q: "", sort: "newest", deleted: true }, 1);
    expect(deleted.total).toBe(1);
    expect(deleted.rows[0].deletedAt).toBeTruthy();
    // اکشن کاری روی پروندهٔ حذف‌شده باید رد شود
    await loginAs("act");
    const blocked = await redirectOf(() => submitCaseAction(form({ caseId })));
    expect(messageOf(blocked)).toContain("مجاز نیست");
    // بازیابی توسط مدیر کل → برگشت به فهرست فعال + ثبت ممیزی
    await loginAs("super");
    const restored = await redirectOf(() => restoreCaseAction(form({ caseId })));
    expect(messageOf(restored)).toContain("بازیابی");
    const back = await searchCases(asSession(user), { q: "", sort: "newest" }, 1);
    expect(back.total).toBe(1);
    expect(back.rows[0].deletedAt).toBeFalsy();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "delete_case_bank"));
    expect(logs.length).toBe(1);
    const restoreLogs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "restore_case"));
    expect(restoreLogs.length).toBe(1);
  });

  it("گارد دسترسی: مدیر استان اجازه حذف یا بازیابی ندارد", async () => {
    const caseId = await createDraft("act");
    await loginAs("prov");
    const url = await redirectOf(() => deleteCaseAction(form({ caseId, mode: "bank" })));
    expect(messageOf(url)).toContain("مدیر کل");
    const restoreUrl = await redirectOf(() => restoreCaseAction(form({ caseId })));
    expect(messageOf(restoreUrl)).toContain("مدیر کل");
  });

  it("حذف کلی: پرونده و رکورد فعال کامل پاک می‌شوند، ممیزی می‌ماند و کد ملی آزاد می‌شود", async () => {
    const caseId = await createDraft("act");
    await loginAs("super");
    const url = await redirectOf(() => deleteCaseAction(form({ caseId, mode: "total" })));
    expect(url.startsWith("/cases?m=")).toBe(true);
    expect(url).not.toContain(encodeURIComponent("حذف"));
    expect(messageOf(url)).toContain("کامل حذف شد");
    const [app] = await db.select({ id: s.applications.id }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(app).toBeUndefined();
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "delete_case_total"));
    expect(logs.length).toBe(1);
    // کد ملی آزاد شده: ثبت پروندهٔ جدید با همان مشخصات باید موفق شود
    await loginAs("act");
    const newUrl = await redirectOf(() => saveCaseCore(completeProfile(f)));
    expect(caseIdOf(newUrl)).not.toBe(caseId);
    const total = await searchCases(asSession(f.users.super), { q: "", sort: "newest" }, 1);
    expect(total.total).toBe(1);
  });

  it("بازیابیِ پروندهٔ فعال و حذفِ تکراری حذف‌شده: پیام راهنما بدون تغییر دوم", async () => {
    const caseId = await createDraft("act");
    await loginAs("super");
    const early = await redirectOf(() => restoreCaseAction(form({ caseId })));
    expect(messageOf(early)).toContain("نیازی به بازیابی");
    await redirectOf(() => deleteCaseAction(form({ caseId, mode: "bank" })));
    const again = await redirectOf(() => deleteCaseAction(form({ caseId, mode: "bank" })));
    expect(messageOf(again)).toContain("پیش‌تر");
    // هنوز در فیلتر حذف‌شده‌هاست و دوباره حذف نشده
    const deleted = await searchCases(asSession(f.users.super), { q: "", sort: "newest", deleted: true }, 1);
    expect(deleted.total).toBe(1);
  });
});
