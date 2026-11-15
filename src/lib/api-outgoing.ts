// الحاقیهٔ ۲.۱۵.۰ — ارسال خروجی به سامانه‌های خارجی و وب‌هوک‌ها
//
// sendOutgoing: درخواست HTTP با هدرهای احراز اتصال (Bearer یا هدر سفارشی با
// توکن رمزنگاری‌شده) همراه ثبت تاریخچه به‌ازای هر تلاش.
// dispatchWebhookEvent: روی رویدادهای مشخص پرونده، بدنهٔ JSON با امضای HMAC
// به همهٔ وب‌هوک‌های فعال همان رویداد ارسال می‌شود (بدون توقف جریان اصلی).
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiIntegrations, apiWebhooks } from "@/db/schema";
import { decryptSecret } from "@/lib/local-secrets";
import { API_TOKEN_PURPOSE, WEBHOOK_SECRET_PURPOSE, logApiRequest } from "@/lib/api-keys";

/** رویدادهای پشتیبانی‌شدهٔ وب‌هوک — فهرست در تب مستندات هم می‌آید. */
export const webhookEvents = [
  { key: "case.submitted", label: "ارسال پرونده برای بررسی" },
  { key: "case.reviewed", label: "نتیجهٔ بررسی (تأیید / نیازمند اصلاح / رد)" },
] as const;
export const webhookEventKeys: string[] = webhookEvents.map((event) => event.key);

async function integrationHeaders(integration: typeof apiIntegrations.$inferSelect) {
  const headers: Record<string, string> = { ...(integration.headers ?? {}) };
  if (integration.tokenCipher && (integration.authType === "bearer" || integration.authType === "header")) {
    const token = await decryptSecret(integration.tokenCipher, API_TOKEN_PURPOSE);
    if (token) {
      if (integration.authType === "bearer") headers["Authorization"] = `Bearer ${token}`;
      else headers[integration.authHeaderName || "X-API-Key"] = token;
    }
  }
  return headers;
}

/** یک درخواست خروجی با اندازه‌گیری تأخیر و ثبت تاریخچه. */
export async function sendOutgoing(integration: typeof apiIntegrations.$inferSelect, options: { method?: string; url: string; body?: unknown; webhookId?: string | null }) {
  const method = options.method ?? "POST";
  const started = Date.now();
  const payload = options.body == null ? null : JSON.stringify(options.body);
  try {
    const headers = await integrationHeaders(integration);
    if (payload) headers["Content-Type"] = "application/json";
    const response = await fetch(options.url, { method, headers, body: payload ?? undefined, signal: AbortSignal.timeout(10_000) });
    const duration = Date.now() - started;
    const snippet = (await response.text().catch(() => "")).slice(0, 400);
    await logApiRequest({ direction: "outgoing", method, path: options.url, integrationId: integration.id, webhookId: options.webhookId ?? null, statusCode: response.status, ok: response.ok, durationMs: duration, payload, responseSnippet: snippet, error: response.ok ? null : `HTTP ${response.status}` });
    return { ok: response.ok, status: response.status, duration, snippet };
  } catch (error) {
    const duration = Date.now() - started;
    // پیام خطای ریشه‌ای undici (مثل ECONNREFUSED) در cause است — برای تشخیص دقیق ثبت می‌شود.
    const message = error instanceof Error
      ? [error.message, (error.cause as Error | undefined)?.message].filter(Boolean).join(": ") || error.message
      : "خطای ناشناختهٔ شبکه";
    await logApiRequest({ direction: "outgoing", method, path: options.url, integrationId: integration.id, webhookId: options.webhookId ?? null, statusCode: null, ok: false, durationMs: duration, payload, error: message });
    return { ok: false, status: 0, duration, snippet: "" };
  }
}

/** ارسال رویداد به همهٔ وب‌هوک‌های فعال آن رویداد؛ خطاهای مقصد جریان اصلی را نمی‌شکند. */
// eventKey به‌صورت رشتهٔ آزاد پذیرفته می‌شود؛ فهرست معتبرها در webhookEvents مستند است.
export async function dispatchWebhookEvent(eventKey: string, payload: Record<string, unknown>) {
  const rows = await db.select().from(apiWebhooks).where(and(eq(apiWebhooks.eventKey, eventKey), eq(apiWebhooks.active, true)));
  if (!rows.length) return;
  const integrationIds = [...new Set(rows.map((row) => row.integrationId).filter((id): id is string => !!id))];
  const activeIntegrations = integrationIds.length
    ? await db.select().from(apiIntegrations).where(and(eq(apiIntegrations.active, true)))
    : [];
  await Promise.allSettled(rows.map(async (webhook) => {
    if (webhook.integrationId && !activeIntegrations.some((item) => item.id === webhook.integrationId)) return;
    const secret = webhook.secretCipher ? await decryptSecret(webhook.secretCipher, WEBHOOK_SECRET_PURPOSE) : null;
    const body = JSON.stringify({ event: eventKey, sentAt: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Noor-Event": eventKey, "X-Noor-Timestamp": String(Date.now()) };
    if (secret) headers["X-Noor-Signature"] = createHmac("sha256", secret).update(body).digest("hex");
    const started = Date.now();
    let statusCode: number | null = null;
    let ok = false;
    let error: string | null = null;
    try {
      const response = await fetch(webhook.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      statusCode = response.status;
      ok = response.ok;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : "خطای ناشناختهٔ شبکه";
    }
    await db.update(apiWebhooks).set({ lastStatusCode: statusCode, lastDispatchAt: new Date() }).where(eq(apiWebhooks.id, webhook.id));
    await logApiRequest({ direction: "outgoing", method: "POST", path: webhook.url, integrationId: webhook.integrationId, webhookId: webhook.id, statusCode, ok, durationMs: Date.now() - started, payload: body, error });
  }));
}
