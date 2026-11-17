import { readFileSync } from "node:fs";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// نسخهٔ استقرارشده از package.json — برای شناسایی نسخهٔ تولید بدون بازکردن زیپ
let version = "unknown";
try {
  version = JSON.parse(readFileSync("package.json", "utf8")).version ?? "unknown";
} catch {
  // اگر package.json در دسترس نبود، health همچنان کار می‌کند
}

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, version });
  } catch {
    return Response.json({ ok: false, version }, { status: 500 });
  }
}
