"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/workflow-utils";
export async function markNotificationReadAction(data: FormData) {
  const user = await requireUser(); const id = String(data.get("notificationId") || "");
  if (!isUuid(id)) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications"); revalidatePath("/dashboard");
}
export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications"); revalidatePath("/dashboard");
}
