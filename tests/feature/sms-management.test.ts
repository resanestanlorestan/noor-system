// Feature tests for الحاقیهٔ ۲.۱۰.۵ — پنل مدیریت پیامک‌ها در داشبورد مدیریت:
// رجیستری و رندر متغیرهای پویا، CRUD قالب‌ها با برگشت به پیش‌فرض، تنظیمات پنل
// پیامکی با کلید رمزنگاری‌شده، تست ارسال با بازخورد واقعی و تاریخچهٔ فیلترشدنی.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, messageOf, form, featureSeed, loginAs, resetCaseData, closeDb, type Fixture, type UserKey } from "./helpers";
import { saveSmsTemplateAction, resetSmsTemplateAction, toggleSmsTemplateAction, saveSmsSettingsAction, sendTestSmsAction, resendSmsAction } from "@/app/actions/sms";
import { listSmsHistory, listSmsTemplates, smsCategoryTitle, smsHistoryTotals, smsTemplateTitle } from "@/lib/sms-admin";
import { renderSmsBody, SMS_TEMPLATE_DEFS } from "@/lib/sms-templates";
import { resolveSmsTemplate } from "@/lib/sms-admin";
import { queueTemplateSms, resolveSmsSettings, smsReady } from "@/lib/messaging";
import { decryptSecret } from "@/lib/local-secrets";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(async () => {
  await resetCaseData();
  // پنل پیامک بین آزمون‌ها به حالت اولیه برمی‌گردد
  await db.delete(s.smsTemplates);
  await db.update(s.smsSettings).set({ provider: "", username: "", secretCipher: null, sender: "", enabled: false }).where(eq(s.smsSettings.id, "default"));
  await db.delete(s.messageOutbox).where(eq(s.messageOutbox.channel, "sms"));
});
afterAll(closeDb);

