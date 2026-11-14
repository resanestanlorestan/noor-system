"use server";

// (مرحله پنجم) Profile section actions: work history + courses/trainings.
// (مرحله سوم) Education-row removal. Logic lives in src/lib/profile-rows.ts
// so it stays unit-testable without a request context.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, educationRecords } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { editableActivistFor, caseEditableFor } from "@/lib/profile-rows";
import { addWorkHistoryCore, removeWorkHistoryCore, addCourseCore, removeCourseCore } from "@/lib/profile-rows";
import { can } from "@/lib/permissions";
import { normalizeText } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);

const refresh = (data: FormData, activistId: string) => {
  revalidatePath(`/cases/${field(data, "caseId", 40) || activistId}`);
  revalidatePath("/dashboard");
};

/* --------------------------- work history (stage 5) ------------------------ */

export async function addWorkHistoryAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await addWorkHistoryCore(user, data);
  if (result.success) refresh(data, field(data, "activistId", 40));
  return result;
}

export async function removeWorkHistoryAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await removeWorkHistoryCore(user, data);
  if (result.success) refresh(data, field(data, "activistId", 40));
  return result;
}

/* --------------------------- courses / trainings --------------------------- */

export async function addCourseAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await addCourseCore(user, data);
  if (result.success) refresh(data, field(data, "activistId", 40));
  return result;
}

export async function removeCourseAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await removeCourseCore(user, data);
  if (result.success) refresh(data, field(data, "activistId", 40));
  return result;
}

/* ------------------------- education rows (stage 3) ------------------------ */

export async function removeEducationRowAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rowId = field(data, "rowId", 40);
  const activistId = field(data, "activistId", 40);
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return { error: "شناسه ردیف تحصیلی معتبر نیست." };
  if (!(await can(user, "cases.edit"))) return { error: "اجازه حذف اطلاعات تحصیلی را ندارید." };
  const activist = await editableActivistFor(user, activistId);
  if (!activist) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (!(await caseEditableFor(user, activistId))) return { error: "در وضعیت فعلی پرونده، حذف اطلاعات تحصیلی مجاز نیست." };
  const deleted = await db.delete(educationRecords).where(and(eq(educationRecords.id, rowId), eq(educationRecords.activistId, activistId))).returning({ id: educationRecords.id });
  if (!deleted.length) return { error: "ردیف تحصیلی موردنظر یافت نشد." };
  await db.insert(auditLogs).values({ actorId: user.id, action: "remove_education_row", targetType: "activist", targetId: activistId });
  refresh(data, activistId);
  return { success: "ردیف اطلاعات تحصیلی حذف شد." };
}
