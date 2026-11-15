"use server";

// الحاقیهٔ ۲.۱۵.۰ — کنش‌های مدیریتی بخش «مدیریت API» داشبورد
// تولید/نمایش/فعال‌سازی/حذف کلیدها، مدیریت اتصال‌ها و وب‌هوک‌ها، تست اتصال،
// ارسال مجدد درخواست‌های ناموفق و تنظیمات سراسری — همه فقط برای مدیر ارشد.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apiIntegrations, apiKeys, apiRequestLogs, apiSettings, apiWebhooks } from "@/db/schema";
import { requireUser, audit } from "@/lib/auth";
import { encryptSecret } from "@/lib/local-secrets";
import { API_KEY_PURPOSE, WEBHOOK_SECRET_PURPOSE, API_TOKEN_PURPOSE, createApiKeySecret, revealApiKey, ensureApiSettings, logApiRequest } from "@/lib/api-keys";
import { sendOutgoing, dispatchWebhookEvent, webhookEventKeys } from "@/lib/api-outgoing";
import type { ActionState } from "@/lib/action-state";

const API_PAGE = "/dashboard/api-management";

async function requireApiAdmin() {
  const user = await requireUser();
  // مدیریت API قابلیت سطح پلتفرم است و فقط برای مدیر ارشد باز می‌شود.
  if ((user.effectiveRole ?? user.role) !== "super_admin") throw new Error("Forbidden");
  return user;
}

const field = (data: FormData, key: string, max = 200) => String(data.get(key) || "").trim().slice(0, max);

export async function createApiKeyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireApiAdmin();
    const name = field(data, "name", 120);
    if (name.length < 3) return { error: "نام کلید باید حداقل ۳ نویسه باشد." };
    const scopes = data.getAll("scopes").map((item) => String(item)).filter((item) => item === "cases:read" || item === "cases:write");
    if (!scopes.length) return { error: "حداقل یک سطح دسترسی انتخاب کنید." };
    const rateLimit = Math.min(600, Math.max(5, Number(data.get("rateLimit") || 60) || 60));
    const secret = await createApiKeySecret();
    await db.insert(apiKeys).values({ name, keyPrefix: secret.prefix, keyHash: secret.hash, keyCipher: secret.cipher, scopes, rateLimit, createdBy: user.id });
    await audit(user.id, "api_key_create", "api_key", undefined, `${name};scopes=${scopes.join("+")}`);
    revalidatePath(API_PAGE);
    return { success: `کلید «${name}» ساخته شد.`, secret: secret.key };
  } catch { return { error: "ساخت کلید API ممکن نشد." }; }
}

export async function revealApiKeyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireApiAdmin();
    const id = field(data, "id", 40);
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (!key) return { error: "کلید یافت نشد." };
    const value = await revealApiKey(key.keyCipher);
    await audit(user.id, "api_key_reveal", "api_key", id, key.name);
    return { success: value ? `کلید «${key.name}»` : undefined, secret: value ?? undefined, error: value ? undefined : "مقدار کلید در دسترس نیست." };
  } catch { return { error: "نمایش کلید ممکن نشد." }; }
}

