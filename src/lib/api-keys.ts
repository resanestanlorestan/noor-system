// الحاقیهٔ ۲.۱۵.۰ — مدیریت API و اتصال به سامانه‌های خارجی
//
// لایهٔ امنیت API ورودی: تولید و نگهداری امن کلیدها (هش برای احراز +
// رمزنگاری برای نمایش مجدد توسط مدیر)، گارد کامل هر درخواست (کلید سراسری،
// فهرست مجاز IP، فعال‌بودن کلید، سطح دسترسی و محدودیت نرخ) و ثبت تاریخچهٔ
// هر درخواست در api_request_logs برای مانیتورینگ و ارسال مجدد.
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, apiRequestLogs, apiSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/local-secrets";

export const API_KEY_PREFIX = "nk_live_";
export const API_KEY_PURPOSE = "api-key-encryption-v1";
export const API_TOKEN_PURPOSE = "api-token-encryption-v1";
export const WEBHOOK_SECRET_PURPOSE = "webhook-secret-encryption-v1";

export type ApiScope = "cases:read" | "cases:write";
export const apiScopeLabels: Record<ApiScope, string> = {
  "cases:read": "خواندن پرونده‌ها",
  "cases:write": "ایجاد و ویرایش پرونده‌ها",
};

export function hashApiKey(key: string) { return createHash("sha256").update(key).digest("hex"); }

/** تولید کلید تازه: مقدار کامل فقط یک‌بار نمایش داده می‌شود؛ هش و نسخهٔ رمزنگاری‌شده ذخیره می‌شود. */
export async function createApiKeySecret() {
  const key = API_KEY_PREFIX + randomBytes(24).toString("hex");
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 4), hash: hashApiKey(key), cipher: await encryptSecret(key, API_KEY_PURPOSE) };
}

export async function revealApiKey(cipher: string | null) { return cipher ? decryptSecret(cipher, API_KEY_PURPOSE) : null; }

/** ردیف تنظیمات سراسری را در صورت نبود می‌سازد و برمی‌گرداند. */
export async function ensureApiSettings() {
  const [row] = await db.select().from(apiSettings).where(eq(apiSettings.id, "global")).limit(1);
  if (row) return row;
  await db.insert(apiSettings).values({ id: "global" }).onConflictDoNothing();
  const [created] = await db.select().from(apiSettings).where(eq(apiSettings.id, "global")).limit(1);
  return created!;
}

// محدودیت نرخ درون‌حافظه‌ای (دریچهٔ یک‌دقیقه‌ای به‌ازای هر کلید)؛ برای استقرار
// تک‌نمونهٔ فعلی کافی است و در نبود محدودیتِ اختصاصی، مقدار پیش‌فرض سراسری اعمال می‌شود.
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function rateLimit(keyId: string, limit: number) {
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const bucket = rateBuckets.get(keyId);
  if (!bucket || bucket.windowStart !== windowStart) { rateBuckets.set(keyId, { windowStart, count: 1 }); return true; }
  bucket.count += 1;
  return bucket.count <= limit;
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
}

export type IncomingGuard = { ok: true; key: typeof apiKeys.$inferSelect } | { ok: false; response: Response };

function apiJson(status: number, error: string) { return Response.json({ ok: false, error }, { status }); }

/** گارد کامل درخواست ورودی: کلید سراسری، فهرست مجاز IP، کلید فعال، سطح دسترسی و نرخ. */
export async function guardIncomingApi(request: Request, scope: ApiScope): Promise<IncomingGuard> {
  const settings = await ensureApiSettings();
  if (!settings.incomingEnabled) return { ok: false, response: apiJson(503, "سرویس API ورودی موقتاً غیرفعال است.") };
  const allow = settings.ipAllowlist.split(",").map((item) => item.trim()).filter(Boolean);
  if (allow.length && !allow.includes(clientIp(request))) return { ok: false, response: apiJson(403, "نشانی IP فراخوان در فهرست مجاز نیست.") };
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : (request.headers.get("x-api-key") || "").trim();
  if (!token) return { ok: false, response: apiJson(401, "کلید API ارسال نشده است؛ هدر Authorization: Bearer <کلید> لازم است.") };
  const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hashApiKey(token)), eq(apiKeys.active, true))).limit(1);
  if (!key) return { ok: false, response: apiJson(401, "کلید API نامعتبر یا غیرفعال است.") };
  if (!(key.scopes ?? []).includes(scope)) return { ok: false, response: apiJson(403, `این کلید دسترسی «${apiScopeLabels[scope]}» ندارد.`) };
  if (!rateLimit(key.id, key.rateLimit || settings.defaultRateLimit)) return { ok: false, response: apiJson(429, "تعداد درخواست‌ها از محدودیت نرخ کلید فراتر رفت؛ کمی بعد تلاش کنید.") };
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { ok: true, key };
}

/** ثبت یک ردیف تاریخچهٔ درخواست (ورودی یا خروجی) با بریده‌شدن متن‌های بلند. */
export async function logApiRequest(entry: {
  direction: "incoming" | "outgoing"; method: string; path: string;
  apiKeyId?: string | null; integrationId?: string | null; webhookId?: string | null;
  statusCode?: number | null; ok?: boolean; durationMs?: number;
  payload?: string | null; responseSnippet?: string | null; error?: string | null;
}) {
  await db.insert(apiRequestLogs).values({
    direction: entry.direction, method: entry.method, path: entry.path.slice(0, 300),
    apiKeyId: entry.apiKeyId ?? null, integrationId: entry.integrationId ?? null, webhookId: entry.webhookId ?? null,
    statusCode: entry.statusCode ?? null, ok: entry.ok ?? true, durationMs: Math.round(entry.durationMs ?? 0),
    payload: entry.payload ? entry.payload.slice(0, 4000) : null,
    responseSnippet: entry.responseSnippet ? entry.responseSnippet.slice(0, 400) : null,
    error: entry.error ? entry.error.slice(0, 400) : null,
  });
}

export function apiError(status: number, error: string) { return Response.json({ ok: false, error }, { status }); }
