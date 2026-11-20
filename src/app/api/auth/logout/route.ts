// الحاقیهٔ ۲.۱۸.۷ — خروج کنترل‌شده از سوی کلاینت: هم دکمهٔ «خروج از حساب» در
// هشدار و هم خروج خودکار پس از پایان سقف بی‌فعالیتی (؟reason=idle) از این مسیر
// می‌گذرند؛ نشست سمت سرور حذف، کوکی امن پاک و کنش با ممیزی ثبت می‌شود.
import { idleLogout } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason") === "idle" ? "idle" : "manual";
  const result = await idleLogout(reason);
  return Response.json(result);
}
