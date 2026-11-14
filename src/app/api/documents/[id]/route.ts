import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { audit, getCurrentUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { privateDir } from "@/lib/local-secrets";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [document] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!document || !await getCaseForUser(user, document.applicationId) || !/^[0-9a-f-]{36}$/i.test(document.storageKey)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(privateDir, "uploads", document.storageKey));
    // الحاقیهٔ ۲.۹.۳: تصویر پرسنلی برای نمایش در پروفایل، پرونده و نوار بالا به‌صورت inline
    // و با کش کوتاه سرو می‌شود و بارشدن هر صفحه برایش رویداد «download_document» ثبت نمی‌کند؛
    // بارگذاری و حذف تصویر خودشان رویداد ممیزی مخصوص دارند. مدارک مانند قبل attachment می‌مانند.
    const inline = document.kind === "id_photo";
    if (!inline) await audit(user.id, "download_document", "document", document.id);
    const disposition = inline
      ? `inline; filename="photo"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`
      : `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`;
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": document.mimeType, "Content-Disposition": disposition, "Cache-Control": inline ? "private, max-age=300" : "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