export async function toggleApiKeyAction(data: FormData) {
  try {
    const user = await requireApiAdmin();
    const id = field(data, "id", 40);
    const [key] = await db.select({ active: apiKeys.active, name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (key) {
      await db.update(apiKeys).set({ active: !key.active }).where(eq(apiKeys.id, id));
      await audit(user.id, key.active ? "api_key_disable" : "api_key_enable", "api_key", id, key.name);
    }
    revalidatePath(API_PAGE);
  } catch {}
}

export async function deleteApiKeyAction(data: FormData) {
  try {
    const user = await requireApiAdmin();
    const id = field(data, "id", 40);
    const [key] = await db.select({ name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    await audit(user.id, "api_key_delete", "api_key", id, key?.name ?? "");
    revalidatePath(API_PAGE);
  } catch {}
}

export async function upsertIntegrationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireApiAdmin();
    const id = field(data, "id", 40);
    const name = field(data, "name", 120);
    const baseUrl = field(data, "baseUrl", 500);
    const authType = field(data, "authType", 12) as "none" | "bearer" | "header";
    if (name.length < 3) return { error: "نام اتصال باید حداقل ۳ نویسه باشد." };
    if (!/^https?:\/\/.+/.test(baseUrl)) return { error: "نشانی پایه باید با http(s) شروع شود." };
    const token = field(data, "token", 300);
    const headersRaw = field(data, "headers", 600);
    let headers: Record<string, string> = {};
    if (headersRaw) {
      for (const line of headersRaw.split(/\r?\n/)) {
        const index = line.indexOf(":");
        if (index > 0) headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      }
    }
    const values = { name, baseUrl, authType, authHeaderName: field(data, "authHeaderName", 80) || "X-API-Key", headers, active: true };
    if (id) {
      await db.update(apiIntegrations).set({ ...values, ...(token ? { tokenCipher: await encryptSecret(token, API_TOKEN_PURPOSE) } : {}) }).where(eq(apiIntegrations.id, id));
    } else {
      await db.insert(apiIntegrations).values({ ...values, tokenCipher: token ? await encryptSecret(token, API_TOKEN_PURPOSE) : null, createdBy: user.id });
    }
    await audit(user.id, id ? "api_integration_update" : "api_integration_create", "api_integration", id || undefined, name);
    revalidatePath(API_PAGE);
    return { success: id ? `اتصال «${name}» به‌روزرسانی شد.` : `اتصال «${name}» ثبت شد.` };
  } catch { return { error: "ذخیرهٔ اتصال ممکن نشد." }; }
}

export async function testIntegrationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    const [integration] = await db.select().from(apiIntegrations).where(eq(apiIntegrations.id, id)).limit(1);
    if (!integration) return { error: "اتصال یافت نشد." };
    const result = await sendOutgoing(integration, { method: "GET", url: integration.baseUrl });
    await db.update(apiIntegrations).set({ lastStatus: result.ok ? "ok" : "fail", lastLatencyMs: result.duration, lastTestedAt: new Date() }).where(eq(apiIntegrations.id, id));
    revalidatePath(API_PAGE);
    return result.ok
      ? { success: `اتصال موفق — HTTP ${result.status} در ${result.duration} میلی‌ثانیه` }
      : { error: `اتصال ناموفق — ${result.status ? `HTTP ${result.status}` : "بدون پاسخ"}` };
  } catch { return { error: "تست اتصال ممکن نشد." }; }
}

export async function toggleIntegrationAction(data: FormData) {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    const [row] = await db.select({ active: apiIntegrations.active }).from(apiIntegrations).where(eq(apiIntegrations.id, id)).limit(1);
    if (row) await db.update(apiIntegrations).set({ active: !row.active }).where(eq(apiIntegrations.id, id));
    revalidatePath(API_PAGE);
  } catch {}
}

export async function deleteIntegrationAction(data: FormData) {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    await db.delete(apiIntegrations).where(eq(apiIntegrations.id, id));
    revalidatePath(API_PAGE);
  } catch {}
}

