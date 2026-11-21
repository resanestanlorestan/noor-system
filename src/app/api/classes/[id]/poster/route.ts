// الحاقیهٔ ۲.۱۹.۰ — سرو پوستر کلاس از دیتابیس؛ فقط برای کاربران واردشده
// (پوستر حاوی اطلاعات برنامه است و عمومی منتشر نمی‌شود).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
  const [row] = await db.select({ data: classes.posterData, mime: classes.posterMime, updatedAt: classes.updatedAt })
    .from(classes).where(eq(classes.id, id)).limit(1);
  if (!row?.data) return new Response("not found", { status: 404 });
  const mime = row.mime && row.mime.startsWith("image/") ? row.mime : "image/png";
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": mime,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