describe("پنل مدیریت پیامک‌ها", () => {
  it("رجیستری قالب‌ها و رندر متغیرهای پویا با برگشت امن به پیش‌فرض", async () => {
    expect(SMS_TEMPLATE_DEFS.length).toBeGreaterThanOrEqual(6);
    const rendered = renderSmsBody("کد شما: {{code}} از {{app}}؛ {{unknown}}", { code: "482910", app: "سامانه نور" });
    expect(rendered).toBe("کد شما: 482910 از سامانه نور؛ ");
    const template = await resolveSmsTemplate("mobile_verification", { code: "482910", app: "سامانه جامع فعالان قرآنی" });
    expect(template?.category).toBe("auth");
    expect(template?.body).toContain("482910");
    // قالب ناموجود در رجیستری → null
    expect(await resolveSmsTemplate("no_such_key", {})).toBeNull();
  });

  it("گارد دسترسی: مدیر استان اجازه مدیریت پیامک ندارد", async () => {
    await loginAs("prov");
    const url = await redirectOf(() => saveSmsTemplateAction({}, form({ templateKey: "case_submitted", body: "پرونده {{name}} دریافت شد." })));
    expect(messageOf(url)).toContain("دسترسی");
  });

  it("ویرایش قالب، غیرفعال‌سازی و بازگشت به پیش‌فرض — بدون تغییر کد", async () => {
    await loginAs("super");
    const state = await saveSmsTemplateAction({}, form({ templateKey: "case_submitted", body: "{{app}}: پرونده {{name}} ثبت شد." }));
    expect(state.error).toBeUndefined();
    const list = await listSmsTemplates();
    const edited = list.find((item) => item.key === "case_submitted");
    expect(edited?.custom).toBe(true);
    expect(edited?.body).toBe("{{app}}: پرونده {{name}} ثبت شد.");
    const sent = await resolveSmsTemplate("case_submitted", { name: "زهرا موسوی", app: "سامانه نور" });
    expect(sent?.body).toContain("زهرا موسوی");
    // غیرفعال‌سازی → برگشت به پیش‌فرض رجیستری
    await redirectOf(() => toggleSmsTemplateAction(form({ templateKey: "case_submitted" })));
    const fallback = await resolveSmsTemplate("case_submitted", { name: "زهرا موسوی", app: "سامانه نور" });
    expect(fallback?.body).toContain("برای بررسی ارسال شد");
    // فعال‌سازی دوباره → متن دلخواه
    await redirectOf(() => toggleSmsTemplateAction(form({ templateKey: "case_submitted" })));
    const custom = await resolveSmsTemplate("case_submitted", { name: "زهرا موسوی", app: "سامانه نور" });
    expect(custom?.body).toContain("ثبت شد");
    // بازگشت به پیش‌فرض با ممیزی
    await redirectOf(() => resetSmsTemplateAction(form({ templateKey: "case_submitted" })));
    const afterReset = await listSmsTemplates();
    expect(afterReset.find((item) => item.key === "case_submitted")?.custom).toBe(false);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "delete_sms_template"));
    expect(logs.length).toBe(1);
  });

  it("تنظیمات پنل پیامکی: کلید API رمزنگاری می‌شود و resolveSmsSettings آن را برمی‌گرداند", async () => {
    await loginAs("super");
    expect(await smsReady()).toBe(false);
    const state = await saveSmsSettingsAction({}, form({ provider: "payamak-panel", username: "demo_user", secret: "demo-api-key", sender: "50004001", enabled: "1" }));
    expect(state.error).toBeUndefined();
    expect(state.success).toContain("فعال");
    const [row] = await db.select().from(s.smsSettings).where(eq(s.smsSettings.id, "default"));
    expect(row.enabled).toBe(true);
    expect(row.secretCipher).toBeTruthy();
    expect(row.secretCipher).not.toContain("demo-api-key");
    expect(await decryptSecret(row.secretCipher!, "sms-panel-secret")).toBe("demo-api-key");
    const config = await resolveSmsSettings();
    expect(config?.provider).toBe("payamak-panel");
    expect(config?.source).toBe("database");
    expect(config?.secret).toBe("demo-api-key");
    expect(config?.sender).toBe("50004001");
    // ذخیره بدون تغییر کلید: فیلد خالی کلید قبلی را نگه می‌دارد
    const keep = await saveSmsSettingsAction({}, form({ provider: "payamak-panel", username: "demo_user", secret: "", sender: "50004001", enabled: "1" }));
    expect(keep.error).toBeUndefined();
    expect(await smsReady()).toBe(true);
    // غیرفعال‌سازی → برگشت به محیط (در آزمون تنظیم نشده → حالت محلی)
    await saveSmsSettingsAction({}, form({ provider: "payamak-panel", username: "demo_user", secret: "", sender: "50004001", enabled: "" }));
    expect(await smsReady()).toBe(false);
    // فعال‌سازی ناقص → پیام خطا
    const invalid = await saveSmsSettingsAction({}, form({ provider: "payamak-panel", username: "", secret: "", sender: "", enabled: "1" }));
    expect(invalid.error).toContain("نام کاربری");
  });

  it("تست ارسال در حالت محلی: ردیف outbox با دستهٔ test و بازخورد وضعیت", async () => {
    await loginAs("super");
    const state = await sendTestSmsAction({}, form({ phone: "09121234567", customBody: "سلام آزمون پنل پیامک" }));
    expect(state.success).toContain("حالت محلی");
    const { rows } = await listSmsHistory({ category: "test" });
    expect(rows.length).toBe(1);
    expect(rows[0].recipient).toBe("09121234567");
    expect(rows[0].status).toBe("local");
    expect(rows[0].body).toBe("سلام آزمون پنل پیامک");
    const totals = await smsHistoryTotals();
    expect(totals.local).toBe(1);
    // شمارهٔ نامعتبر رد می‌شود
    const bad = await sendTestSmsAction({}, form({ phone: "12345", customBody: "سلام" }));
    expect(bad.error).toContain("۰۹");
  });

  it("متادیتای قالب در صف ثبت می‌شود و فیلترهای تاریخچه کار می‌کنند", async () => {
    await db.transaction(async (tx) => {
      await queueTemplateSms(tx, "09121112233", "overdue_staff", { name: "زهرا موسوی", days: "۱۲" });
    });
    const { rows } = await listSmsHistory({ category: "reminder" });
    expect(rows.length).toBe(1);
    expect(rows[0].templateKey).toBe("overdue_staff");
    expect(rows[0].body).toContain("زهرا موسوی");
    expect(rows[0].body).toContain("۱۲ روز");
    expect(smsTemplateTitle("overdue_staff")).toContain("یادآور");
    expect(smsCategoryTitle("broadcast")).toBe("پیام گروهی");
    expect(smsCategoryTitle(null)).toBe("—");
    const byPhone = await listSmsHistory({ phone: "1122" });
    expect(byPhone.total).toBe(1);
    const byStatus = await listSmsHistory({ status: "local" });
    expect(byStatus.total).toBe(1);
  });

  it("ارسال مجدد پیامک ناموفق با ممیزی", async () => {
    await loginAs("super");
    const [failed] = await db.insert(s.messageOutbox).values({ channel: "sms", recipient: "09121234567", body: "پیام ناموفق", status: "failed", error: "gateway down" }).returning({ id: s.messageOutbox.id });
    const url = await redirectOf(() => resendSmsAction(form({ messageId: failed.id })));
    expect(messageOf(url)).toContain("ارسال");
    const [after] = await db.select({ status: s.messageOutbox.status, error: s.messageOutbox.error }).from(s.messageOutbox).where(eq(s.messageOutbox.id, failed.id));
    // بدون سرویس‌دهنده، تلاش ارسال دوباره ناموفق ثبت می‌شود (نه در صف ماندگار)
    expect(["failed", "local"]).toContain(after.status);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "resend_sms"));
    expect(logs.length).toBe(1);
  });
});