export async function upsertWebhookAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireApiAdmin();
    const id = field(data, "id", 40);
    const name = field(data, "name", 120);
    const eventKey = field(data, "eventKey", 60);
    const url = field(data, "url", 500);
    const secret = field(data, "secret", 200);
    const integrationId = field(data, "integrationId", 40);
    if (name.length < 3) return { error: "نام وب‌هوک باید حداقل ۳ نویسه باشد." };
    if (!webhookEventKeys.includes(eventKey)) return { error: "رویداد معتبر انتخاب کنید." };
    if (!/^https?:\/\/.+/.test(url)) return { error: "نشانی وب‌هوک باید با http(s) شروع شود." };
    const values = { name, eventKey, url, integrationId: integrationId || null, active: true };
    if (id) {
      await db.update(apiWebhooks).set({ ...values, ...(secret ? { secretCipher: await encryptSecret(secret, WEBHOOK_SECRET_PURPOSE) } : {}) }).where(eq(apiWebhooks.id, id));
    } else {
      await db.insert(apiWebhooks).values({ ...values, secretCipher: secret ? await encryptSecret(secret, WEBHOOK_SECRET_PURPOSE) : null, createdBy: user.id });
    }
    await audit(user.id, id ? "api_webhook_update" : "api_webhook_create", "api_webhook", id || undefined, `${name}:${eventKey}`);
    revalidatePath(API_PAGE);
    return { success: id ? `وب‌هوک «${name}» به‌روزرسانی شد.` : `وب‌هوک «${name}» ثبت شد.` };
  } catch { return { error: "ذخیرهٔ وب‌هوک ممکن نشد." }; }
}

export async function testWebhookAction(data: FormData): Promise<void> {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    const [webhook] = await db.select().from(apiWebhooks).where(eq(apiWebhooks.id, id)).limit(1);
    if (!webhook) return;
    await dispatchWebhookEvent(webhook.eventKey, { test: true, caseId: null, name: "درخواست آزمایشی از پنل مدیریت API" });
    revalidatePath(API_PAGE);
  } catch {}
}

export async function toggleWebhookAction(data: FormData) {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    const [row] = await db.select({ active: apiWebhooks.active }).from(apiWebhooks).where(eq(apiWebhooks.id, id)).limit(1);
    if (row) await db.update(apiWebhooks).set({ active: !row.active }).where(eq(apiWebhooks.id, id));
    revalidatePath(API_PAGE);
  } catch {}
}

export async function deleteWebhookAction(data: FormData) {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    await db.delete(apiWebhooks).where(eq(apiWebhooks.id, id));
    revalidatePath(API_PAGE);
  } catch {}
}

/** ارسال مجدد یک درخواست ناموفق خروجی (وب‌هوک یا اتصال) با همان بدنهٔ ثبت‌شده. */
export async function retryApiLogAction(data: FormData): Promise<void> {
  try {
    await requireApiAdmin();
    const id = field(data, "id", 40);
    const [log] = await db.select().from(apiRequestLogs).where(eq(apiRequestLogs.id, id)).limit(1);
    if (!log || log.direction !== "outgoing") return;
    let body: unknown = null;
    try { body = log.payload ? JSON.parse(log.payload) : null; } catch { body = null; }
    if (log.webhookId) {
      const [webhook] = await db.select().from(apiWebhooks).where(eq(apiWebhooks.id, log.webhookId)).limit(1);
      if (!webhook) return;
      await dispatchWebhookEvent(webhook.eventKey, (body as { data?: Record<string, unknown> })?.data ?? { retry: true });
      revalidatePath(API_PAGE);
    }
    if (log.integrationId) {
      const [integration] = await db.select().from(apiIntegrations).where(eq(apiIntegrations.id, log.integrationId)).limit(1);
      if (!integration) return;
      await sendOutgoing(integration, { method: log.method, url: log.path, body });
      revalidatePath(API_PAGE);
    }
  } catch {}
}

export async function saveApiSettingsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireApiAdmin();
    const settings = await ensureApiSettings();
    await db.update(apiSettings).set({
      incomingEnabled: data.get("incomingEnabled") === "on",
      defaultRateLimit: Math.min(600, Math.max(5, Number(data.get("defaultRateLimit") || 60) || 60)),
      ipAllowlist: field(data, "ipAllowlist", 300),
      updatedBy: user.id,
      updatedAt: new Date(),
    }).where(eq(apiSettings.id, settings.id));
    await audit(user.id, "api_settings_save", "api_settings", undefined, `incoming=${data.get("incomingEnabled") === "on"}`);
    revalidatePath(API_PAGE);
    return { success: "تنظیمات API ذخیره شد." };
  } catch { return { error: "ذخیرهٔ تنظیمات ممکن نشد." }; }
}
