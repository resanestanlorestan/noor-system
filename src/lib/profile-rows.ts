// (مرحله پنجم) Testable cores for the profile section actions: work history +
// courses/trainings. Actions in src/app/actions/profile.ts are thin wrappers.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activists, applications, auditLogs, educationalCourses, workHistory } from "@/db/schema";
import { jalaliToIso, normalizeDigits, normalizeText } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-state";

const fieldOf = (data: FormData, key: string, max = 200) => normalizeText(String(data.get(key) || "")).slice(0, max);

export const EDITABLE_CASE_STATUSES = ["draft", "completing", "needs_correction"] as const;

/** Resolves the activist row this user may edit (own row or scoped manager). */
export async function editableActivistFor(user: SessionUser, activistId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(activistId)) return null;
  const [row] = await db.select().from(activists).where(and(eq(activists.id, activistId), scopeCondition(user))).limit(1);
  return row ?? null;
}

/** Parent case must be in an editable status (profile-only activists pass). */
export async function caseEditableFor(user: SessionUser, activistId: string): Promise<boolean> {
  const [application] = await db.select().from(applications).where(eq(applications.activistId, activistId)).limit(1);
  if (!application) return true;
  if (!(EDITABLE_CASE_STATUSES as readonly string[]).includes(application.status)) return false;
  if (user.effectiveRole !== "activist") return true;
  return application.createdBy === user.id;
}

export function parseWorkRow(data: FormData) {
  const title = fieldOf(data, "title", 180);
  const employer = fieldOf(data, "employer", 180) || null;
  const position = fieldOf(data, "position", 120) || null;
  const description = fieldOf(data, "description", 2000) || null;
  const startRaw = fieldOf(data, "startDate", 20);
  const endRaw = fieldOf(data, "endDate", 20);
  const startDate = startRaw ? jalaliToIso(startRaw) : null;
  const endDate = endRaw ? jalaliToIso(endRaw) : null;
  return { title, employer, position, startDate, endDate, description };
}

export async function addWorkHistoryCore(user: SessionUser, data: FormData): Promise<ActionState> {
  if (!(await can(user, "cases.edit"))) return { error: "اجازه ویرایش سوابق کاری را ندارید." };
  const activistId = fieldOf(data, "activistId", 40);
  const activist = await editableActivistFor(user, activistId);
  if (!activist) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (!(await caseEditableFor(user, activistId))) return { error: "در وضعیت فعلی پرونده، ویرایش سوابق کاری مجاز نیست." };

  const row = parseWorkRow(data);
  if (row.title.length < 3) return { error: "عنوان سابقه کاری را وارد کنید (حداقل ۳ نویسه)." };
  if (startHasText(data) && !row.startDate) return { error: "تاریخ شروع شمسی معتبر نیست؛ مانند ۱۳۹۵/۰۴/۰۱ وارد کنید." };
  if (endHasText(data) && !row.endDate) return { error: "تاریخ پایان شمسی معتبر نیست؛ مانند ۱۳۹۸/۰۶/۳۱ وارد کنید." };
  if (row.startDate && row.endDate && row.startDate > row.endDate) return { error: "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد." };

  await db.insert(workHistory).values({ ...row, activistId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_work_history", targetType: "activist", targetId: activistId });
  return { success: "سابقه کاری ثبت شد." };
}

const startHasText = (data: FormData) => String(data.get("startDate") || "").trim().length > 0;
const endHasText = (data: FormData) => String(data.get("endDate") || "").trim().length > 0;

export async function removeWorkHistoryCore(user: SessionUser, data: FormData): Promise<ActionState> {
  if (!(await can(user, "cases.edit"))) return { error: "اجازه حذف سوابق کاری را ندارید." };
  const rowId = fieldOf(data, "rowId", 40);
  const activistId = fieldOf(data, "activistId", 40);
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return { error: "شناسه سابقه کاری معتبر نیست." };
  const activist = await editableActivistFor(user, activistId);
  if (!activist) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (!(await caseEditableFor(user, activistId))) return { error: "در وضعیت فعلی پرونده، حذف سوابق کاری مجاز نیست." };
  const deleted = await db.delete(workHistory).where(and(eq(workHistory.id, rowId), eq(workHistory.activistId, activistId))).returning({ id: workHistory.id });
  if (!deleted.length) return { error: "سابقه کاری موردنظر یافت نشد." };
  await db.insert(auditLogs).values({ actorId: user.id, action: "remove_work_history", targetType: "activist", targetId: activistId });
  return { success: "سابقه کاری حذف شد." };
}

export function parseCourseRow(data: FormData) {
  const title = fieldOf(data, "title", 180);
  const provider = fieldOf(data, "provider", 180) || null;
  const completedRaw = fieldOf(data, "completedDate", 20);
  const hoursRaw = normalizeDigits(fieldOf(data, "hours", 6));
  const hours = /^\d{1,4}$/.test(hoursRaw) ? Number(hoursRaw) : null;
  return { title, provider, completedDate: completedRaw ? jalaliToIso(completedRaw) : null, hours };
}

export async function addCourseCore(user: SessionUser, data: FormData): Promise<ActionState> {
  if (!(await can(user, "cases.edit"))) return { error: "اجازه ثبت دوره را ندارید." };
  const activistId = fieldOf(data, "activistId", 40);
  const activist = await editableActivistFor(user, activistId);
  if (!activist) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (!(await caseEditableFor(user, activistId))) return { error: "در وضعیت فعلی پرونده، ثبت دوره مجاز نیست." };

  const row = parseCourseRow(data);
  if (row.title.length < 3) return { error: "عنوان دوره را وارد کنید (حداقل ۳ نویسه)." };
  if (completedHasText(data) && !row.completedDate) return { error: "تاریخ تکمیل شمسی معتبر نیست؛ مانند ۱۴۰۳/۰۷/۱۵ وارد کنید." };
  if (row.hours !== null && (row.hours < 1 || row.hours > 2000)) return { error: "تعداد ساعت دوره باید بین ۱ تا ۲۰۰۰ باشد." };

  await db.insert(educationalCourses).values({ ...row, activistId, createdBy: user.id });
  await db.insert(auditLogs).values({ actorId: user.id, action: "add_course", targetType: "activist", targetId: activistId });
  return { success: "دوره آموزشی ثبت شد." };
}

const completedHasText = (data: FormData) => String(data.get("completedDate") || "").trim().length > 0;

export async function removeCourseCore(user: SessionUser, data: FormData): Promise<ActionState> {
  if (!(await can(user, "cases.edit"))) return { error: "اجازه حذف دوره را ندارید." };
  const rowId = fieldOf(data, "rowId", 40);
  const activistId = fieldOf(data, "activistId", 40);
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return { error: "شناسه دوره معتبر نیست." };
  const activist = await editableActivistFor(user, activistId);
  if (!activist) return { error: "پرونده پیدا نشد یا مجوز دسترسی ندارید." };
  if (!(await caseEditableFor(user, activistId))) return { error: "در وضعیت فعلی پرونده، حذف دوره مجاز نیست." };
  const deleted = await db.delete(educationalCourses).where(and(eq(educationalCourses.id, rowId), eq(educationalCourses.activistId, activistId))).returning({ id: educationalCourses.id });
  if (!deleted.length) return { error: "دوره موردنظر یافت نشد." };
  await db.insert(auditLogs).values({ actorId: user.id, action: "remove_course", targetType: "activist", targetId: activistId });
  return { success: "دوره آموزشی حذف شد." };
}
