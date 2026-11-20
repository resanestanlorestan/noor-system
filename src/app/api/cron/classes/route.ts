// Automated class sweeps for external cron jobs (cPanel "Cron Jobs" → curl):
// waitlist invitation expiry + pre-class reminders + outbox delivery.
// Protected by CRON_SECRET via Authorization: Bearer — the same secret that
// guards /api/cron/reminders and /api/cron/events. With no secret configured
// the endpoint is disabled (404).
//
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://DOMAIN/api/cron/classes"
//   → {"ok":true,"expired":{...},"reminders":{...}}
import { createHash, timingSafeEqual } from "node:crypto";
import { runAutomatedClassSweeps } from "@/lib/classes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretOk(provided: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !provided) return false;
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

async function GET(request: Request) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretOk(provided)) return new Response("not found", { status: 404 });
  const result = await runAutomatedClassSweeps();
  return Response.json({ ok: true, ...result });
}

export { GET };
