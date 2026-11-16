// الحاقیهٔ ۲.۱۶.۰ — آزمون‌های ویژگی «اطلاع‌رسانی پیامکی مدیران»:
// همگام‌سازی مدیران از سامانهٔ کاربران (نقش پایه و سمت سفارشی)، ارسال خودکار
// هنگام ثبت پرونده با ضدتکرار، گیرندهٔ غیرفعال و کلید خاموش، مدیریت دستی
// شماره‌ها و ارسال مجدد ناموفق‌ها با ثبت خطای واقعی پنل پیامکی.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  redirectOf, caseIdOf, form, pdfFile, pngFile, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, type Fixture,
} from "./helpers";
import { saveCaseCore } from "@/lib/case-save";
import { uploadDocumentAction, uploadPhotoAction, prepareCaseAction, submitCaseAction } from "@/app/actions/cases";
import { dispatchCaseCreatedSms, syncManagerRecipients } from "@/lib/manager-sms";
import { addManagerRecipientAction, resendManagerEventAction, restoreManagerRecipientAction, toggleManagerRecipientSmsAction, deleteManagerRecipientAction } from "@/app/actions/manager-sms";
import { saveCustomRoleAction, deleteCustomRoleAction } from "@/app/actions/permissions";

let f: Fixture;
beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const PHONES: Record<"super" | "prov" | "county" | "provFars", string> = {
  super: "09363330001", prov: "09363330002", county: "09363330003", provFars: "09363330004",
};
const setPhone = async (key: keyof typeof PHONES | "rev", phone: string | null) =>
  await db.update(s.users).set({ phone }).where(eq(s.users.id, f.users[key].id));
const eventsOf = (entityId: string) =>
  db.select().from(s.managerSmsEvents).where(and(eq(s.managerSmsEvents.eventType, "case_created"), eq(s.managerSmsEvents.entityId, entityId)));
const recipientOf = async (userId: string) =>
  (await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.sourceUserId, userId)))[0];
/** انتظار برای شعلهٔ پشت‌زمینهٔ void dispatch در submitCaseAction */
const waitFor = async (entityId: string, count: number) => {
  let rows = await eventsOf(entityId);
  for (let i = 0; i < 30 && rows.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    rows = await eventsOf(entityId);
  }
  return rows;
};

