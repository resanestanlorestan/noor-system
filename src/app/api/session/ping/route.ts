// الحاقیهٔ ۲.۱۸.۷ — نبض نشست برای تمدید بی‌فعالیتی از سوی دکمهٔ «ادامه فعالیت»
// در هشدار خروج خودکار. اعتبارسنجی کامل سمت سرور در pingSession انجام می‌شود:
// اگر نشست از سقف بی‌فعالیتی گذشته باشد همان‌جا باطل و پاسخ 401 برمی‌گردد.
import { pingSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const result = await pingSession();
  return Response.json(result, { status: result.ok ? 200 : 401 });
}
