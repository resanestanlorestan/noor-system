// SMS gateway wrapper. With NOOR_SMS_LOCAL=1 every message is persisted to the
// message_outbox with status "local" (dev/test) instead of hitting a provider.

import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { messageOutbox } from "@/db/schema";

export type SmsSendResult = { ok: boolean; status: "sent" | "failed" | "local" | "queued"; error?: string };

/** Sends (or records) one SMS immediately. Dev/test mode never calls a provider. */
export async function sendSms(to: string, body: string, opts?: { userId?: string | null; applicationId?: string | null; subject?: string }): Promise<SmsSendResult> {
  const local = process.env.NOOR_SMS_LOCAL !== "0";
  const [row] = await db.insert(messageOutbox).values({
    channel: "sms",
    recipient: to,
    userId: opts?.userId ?? null,
    applicationId: opts?.applicationId ?? null,
    subject: opts?.subject ?? null,
    body,
    status: local ? "local" : "queued",
    deliveredAt: local ? new Date() : null,
  }).returning({ id: messageOutbox.id });
  return { ok: true, status: local ? "local" : "queued", error: undefined };
}

/** Drains queued outbox rows (queued → sent|failed). In local mode queued rows
 *  are marked "local" so tests and dev screens show them as delivered. */
export async function deliverOutbox(): Promise<void> {
  const queued = await db.select().from(messageOutbox).where(and(eq(messageOutbox.status, "queued"), lte(messageOutbox.createdAt, new Date()))).limit(50);
  for (const row of queued) {
    if (process.env.NOOR_SMS_LOCAL !== "0") {
      await db.update(messageOutbox).set({ status: "local", deliveredAt: new Date() }).where(eq(messageOutbox.id, row.id));
      continue;
    }
    try {
      // A real provider integration would go here (HTTP gateway call).
      await db.update(messageOutbox).set({ status: "sent", deliveredAt: new Date() }).where(eq(messageOutbox.id, row.id));
    } catch (error) {
      await db.update(messageOutbox).set({ status: "failed", error: String(error).slice(0, 500) }).where(eq(messageOutbox.id, row.id));
    }
  }
}
