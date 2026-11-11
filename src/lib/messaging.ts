// In-app notifications + SMS outbox fan-out used by workflow actions.

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { messageOutbox, notifications, users } from "@/db/schema";
import { deliverOutbox } from "@/lib/sms";

// A transaction from db.transaction or the plain db handle.
type DbLike = Pick<typeof db, "insert" | "select" | "update" | "delete">;

/** Creates in-app notification rows for the given recipients. */
export async function notifyUsers(client: DbLike, recipientIds: (string | null | undefined)[], title: string, body: string, applicationId?: string | null): Promise<void> {
  const unique = [...new Set(recipientIds.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return;
  await client.insert(notifications).values(
    unique.map((userId) => ({ userId, applicationId: applicationId ?? null, title: title.slice(0, 140), body: body.slice(0, 2000) })),
  );
}

/** Queues SMS rows for every recipient with a mobile number on file. */
export async function notifyBySms(client: DbLike, recipientIds: (string | null | undefined)[], body: string, applicationId?: string | null): Promise<number> {
  const unique = [...new Set(recipientIds.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return 0;
  const rows = await client.select({ id: users.id, phone: users.phone }).from(users).where(inArray(users.id, unique));
  const withPhone = rows.filter((r) => Boolean(r.phone));
  if (!withPhone.length) return 0;
  const local = process.env.NOOR_SMS_LOCAL !== "0";
  await client.insert(messageOutbox).values(
    withPhone.map((r) => ({
      channel: "sms" as const, recipient: r.phone as string, userId: r.id,
      applicationId: applicationId ?? null, subject: null, body,
      status: local ? ("local" as const) : ("queued" as const),
      deliveredAt: local ? new Date() : null,
    })),
  );
  return withPhone.length;
}

export { deliverOutbox };
