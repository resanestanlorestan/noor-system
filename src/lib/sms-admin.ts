// الحاقیهٔ ۲.۱۰.۵ — داده‌های پنل مدیریت پیامک‌ها: ترکیب رجیستری قالب‌ها با
// overrideهای دیتابیس و کوئری‌های فیلترشدنی تاریخچهٔ پیامک‌ها از message_outbox.
import { and, count, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { messageOutbox, smsTemplates } from "@/db/schema";
import { SMS_TEMPLATE_DEFS, renderSmsBody, smsCategoryLabels, smsTemplateDef, type SmsCategory } from "@/lib/sms-templates";

/** خواندن متن قالب از دیتابیس با برگشت امن به پیش‌فرض رجیستری؛
 *  قالب غیرفعال هم مانند «ویرایش‌نشده» رفتار می‌کند. */
export async function resolveSmsTemplate(key: string, vars: Record<string, string | number | undefined | null> = {}): Promise<{ body: string; key: string; category: SmsCategory } | null> {
  const def = smsTemplateDef(key);
  if (!def) return null;
  let body = def.defaultBody;
  try {
    const [row] = await db.select({ body: smsTemplates.body, enabled: smsTemplates.enabled }).from(smsTemplates).where(eq(smsTemplates.key, key)).limit(1);
    if (row && row.enabled) body = row.body;
  } catch { /* بدون دیتابیس هم پیش‌فرض معتبر است */ }
  return { body: renderSmsBody(body, vars), key, category: def.category };
}

export type SmsTemplateRow = {
  key: string; category: SmsCategory; label: string; hint: string;
  variables: { token: string; label: string; sample: string }[];
  body: string; custom: boolean; enabled: boolean; updatedAt: Date | null;
};

/** همهٔ انواع پیامک ثبت‌شده در رجیستری + متن/وضعیت فعال از دیتابیس. */
export async function listSmsTemplates(): Promise<SmsTemplateRow[]> {
  const rows = await db.select().from(smsTemplates);
  const map = new Map(rows.map((row) => [row.key, row]));
  return SMS_TEMPLATE_DEFS.map((def) => {
    const row = map.get(def.key);
    return {
      key: def.key, category: def.category, label: def.label, hint: def.hint, variables: def.variables,
      body: row?.body ?? def.defaultBody, custom: !!row, enabled: row?.enabled ?? true, updatedAt: row?.updatedAt ?? null,
    };
  });
}

export const smsStatusLabels = { queued: "در صف ارسال", sent: "ارسال شد", failed: "ارسال ناموفق", local: "ذخیره محلی" } as const;
export type SmsHistoryStatus = keyof typeof smsStatusLabels;

export type SmsHistoryFilters = { status?: SmsHistoryStatus; category?: SmsCategory; phone?: string };
export type SmsHistoryRow = typeof messageOutbox.$inferSelect;

/** تاریخچهٔ پیامک‌های سامانه با فیلتر وضعیت/دسته/شماره گیرنده (صفحه‌بندی‌شده). */
export async function listSmsHistory(filters: SmsHistoryFilters = {}, limit = 50, offset = 0): Promise<{ rows: SmsHistoryRow[]; total: number }> {
  const conditions: SQL[] = [eq(messageOutbox.channel, "sms")];
  if (filters.status) conditions.push(eq(messageOutbox.status, filters.status));
  if (filters.category) conditions.push(eq(messageOutbox.category, filters.category));
  const phone = (filters.phone || "").replace(/[^\d+]/g, "").slice(0, 15);
  if (phone) conditions.push(like(messageOutbox.recipient, `%${phone}%`));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db.select().from(messageOutbox).where(where).orderBy(desc(messageOutbox.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(messageOutbox).where(where),
  ]);
  return { rows, total: Number(totals[0]?.total ?? 0) };
}

/** شمارنده‌های سرصفحهٔ پنل: تعداد هر وضعیت برای پیامک‌ها. */
export async function smsHistoryTotals(): Promise<{ total: number; sent: number; failed: number; queued: number; local: number }> {
  const [rows] = await Promise.all([
    db.select({ status: messageOutbox.status, total: count() }).from(messageOutbox).where(eq(messageOutbox.channel, "sms")).groupBy(messageOutbox.status),
  ]);
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  return { total: Object.values(byStatus).reduce((sum, value) => sum + value, 0), sent: byStatus.sent ?? 0, failed: byStatus.failed ?? 0, queued: byStatus.queued ?? 0, local: byStatus.local ?? 0 };
}

/** برچسب دسته برای نمایش در جدول تاریخچه (دسته‌های خارج از رجیستری هم پشتیبانی می‌شوند). */
export const smsCategoryTitle = (category: string | null | undefined) => (category ? (smsCategoryLabels as Record<string, string>)[category] ?? category : "—");
export const smsTemplateTitle = (templateKey: string | null | undefined) => (templateKey ? smsTemplateDef(templateKey)?.label ?? templateKey : "—");
