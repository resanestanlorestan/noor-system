// الحاقیهٔ ۲.۱۵.۰ — صفحهٔ «مدیریت API و اتصال به سامانه‌های خارجی» داشبورد مدیریت
// فقط برای مدیر ارشد؛ دادهٔ واقعی کلیدها/اتصال‌ها/وب‌هوک‌ها/لاگ‌ها از دیتابیس می‌آید.
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiIntegrations, apiKeys, apiRequestLogs, apiWebhooks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureApiSettings } from "@/lib/api-keys";
import { webhookEvents } from "@/lib/api-outgoing";
import { ApiManagement, type ApiKeyRow, type IntegrationRow, type LogRow, type SettingsRow, type WebhookRow } from "@/components/api-management";
import { getContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

/** بارگذاری داده‌های بخش مدیریت API (بیرون از بدنهٔ کامپوننت برای خلوت‌ماندن رندر). */
async function loadApiDashboard() {
  const settings = await ensureApiSettings();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [keys, integrations, webhooks, logs, logs24h, errors24h] = await Promise.all([
    db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)),
    db.select().from(apiIntegrations).orderBy(desc(apiIntegrations.createdAt)),
    db.select().from(apiWebhooks).orderBy(desc(apiWebhooks.createdAt)),
    db.select({
      id: apiRequestLogs.id, direction: apiRequestLogs.direction, method: apiRequestLogs.method, path: apiRequestLogs.path,
      statusCode: apiRequestLogs.statusCode, ok: apiRequestLogs.ok, durationMs: apiRequestLogs.durationMs, error: apiRequestLogs.error,
      createdAt: apiRequestLogs.createdAt, apiKeyId: apiRequestLogs.apiKeyId, integrationId: apiRequestLogs.integrationId, webhookId: apiRequestLogs.webhookId,
    }).from(apiRequestLogs).orderBy(desc(apiRequestLogs.createdAt)).limit(100),
    db.select({ count: sql<number>`count(*)::int` }).from(apiRequestLogs).where(gte(apiRequestLogs.createdAt, since24h)),
    db.select({ count: sql<number>`count(*)::int` }).from(apiRequestLogs).where(sql`${apiRequestLogs.createdAt} >= ${since24h} and ${apiRequestLogs.ok} = false`),
  ]);
  return { settings, keys, integrations, webhooks, logs, logs24h: logs24h[0]?.count ?? 0, errors24h: errors24h[0]?.count ?? 0 };
}

export default async function ApiManagementPage() {
  const content = await getContent();
  const user = await requireUser();
  if ((user.effectiveRole ?? user.role) !== "super_admin") redirect("/dashboard");
  const { settings, keys, integrations, webhooks, logs, logs24h, errors24h } = await loadApiDashboard();
  const keyName = (id: string | null) => keys.find((item) => item.id === id)?.name ?? null;
  const integrationName = (id: string | null) => integrations.find((item) => item.id === id)?.name ?? null;
  const webhookName = (id: string | null) => webhooks.find((item) => item.id === id)?.name ?? null;
  const keyRows: ApiKeyRow[] = keys.map((key) => ({ id: key.id, name: key.name, keyPrefix: key.keyPrefix, scopes: key.scopes ?? [], rateLimit: key.rateLimit, active: key.active, lastUsedAt: key.lastUsedAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString() }));
  const integrationRows: IntegrationRow[] = integrations.map((item) => ({ id: item.id, name: item.name, baseUrl: item.baseUrl, authType: item.authType, authHeaderName: item.authHeaderName, active: item.active, lastStatus: item.lastStatus, lastLatencyMs: item.lastLatencyMs, lastTestedAt: item.lastTestedAt?.toISOString() ?? null }));
  const webhookRows: WebhookRow[] = webhooks.map((item) => ({ id: item.id, name: item.name, eventKey: item.eventKey, url: item.url, active: item.active, lastStatusCode: item.lastStatusCode, lastDispatchAt: item.lastDispatchAt?.toISOString() ?? null, integrationName: integrationName(item.integrationId) }));
  const logRows: LogRow[] = logs.map((log) => ({ id: log.id, direction: log.direction, method: log.method, path: log.path, statusCode: log.statusCode, ok: log.ok, durationMs: log.durationMs, error: log.error, createdAt: log.createdAt.toISOString(), subject: keyName(log.apiKeyId) ?? integrationName(log.integrationId) ?? webhookName(log.webhookId) ?? "—" }));
  const settingsRow: SettingsRow = { incomingEnabled: settings.incomingEnabled, defaultRateLimit: settings.defaultRateLimit, ipAllowlist: settings.ipAllowlist, updatedAt: settings.updatedAt.toISOString() };
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://pouyafarhadi.ir";
  return (
    <>
      <div className="ws-breadcrumb"><Link href="/dashboard">داشبورد</Link> <span> / </span><b>مدیریت API</b></div>
      <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> اتصال سامانه‌ها</div><h1>{content.text("pages.api_management.title")}</h1><p>{content.text("pages.api_management.sub")}</p></div></div>
      <ApiManagement
        keys={keyRows} integrations={integrationRows} webhooks={webhookRows} logs={logRows}
        settings={settingsRow} events={webhookEvents.map((event) => ({ ...event }))}
        scopes={[{ key: "cases:read", label: "خواندن پرونده‌ها" }, { key: "cases:write", label: "ایجاد و ویرایش پرونده‌ها" }]}
        stats={{ activeKeys: keyRows.filter((key) => key.active).length, integrations: integrationRows.length, webhooks: webhookRows.filter((item) => item.active).length, logs24h, errors24h }}
        baseUrl={baseUrl}
      />
    </>
  );
}
