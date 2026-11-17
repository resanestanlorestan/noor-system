// Automated daily overdue-case reminder sweep for external cron jobs
// (cPanel "Cron Jobs" → curl). Protected by CRON_SECRET via the
// Authorization: Bearer header. With no secret configured the endpoint is
// disabled (404) so deployments that never set it expose nothing.
// الحاقیهٔ ۲.۱۸.۰ — پذیرش ?key= حذف شد: رمز در نشانی URL در لاگ‌های وب‌سرور
// و پروکسی باقی می‌ماند (ممیزی امنیتی ۲.۱۷.۱ مورد P1).
//
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://DOMAIN/api/cron/reminders"
//   → {"ok":true,"considered":12,"sent":9,"withSms":7,...}
import { createHash, timingSafeEqual } from "node:crypto";
import { runAutomatedReminders, parseThreshold } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function secretOk(provided: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !provided) return false;
  // Constant-time comparison over digests to avoid leaking the secret.
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: "reminders cron is not configured" }, { status: 404 });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  if (!secretOk(bearer)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const days = parseThreshold(url.searchParams.get("days"));
  const summary = await runAutomatedReminders(days);
  return Response.json({ ok: true, thresholdDays: days, ...summary });
}

export { GET };
