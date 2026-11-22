// آزمون‌های الحاقیهٔ ۲.۲۲.۰ — انتقال «افزودن سازمان جدید» از تنظیمات به مرحلهٔ ۲
// ویزارد پرونده؛ اکشن و گارد دست‌نخورده‌اند، این آزمون‌ها رفتار فعلی را روی
// دیتابیس واقعی noor_feature تثبیت می‌کنند:
// ۱) ردِ بدون مجوز (بررسی/کارشناس)؛ ۲) ثبت موفق با مجوز + ردپای ممیزی؛
// ۳) ردِ نام تکراری؛ ۴) ردِ ناسازگاری شهرستان با استان.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./env";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { closeDb, featureSeed, form, loginAs, resetCaseData, type Fixture } from "./helpers";
import { initialActionState } from "@/lib/action-state";
import { addOrganizationAction } from "@/app/actions/management";

let f: Fixture;
beforeAll(async () => { await resetCaseData(); f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

const suffix = String(Date.now()).slice(-6);
const addOrg = (fields: Record<string, string>) => addOrganizationAction(initialActionState, form(fields));

describe("الحاقیهٔ ۲.۲۲.۰ — افزودن سازمان در مرحلهٔ ۲ با همان اکشن و گارد", () => {
  it("ثبت سازمان بدون مجوز مدیریت مرجع رد می‌شود", async () => {
    await loginAs("rev");
    const res = await addOrg({ name: `سازمان بی‌مجوز ${suffix}` });
    expect(res.error).toContain("مجوز مدیریت تخصص‌ها و سازمان‌ها");
  });

  it("ثبت سازمان با مجوز موفق است، ممیزی می‌شود و برای همکاری سازمانی در دسترس است", async () => {
    await loginAs("super");
    const name = `مؤسسه آزمون ۲۲ ${suffix}`;
    const res = await addOrg({ name, type: "مؤسسه قرآنی", managerName: "مدیر آزمون", phone: "02112345678" });
    expect(res.success).toContain("به فهرست اضافه شد");
    const [row] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.name, name));
    expect(row).toBeDefined();
    const [auditRow] = await db.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(eq(s.auditLogs.action, "add_organization"), eq(s.auditLogs.targetId, String(row.id))));
    expect(auditRow).toBeDefined();
  });

  it("نام تکراری رد می‌شود", async () => {
    await loginAs("super");
    const res = await addOrg({ name: `مؤسسه آزمون ۲۲ ${suffix}` });
    expect(res.error).toContain("قبلاً در فهرست ثبت شده است");
  });

  it("شهرستان ناسازگار با استان رد می‌شود", async () => {
    await loginAs("super");
    const res = await addOrg({ name: `سازمان ناسازگار ${suffix}`, provinceId: String(f.tehranProvinceId), countyId: String(f.islamshahrCountyId + 100000) });
    expect(res.error).toContain("شهرستان با استان سازگار نیست");
  });
});
