// الحاقیهٔ ۲.۱۸.۵ — سرو عمومی لوگوی سایت از دیتابیس؛ URL با ?v= نسخه‌دار می‌شود
// تا کش مرورگر با هر تغییر باطل شود. مسیر عمومی است (لوگو محتوای عمومی است) و
// برای SVG هدرهای سخت‌گیرانه امنیتی می‌گذارد تا هیچ اسکریپتی اجرا نشود.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function GET(_request: Request) {
  try {
    const [row] = await db.select({
      data: siteSettings.logoData,
      mime: siteSettings.logoMime,
      updatedAt: siteSettings.logoUpdatedAt,
    }).from(siteSettings).limit(1);
    if (!row?.data || !row.mime || !(row.data instanceof Buffer) || row.data.length === 0) {
      return new Response("Not found", { status: 404 });
    }
    const ext = EXT[row.mime] ?? "png";
    const headers: Record<string, string> = {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="logo.${ext}"`,
    };
    if (row.mime === "image/svg+xml") {
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    return new Response(new Uint8Array(row.data), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