describe("اطلاع‌رسانی پیامکی مدیران", () => {
  it("همگام‌سازی: مدیران نقش‌پایه با شمارهٔ معتبر اضافه و با تغییر حساب به‌روز می‌شوند", async () => {
    for (const key of ["super", "prov", "county", "provFars"] as const) await setPhone(key, PHONES[key]);
    // اجرای تکرارپذیر: نام پایهٔ مدیر استان بازگردانی می‌شود تا تغییر نام همیشه رخ دهد
    await db.update(s.users).set({ fullName: "مدیر استان تهران" }).where(eq(s.users.id, f.users.prov.id));
    const result = await syncManagerRecipients(f.users.super.id);
    expect(result.identified).toBeGreaterThanOrEqual(4);
    expect(result.errors).toHaveLength(0);
    expect((await db.select().from(s.managerSmsRecipients)).length).toBeGreaterThanOrEqual(4);
    const superRow = await recipientOf(f.users.super.id);
    expect(superRow!.phone).toBe(PHONES.super);
    expect(superRow!.position).toBe("مدیر کل سامانه");
    expect(superRow!.smsEnabled).toBe(true);
    expect(superRow!.source).toBe("auto");

    // تغییر نام در سامانهٔ اصلی → به‌روزرسانی ردیف همگام‌شده
    await db.update(s.users).set({ fullName: "مدیر استان تهران نام‌تازه" }).where(eq(s.users.id, f.users.prov.id));
    const updated = await syncManagerRecipients(f.users.super.id);
    expect(updated.updated).toBeGreaterThanOrEqual(1);
    expect((await recipientOf(f.users.prov.id))!.fullName).toBe("مدیر استان تهران نام‌تازه");
  }, 40_000);

  it("ثبت پرونده پیامک خودکار می‌فرستد؛ متن، ثبت‌کننده و زمان در پیام است و تکرار مسدود", async () => {
    await loginAs("rev");
    const url = await redirectOf(() => saveCaseCore(completeProfile(f, { source: "expert" })));
    const caseId = caseIdOf(url);
    await loginAs("rev");
    expect((await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile() }))).error).toBeUndefined();
    await loginAs("rev");
    expect((await uploadPhotoAction(caseId, {}, form({ file: pngFile() }))).error).toBeUndefined();
    await loginAs("rev");
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    await loginAs("rev");
    await redirectOf(() => submitCaseAction(form({ caseId })));

    const events = await waitFor(caseId, Object.values(PHONES).length);
    // پروندهٔ آزمون موازی ممکن است مدیر تازه‌ای ساخته باشد؛ حداقل چهار مدیر پایه باید پیامک بگیرند
    expect(events.length).toBeGreaterThanOrEqual(Object.values(PHONES).length);
    const phones = events.map((item) => item.phone);
    // ضدتکرار: هر گیرنده فقط یک پیامک برای همین پرونده
    expect(new Set(phones).size).toBe(phones.length);
    for (const phone of Object.values(PHONES)) expect(phones).toContain(phone);
    const message = events[0].message;
    expect(message).toContain("مدیر محترم");
    expect(message).toContain("کارشناس بررسی"); // نام ثبت‌کننده
    expect(message).toContain("لطفاً جهت بررسی");
    // وضعیت واقعی از صندوق پیام می‌آید؛ با تنظیمات موازیٔ سایر آزمون‌ها ممکن است صف/ارسال واقعی هم شود
    expect(events.every((item) => ["local", "queued", "sent", "failed"].includes(item.status))).toBe(true);
    expect(events.every((item) => item.outboxId)).toBe(true);

    // ضدتکرار: تلاش دوبارهٔ همان پرونده ردیف تازه نمی‌سازد
    await dispatchCaseCreatedSms(caseId, "کارشناس بررسی");
    expect(await eventsOf(caseId)).toHaveLength(events.length);
  }, 90_000);

  it("مدیر غیرفعال و کلید ارسال خودکار خاموش، پیامکی دریافت نمی‌کند", async () => {
    const provRow = await recipientOf(f.users.prov.id);
    await db.update(s.managerSmsRecipients).set({ smsEnabled: false }).where(eq(s.managerSmsRecipients.id, provRow!.id));
    const entityId = randomUUID();
    await dispatchCaseCreatedSms(entityId, "زهرا موسوی");
    const withoutProv = await eventsOf(entityId);
    expect(withoutProv.map((item) => item.phone)).not.toContain(PHONES.prov);
    await db.update(s.managerSmsRecipients).set({ smsEnabled: true }).where(eq(s.managerSmsRecipients.id, provRow!.id));
    const activeCount = (await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.smsEnabled, true))).length;
    expect(withoutProv).toHaveLength(activeCount - 1);

    await db.update(s.managerSmsSettings).set({ autoCaseCreated: false }).where(eq(s.managerSmsSettings.id, "default"));
    const offId = randomUUID();
    await dispatchCaseCreatedSms(offId, "زهرا موسوی");
    expect(await eventsOf(offId)).toHaveLength(0);
    await db.update(s.managerSmsSettings).set({ autoCaseCreated: true }).where(eq(s.managerSmsSettings.id, "default"));
    const onId = randomUUID();
    await dispatchCaseCreatedSms(onId, "زهرا موسوی");
    expect(await eventsOf(onId)).toHaveLength(activeCount);
  }, 60_000);

  it("مدیریت دستی: افزودن، شمارهٔ تکراری، تغییر وضعیت و حذف", async () => {
    await loginAs("super");
    // اجرای تکرارپذیر: بقایای شمارهٔ دستی اجرای قبلی پاک می‌شود
    await db.delete(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.phone, "09364440001"));
    const added = await addManagerRecipientAction({}, form({ fullName: "مدیر آزمایشی دستی", position: "رئیس دفتر", phone: "09364440001" }));
    expect(added.success).toBeTruthy();
    const [manual] = await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.phone, "09364440001"));
    expect(manual.source).toBe("manual");
    expect(manual.smsEnabled).toBe(true);

    const duplicate = await addManagerRecipientAction({}, form({ fullName: "ثبت دوم", position: "", phone: "09364440001" }));
    expect(duplicate.error).toContain("قبلاً");
    const badPhone = await addManagerRecipientAction({}, form({ fullName: "ثبت سوم", position: "", phone: "12345" }));
    expect(badPhone.error).toContain("معتبر نیست");

    await redirectOf(() => toggleManagerRecipientSmsAction(form({ recipientId: manual.id })));
    expect((await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, manual.id)))[0].smsEnabled).toBe(false);

    await redirectOf(() => deleteManagerRecipientAction(form({ recipientId: manual.id })));
    expect(await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, manual.id))).toHaveLength(0);
  }, 40_000);

  it("حذف مدیر همگام‌شده یعنی کنارگذاشتن: در همگام‌سازی بازنمی‌گردد، پیامک نمی‌گیرد و بازگردانی ممکن است", async () => {
    await loginAs("super");
    const provRow = await recipientOf(f.users.prov.id);
    expect(provRow).toBeTruthy();
    // حذف ردیف همگام‌شده → کنار گذاشتن، نه پاک‌کردن
    await redirectOf(() => deleteManagerRecipientAction(form({ recipientId: provRow!.id })));
    const excluded = (await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, provRow!.id)))[0];
    expect(excluded.excluded).toBe(true);
    // همگام‌سازی بعدی او را دوباره نمی‌سازد و ردیفش دست‌نخورده می‌ماند
    const result = await syncManagerRecipients(f.users.super.id);
    expect(result.excludedSkipped).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, provRow!.id)))[0].excluded).toBe(true);
    // کنارگذاشته‌ها پیامکی دریافت نمی‌کنند
    const entityId = randomUUID();
    await dispatchCaseCreatedSms(entityId, "زهرا موسوی");
    expect((await eventsOf(entityId)).map((item) => item.phone)).not.toContain(PHONES.prov);
    // بازگردانی → به فهرست برمی‌گردد و همگام‌سازی اطلاعات را از حسابش تازه می‌کند
    await redirectOf(() => restoreManagerRecipientAction(form({ recipientId: provRow!.id })));
    expect((await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, provRow!.id)))[0].excluded).toBe(false);
    await syncManagerRecipients(f.users.super.id);
    const refreshed = (await db.select().from(s.managerSmsRecipients).where(eq(s.managerSmsRecipients.id, provRow!.id)))[0];
    expect(refreshed.excluded).toBe(false);
    expect(refreshed.fullName).toBe("مدیر استان تهران نام‌تازه");
  }, 40_000);

  it("ارسال مجدد ناموفق‌ها تلاش می‌کند و خطای واقعی پنل را ثبت می‌کند", async () => {
    await loginAs("super");
    const rows = await db.select().from(s.managerSmsEvents).limit(1);
    const event = rows[0];
    expect(event).toBeTruthy();
    // resetCaseData صندوق پیام را بین آزمون‌ها خالی می‌کند؛ زوج رویداد/صندوق تازه ساخته می‌شود
    const [outboxRow] = await db.insert(s.messageOutbox).values({
      channel: "sms", recipient: event.phone, applicationId: event.entityId, subject: null,
      body: event.message, status: "failed", error: "خطای قدیمی", deliveredAt: null,
    }).returning({ id: s.messageOutbox.id });
    await db.update(s.managerSmsEvents).set({ status: "failed", error: "خطای قدیمی", outboxId: outboxRow.id }).where(eq(s.managerSmsEvents.id, event.id));

    await redirectOf(() => resendManagerEventAction(form({ eventId: event.id })));
    const after = (await db.select().from(s.managerSmsEvents).where(eq(s.managerSmsEvents.id, event.id)))[0];
    expect(after.attempts).toBe(event.attempts + 1);
    // بدون پنل واقعی، تلاش دوباره به خطای روشن پنل می‌رسد و در گزارش می‌ماند
    expect(after.status).toBe("failed");
    expect(after.error).toContain("تنظیم نشده");
  }, 40_000);

  it("نقش سفارشی حاوی «مدیر» به فهرست پیامک می‌رسد و با حذف نقش خارج می‌شود", async () => {
    await loginAs("super");
    await setPhone("rev", "09365550001");
    const created = await saveCustomRoleAction({}, form({ label: "مدیر روابط عمومی", baseRole: "reviewer", description: "آزمون ۲.۱۶.۰" }));
    expect(created.error).toBeUndefined();
    const [role] = await db.select().from(s.customRoles).where(eq(s.customRoles.label, "مدیر روابط عمومی"));
    await db.update(s.users).set({ customRoleId: role.id }).where(eq(s.users.id, f.users.rev.id));

    const result = await syncManagerRecipients(f.users.super.id);
    const revRow = await recipientOf(f.users.rev.id);
    expect(revRow).toBeTruthy();
    expect(revRow!.position).toBe("مدیر روابط عمومی");
    expect(result.identified).toBeGreaterThanOrEqual(4);

    // خروج از مدیریت → حذف خودکار ردیف همگام‌شده
    await db.update(s.users).set({ customRoleId: null }).where(eq(s.users.id, f.users.rev.id));
    const cleanup = await syncManagerRecipients(f.users.super.id);
    expect(cleanup.removed).toBeGreaterThanOrEqual(1);
    expect(await recipientOf(f.users.rev.id)).toBeUndefined();
    // پاک‌سازی برای اجرای بعدی
    await setPhone("rev", null);
    expect((await deleteCustomRoleAction({}, form({ customRoleId: role.id }))).success).toBeTruthy();
  }, 40_000);
});
