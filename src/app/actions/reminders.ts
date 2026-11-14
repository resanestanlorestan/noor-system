"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/workflow-utils";
import { parseThreshold, sendReminders } from "@/lib/reminders";

export async function sendRemindersAction(data: FormData) {
  const actor = await requireUser();
  if (!(await can(actor, "reminders.send"))) redirect("/dashboard");
  const days = parseThreshold(String(data.get("days") || ""));
  const caseIds = data.getAll("caseIds").map((value) => String(value)).filter(isUuid);
  const summary = await sendReminders(actor, { thresholdDays: days, caseIds: caseIds.length ? caseIds : undefined });
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  redirect(`/reminders?days=${days}&sent=${summary.sent}&sms=${summary.withSms}&local=${summary.localSms}&skipped=${summary.cooldownSkipped}`);
}
