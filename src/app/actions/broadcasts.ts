"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { parseBroadcastFilters, parseBroadcastMessage, sendBroadcast, filterParams } from "@/lib/broadcasts";

/** Builds a /broadcasts redirect URL carrying the banner/error parameters. */
function backUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `/broadcasts?${query}` : "/broadcasts";
}

export async function sendBroadcastAction(data: FormData) {
  const actor = await requireUser();
  if (!(await can(actor, "messages.broadcast"))) redirect("/dashboard");

  const input = {
    provinceId: String(data.get("provinceId") || ""),
    countyId: String(data.get("countyId") || ""),
    specialtyId: String(data.get("specialtyId") || ""),
    status: String(data.get("status") || ""),
    onlyWithPhone: data.get("onlyWithPhone") === "1" ? "1" : "",
    subject: String(data.get("subject") || ""),
    body: String(data.get("body") || ""),
  };
  const { filters, error: filterError } = parseBroadcastFilters(input);
  const { subject, body, error: messageError } = parseBroadcastMessage(input);
  const error = filterError ?? messageError;
  if (error) redirect(backUrl({ ...filterParams(filters), error }));

  const { summary, error: sendError } = await sendBroadcast(actor, { subject, body }, filters);
  if (!summary) redirect(backUrl({ ...filterParams(filters), error: sendError || "ارسال انجام نشد." }));

  revalidatePath("/broadcasts");
  revalidatePath("/notifications");
  redirect(backUrl({
    ...filterParams(filters),
    sent: String(summary.recipients),
    sms: String(summary.sms),
    local: String(summary.localSms),
    notified: String(summary.notifications),
  }));
}
