// الحاقیهٔ ۲.۱۸.۵ — مدیریت لوگوی سایت
// بایت‌های فایل لوگو در جدول site_settings (bytea) ذخیره می‌شود و با مسیر عمومی
// /api/site/logo سرو می‌شود؛ URL نمایش از روی updatedAt ساخته می‌شود تا کش
// مرورگر با هر تغییر باطل شود. تا پیش از نخستین آپلود همه‌جا آیکن پیش‌فرض است.
// اعتبارسنجی فایل pure-JS است (بدون وابستگی native): امضای بایت + ابعاد واقعی
// برای PNG/JPEG/WEBP و گاردهای متنی امنیتی برای SVG.
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const MAX_LOGO_BYTES = 1024 * 1024; // سقف ۱ مگابایت — لوگو لازم نیست بزرگ‌تر باشد
export const LOGO_MAX_DIMENSION = 4096;
export const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];

export type SniffedLogo = { mime: LogoMime; width: number | null; height: number | null };

const u16le = (b: Buffer, i: number) => b.readUInt16LE(i);
const u24le = (b: Buffer, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function sniffPng(b: Buffer): SniffedLogo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((byte, i) => b[i] === byte)) return null;
  // تکهٔ اول باید IHDR با طول ۱۳ باشد؛ جعلِ امضا با بدنهٔ نامربوط رد می‌شود
  if (b.readUInt32BE(8) !== 13 || b.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  if (width < 1 || height < 1 || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) return null;
  return { mime: "image/png", width, height };
}

function sniffJpeg(b: Buffer): SniffedLogo | null {
  if (b.length < 12 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let pos = 2;
  while (pos + 9 <= b.length) {
    if (b[pos] !== 0xff) return null;
    const marker = b[pos + 1];
    if (sof.has(marker)) {
      const height = b.readUInt16BE(pos + 5);
      const width = b.readUInt16BE(pos + 7);
      if (width < 1 || height < 1 || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) return null;
      return { mime: "image/jpeg", width, height };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { pos += 2; continue; }
    const len = b.readUInt16BE(pos + 2);
    if (len < 2) return null;
    pos += 2 + len;
  }
  return null;
}

function sniffWebp(b: Buffer): SniffedLogo | null {
  if (b.length < 32 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const fourcc = b.toString("latin1", 12, 16);
  if (fourcc === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    if (width < 1 || height < 1 || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) return null;
    return { mime: "image/webp", width, height };
  }
  if (fourcc === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const width = ((b[21] & 0x3f) << 8 | b[20]) + 1;
    const height = ((b[23] & 0x0f) << 10 | b[22] << 2 | (b[21] >> 6)) + 1;
    if (width < 1 || height < 1 || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) return null;
    return { mime: "image/webp", width, height };
  }
  if (fourcc === "VP8X") {
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    if (width < 1 || height < 1 || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) return null;
    return { mime: "image/webp", width, height };
  }
  return null;
}

const SVG_FORBIDDEN = ["<script", "javascript:", "onload=", "onerror=", "onclick=", "onmouseover=", "<!entity", "<foreignobject", "data:text/html", "data:image/svg+xml;base64"];

function sniffSvg(b: Buffer): SniffedLogo | null {
  const head = b.subarray(0, Math.min(b.length, 8192)).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (!head.startsWith("<?xml") && !head.startsWith("<svg")) return null;
  if (!head.includes("<svg")) return null;
  if (SVG_FORBIDDEN.some((needle) => head.includes(needle))) return null;
  return { mime: "image/svg+xml", width: null, height: null };
}

/** تشخیص فرمت و ابعاد واقعی فایل از روی بایت‌ها (نه پسوند/فرادادهٔ کلاینت)؛
 * فرمت ناشناخته یا جعل‌شده null برمی‌گرداند و باید رد شود. */
export function sniffLogoImage(bytes: Buffer): SniffedLogo | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes) ?? sniffSvg(bytes);
}

export type SiteSettings = {
  logoUrl: string | null;
  logoMime: string | null;
  logoName: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  logoSize: number | null;
  logoUpdatedAt: string | null;
};

const EMPTY_SETTINGS: SiteSettings = { logoUrl: null, logoMime: null, logoName: null, logoWidth: null, logoHeight: null, logoSize: null, logoUpdatedAt: null };

/** خواندنِ یک‌بار در هر درخواست؛ بایت‌های فایل اینجا واکشی نمی‌شوند (فقط
 * متادیتا) تا رندر صفحات سبک بماند — سروِ بایت‌ها فقط در مسیر /api/site/logo. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const [row] = await db.select({
      hasLogo: sql<boolean>`(${siteSettings.logoData} is not null)`,
      mime: siteSettings.logoMime,
      name: siteSettings.logoName,
      width: siteSettings.logoWidth,
      height: siteSettings.logoHeight,
      size: siteSettings.logoSize,
      updatedAt: siteSettings.logoUpdatedAt,
    }).from(siteSettings).limit(1);
    if (!row || !row.hasLogo || !row.mime) return EMPTY_SETTINGS;
    const v = row.updatedAt ? Math.floor(row.updatedAt.getTime() / 1000) : 0;
    return {
      logoUrl: `/api/site/logo?v=${v}`,
      logoMime: row.mime,
      logoName: row.name,
      logoWidth: row.width,
      logoHeight: row.height,
      logoSize: row.size,
      logoUpdatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  } catch {
    // پیش از اجرای مایگریشن یا در خطای گذرا: آیکن پیش‌فرض
    return EMPTY_SETTINGS;
  }
});
