// الحاقیهٔ ۲.۱۰.۳ — پیام فلش یک‌بارمصرف به‌جای پیام درازِ URL-encoded در
// query string. پیام در حافظهٔ همین نمونهٔ سرور با توکن تصادفی ۱۶ نویسه‌ای
// ذخیره می‌شود و ریدایرکت فقط «?m=توکن» می‌گیرد؛ صفحهٔ مقصد با popFlash
// پیام را یک‌بار مصرف می‌کند و FlashNotice هم توکن را از نوار آدرس پاک
// می‌کند. فرض استقرار: تک‌نمونه‌ای بودن سرور (پیام‌ها گذرایند و با
// ری‌استارت از بین رفتنشان بی‌ضرر است). توکن منحصربه‌فرد است، بنابراین
// peekFlash در آزمون‌ها بدون تداخل بین اکشن‌ها کار می‌کند.
import { randomBytes } from "node:crypto";

const TTL_MS = 90_000;
const MAX_ENTRIES = 500;
const store = new Map<string, { message: string; expiresAt: number }>();

export function stashFlash(message: string): string {
  const now = Date.now();
  for (const [key, hit] of store) if (hit.expiresAt <= now) store.delete(key);
  while (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  const token = randomBytes(8).toString("hex");
  store.set(token, { message: message.slice(0, 600), expiresAt: now + TTL_MS });
  return token;
}

function lookup(token: string | null | undefined) {
  if (!token) return null;
  const hit = store.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) { store.delete(token); return null; }
  return hit;
}

/** خواندن بدون مصرف — برای بررسی پیام در آزمون‌ها. */
export function peekFlash(token: string | null | undefined): string | null {
  return lookup(token)?.message ?? null;
}

/** خواندن با مصرف — صفحهٔ مقصد پیام را فقط یک‌بار نشان می‌دهد. */
export function popFlash(token: string | null | undefined): string | null {
  if (!token) return null;
  const hit = lookup(token);
  if (hit) store.delete(token);
  return hit?.message ?? null;
}

export const FLASH_PARAM = "m";
