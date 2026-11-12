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
    await audit(user.id, "download_document", "document", document.id);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": document.mimeType, "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
