// Automated pre-event SMS reminder sweep for external cron jobs
// (cPanel "Cron Jobs" → curl). Protected by CRON_SECRET via the
// Authorization: Bearer header or ?key= query parameter — the same secret that
// guards /api/cron/reminders. With no secret configured the endpoint is
// disabled (404) so deployments that never set it expose nothing.
//
//   curl -fsS "https://DOMAIN/api/cron/events?key=$CRON_SECRET"
//   → {"ok":true,"considered":12,"sent":9,"withSms":7,...}
import { createHash, timingSafeEqual } from "node:crypto";
import { runAutomatedEventReminders } from "@/lib/events";

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
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: "events cron is not configured" }, { status: 404 });
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  const key = url.searchParams.get("key");
  if (!secretOk(bearer ?? key)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const summary = await runAutomatedEventReminders();
  return Response.json({ ok: true, ...summary });
}

export { GET };
