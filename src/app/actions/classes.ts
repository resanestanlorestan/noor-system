"use server";
// الحاقیهٔ ۲.۱۹.۰ — اکشن‌های مدیریت کلاس‌ها و دوره‌های آموزشی: تعریف/ویرایش با
// گروه هدف و شهرستان‌ها و جلسات، فعال‌سازی با ارسال خودکار دعوت واجد شرایطان،
// ثبت‌نام/انصراف/لیست انتظار کاربران، تأیید/رد ادمین، حضور و غیاب، اطلاع‌رسانی
// تغییر/لغو و ارسال مجدد پیامک. همهٔ کنش‌های حساس در ممیزی ثبت می‌شوند.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { toGregorian } from "jalaali-js";
import { db } from "@/db";
import { auditLogs, classSessions, classes, classesCounties, classesSpecialties } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/workflow-utils";
import type { ActionState } from "@/lib/action-state";
import {
  canManageClass, canTakeAttendance, cancelClass, cancelRegistration, decideRegistration,
  inviteNextWaitlist, joinWaitlist, moveWaitlistEntry, notifyClassChange, registerForClass,
  removeWaitlistEntry, respondToInvitation, saveAttendance, sendClassInvites, sendClassReminders,
  sendManualSms, TIME_RE, validTimeRange,
  type AttendanceStatus, type ClassStatus,
} from "@/lib/classes";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_POSTER_BYTES = 1024 * 1024;
const POSTER_MIMES = ["image/png", "image/jpeg", "image/webp"];

/** تاریخ را از هر دو قالب شمسی (۱۴۰۵/۹/۱۲) و میلادی ISO می‌پذیرد؛ خروجی ISO. */
function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (ISO_DATE_RE.test(value)) return value;
  const m = /^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/.exec(value);
  if (!m) return null;
  const jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3]);
  if (jy < 1300 || jy > 1500) return null;
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
}

/** مهلت ثبت‌نام: تاریخ (شمسی یا ISO) + ساعت جداگانه؛ ساعت ایران. */
function parseDeadline(dateRaw: string, timeRaw: string): Date | null {
  const iso = normalizeDate(dateRaw);
  if (!iso) return null;
  const time = TIME_RE.test(timeRaw) ? timeRaw : "23:59";
  const date = new Date(`${iso}T${time}:00+03:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateClassPaths(classId?: string) {
  revalidatePath("/classes");
  revalidatePath("/my-classes");
  if (classId) { revalidatePath(`/classes/${classId}`); revalidatePath(`/classes/${classId}/edit`); }
}

type SessionInput = { startsOn: string; startTime: string; endTime: string; location?: string; teacherName?: string; notes?: string };

function parseSessions(raw: string): { sessions: SessionInput[]; error?: string } {
  if (!raw?.trim()) return { sessions: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { sessions: [], error: "قالب جلسات نامعتبر است." };
    const sessions: SessionInput[] = [];
    for (const item of parsed as Record<string, unknown>[]) {
      const startsOn = normalizeDate(String(item.startsOn || "")) ?? "";
      const startTime = String(item.startTime || "");
      const endTime = String(item.endTime || "");
      if (!ISO_DATE_RE.test(startsOn)) return { sessions: [], error: "تاریخ یکی از جلسات نامعتبر است." };
      if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || !validTimeRange(startTime, endTime)) {
        return { sessions: [], error: "ساعت شروع/پایان جلسه نامعتبر است." };
      }
      sessions.push({
        startsOn, startTime, endTime,
        location: String(item.location || "").slice(0, 180) || undefined,
        teacherName: String(item.teacherName || "").slice(0, 120) || undefined,
        notes: String(item.notes || "").slice(0, 2000) || undefined,
      });
    }
    return { sessions };
  } catch { return { sessions: [], error: "قالب جلسات نامعتبر است." }; }
}

async function parsePoster(data: FormData): Promise<{ bytes?: Buffer; mime?: string; name?: string; error?: string }> {
  const file = data.get("poster");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_POSTER_BYTES) return { error: "حجم پوستر باید کمتر از یک مگابایت باشد." };
  if (!POSTER_MIMES.includes(file.type)) return { error: "پوستر باید تصویر PNG یا JPG یا WebP باشد." };
  return { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name.slice(0, 180) };
}

/** ساخت/به‌روزرسانی کلاس + جلسات + شهرستان‌ها و گروه‌ها در یک تراکنش. */
async function writeClass(actor: { id: string }, data: FormData, existingId?: string): Promise<{ ok: boolean; error?: string; classId?: string }> {
  const counties = data.getAll("counties").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  const specialties = data.getAll("specialties").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  const formatRaw = String(data.get("formatType") || "");
  const formatType: "in_person" | "online" | "hybrid" = formatRaw === "online" || formatRaw === "hybrid" ? formatRaw : "in_person";
  const fields = {
    title: String(data.get("title") || "").trim(),
    topic: String(data.get("topic") || "").trim(),
    description: String(data.get("description") || "").trim() || null,
    syllabus: String(data.get("syllabus") || "").trim() || null,
    formatType,
    capacity: Math.max(1, Number(data.get("capacity") || 0) || 1),
    startsOn: normalizeDate(String(data.get("startsOn") || "")) ?? "",
    startTime: String(data.get("startTime") || "08:00"),
    endTime: String(data.get("endTime") || "10:00"),
    location: String(data.get("location") || "").trim().slice(0, 180) || null,
    address: String(data.get("address") || "").trim() || null,
    teacherName: String(data.get("teacherName") || "").trim().slice(0, 120),
    teacherPhone: String(data.get("teacherPhone") || "").trim().slice(0, 20) || null,
    teacherUserId: isUuid(String(data.get("teacherUserId") || "")) ? String(data.get("teacherUserId")) : null,
    registrationDeadline: parseDeadline(String(data.get("registrationDeadlineDate") || ""), String(data.get("registrationDeadlineTime") || "")),
    reminderHours: Math.max(1, Number(data.get("reminderHours") || 48) || 48),
    waitlistRespondHours: Math.max(1, Number(data.get("waitlistRespondHours") || 24) || 24),
  };
  const sessions = parseSessions(String(data.get("sessions") || ""));
  if (sessions.error) return { ok: false, error: sessions.error };
  const poster = await parsePoster(data);
  if (poster.error) return { ok: false, error: poster.error };
  if (!fields.title || fields.title.length > 160) return { ok: false, error: "عنوان کلاس الزامی است (حداکثر ۱۶۰ نویسه)." };
  if (!fields.topic || fields.topic.length > 200) return { ok: false, error: "موضوع کلاس الزامی است (حداکثر ۲۰۰ نویسه)." };
  if (!fields.teacherName) return { ok: false, error: "نام استاد یا مدرس الزامی است." };
  if (!ISO_DATE_RE.test(fields.startsOn)) return { ok: false, error: "تاریخ برگزاری معتبر نیست." };
  if (!validTimeRange(fields.startTime, fields.endTime)) return { ok: false, error: "ساعت پایان باید پس از ساعت شروع باشد." };
  if (!counties.length) return { ok: false, error: "حداقل یک شهرستان هدف انتخاب کنید." };
  if (!specialties.length) return { ok: false, error: "حداقل یک گروه (تخصص) هدف انتخاب کنید." };

  const classId = existingId ?? crypto.randomUUID();
  await db.transaction(async (tx) => {
    if (existingId) {
      await tx.update(classes).set({
        ...fields, ...(poster.bytes ? { posterData: poster.bytes, posterMime: poster.mime, posterName: poster.name, posterSize: poster.bytes.length } : {}),
        updatedAt: new Date(),
      }).where(eq(classes.id, existingId));
    } else {
      await tx.insert(classes).values({
        id: classId, ...fields,
        ...(poster.bytes ? { posterData: poster.bytes, posterMime: poster.mime, posterName: poster.name, posterSize: poster.bytes.length } : {}),
        createdBy: actor.id,
      });
    }
    await tx.delete(classesCounties).where(eq(classesCounties.classId, classId));
    await tx.insert(classesCounties).values(counties.map((countyId) => ({ classId, countyId })));
    await tx.delete(classesSpecialties).where(eq(classesSpecialties.classId, classId));
    await tx.insert(classesSpecialties).values(specialties.map((specialtyId) => ({ classId, specialtyId })));
    await tx.delete(classSessions).where(eq(classSessions.classId, classId));
    if (sessions.sessions.length) {
      await tx.insert(classSessions).values(sessions.sessions.map((s, index) => ({
        classId, sessionNo: index + 1, startsOn: s.startsOn, startTime: s.startTime, endTime: s.endTime,
        location: s.location ?? fields.location, teacherName: s.teacherName ?? fields.teacherName, notes: s.notes ?? null,
      })));
    }
    await tx.insert(auditLogs).values({
      actorId: actor.id, action: existingId ? "class_update" : "class_create", targetType: "class", targetId: classId,
      detail: `title=${fields.title};counties=${counties.length};specialties=${specialties.length};sessions=${sessions.sessions.length};capacity=${fields.capacity}`,
    });
  });
  return { ok: true, classId };
}

export async function createClassAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const result = await writeClass(actor, data);
  if (!result.ok) return { error: result.error };
  revalidateClassPaths(result.classId);
  redirect(`/classes/${result.classId}`);
}

export async function updateClassAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "اجازهٔ ویرایش این کلاس را ندارید." };
  const result = await writeClass(actor, data, classId);
  if (!result.ok) return { error: result.error };
  revalidateClassPaths(classId);
  return { success: "کلاس با موفقیت به‌روزرسانی شد." };
}

export async function removePosterAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  await db.update(classes).set({ posterData: null, posterMime: null, posterName: null, posterSize: null, updatedAt: new Date() }).where(eq(classes.id, classId));
  await audit(actor.id, "class_poster_remove", "class", classId);
  revalidateClassPaths(classId);
  return { success: "پوستر حذف شد." };
}

/** تغییر وضعیت کلاس: فعال‌سازی پیش‌نویس، دعوت‌نامه‌های واجد شرایطان را خودکار می‌فرستد. */
export async function setClassStatusAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const nextStatus = String(data.get("status") || "") as ClassStatus;
  const reason = String(data.get("reason") || "").trim();
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const [cls] = await db.select({ status: classes.status, capacity: classes.capacity }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) return { error: "کلاس یافت نشد." };
  if (nextStatus === "active" && cls.status === "draft") {
    await db.update(classes).set({ status: "active", updatedAt: new Date() }).where(eq(classes.id, classId));
    await audit(actor.id, "class_status", "class", classId, "draft→active");
    const summary = await sendClassInvites(classId, actor);
    revalidateClassPaths(classId);
    return { success: `کلاس فعال شد؛ دعوت‌نامهٔ ${summary.queued} نفر واجد شرایط در صف ارسال قرار گرفت${summary.withoutPhone ? ` (${summary.withoutPhone} نفر بدون شماره موبایل)` : ""}.` };
  }
  if (nextStatus === "cancelled") {
    const result = await cancelClass(actor, classId, reason || undefined);
    if (!result.ok) return { error: result.error };
    revalidateClassPaths(classId);
    return { success: "کلاس لغو و به ثبت‌نام‌کنندگان اطلاع‌رسانی شد." };
  }
  if (!["draft", "active", "full", "cancelled", "held"].includes(nextStatus)) return { error: "وضعیت نامعتبر است." };
  await db.update(classes).set({ status: nextStatus, updatedAt: new Date() }).where(eq(classes.id, classId));
  await audit(actor.id, "class_status", "class", classId, `${cls.status}→${nextStatus}${reason ? `;reason=${reason}` : ""}`);
  revalidateClassPaths(classId);
  return { success: "وضعیت کلاس به‌روزرسانی شد." };
}

export async function addSessionAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const startsOn = normalizeDate(String(data.get("startsOn") || "")) ?? "";
  const startTime = String(data.get("startTime") || "");
  const endTime = String(data.get("endTime") || "");
  if (!ISO_DATE_RE.test(startsOn)) return { error: "تاریخ جلسه معتبر نیست." };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || !validTimeRange(startTime, endTime)) return { error: "ساعت پایان باید پس از شروع باشد." };
  const existing = await db.select({ sessionNo: classSessions.sessionNo }).from(classSessions).where(eq(classSessions.classId, classId));
  const nextNo = existing.reduce((max, r) => Math.max(max, r.sessionNo), 0) + 1;
  await db.transaction(async (tx) => {
    await tx.insert(classSessions).values({
      classId, sessionNo: nextNo, startsOn, startTime, endTime,
      location: String(data.get("location") || "").trim().slice(0, 180) || null,
      teacherName: String(data.get("teacherName") || "").trim().slice(0, 120) || null,
      notes: String(data.get("notes") || "").trim() || null,
    });
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "class_session_add", targetType: "class", targetId: classId, detail: `session=${nextNo}` });
  });
  revalidateClassPaths(classId);
  return { success: `جلسهٔ ${nextNo} افزوده شد.` };
}

export async function deleteSessionAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const sessionId = String(data.get("sessionId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  await audit(actor.id, "class_session_delete", "class_session", sessionId, `class=${classId}`);
  revalidateClassPaths(classId);
  return { success: "جلسه حذف شد." };
}

// ---------- کنش‌های کاربر ----------

export async function registerClassAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const classId = String(data.get("classId") || "");
  const result = await registerForClass(actor, classId, { source: "self" });
  revalidateClassPaths(classId);
  return result.ok ? { success: "ثبت‌نام شما در کلاس انجام شد." } : { error: result.error };
}

export async function cancelRegistrationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const classId = String(data.get("classId") || "");
  const reason = String(data.get("reason") || "").trim();
  const result = await cancelRegistration(actor, classId, reason || undefined);
  revalidateClassPaths(classId);
  return result.ok ? { success: "ثبت‌نام شما لغو شد." } : { error: result.error };
}

export async function joinWaitlistAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const classId = String(data.get("classId") || "");
  const result = await joinWaitlist(actor, classId);
  revalidateClassPaths(classId);
  return result.ok ? { success: "درخواست شما در لیست انتظار ثبت شد." } : { error: result.error };
}

export async function respondInvitationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const classId = String(data.get("classId") || "");
  const accept = String(data.get("accept") || "") === "1";
  const result = await respondToInvitation(actor, classId, accept);
  revalidateClassPaths(classId);
  return result.ok
    ? (accept ? { success: "ثبت‌نام شما نهایی شد؛ منتظر حضور شما هستیم." } : { success: "دعوت را رد کردید؛ نوبت به نفر بعدی منتقل شد." })
    : { error: result.error };
}

// ---------- کنش‌های ادمین روی ثبت‌نام‌ها و لیست انتظار ----------

export async function decideRegistrationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const registrationId = String(data.get("registrationId") || "");
  const classId = String(data.get("classId") || "");
  const approve = String(data.get("approve") || "") === "1";
  const note = String(data.get("note") || "").trim();
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await decideRegistration(actor, registrationId, approve, note);
  revalidateClassPaths(classId);
  return result.ok ? { success: approve ? "ثبت‌نام تأیید شد." : "ثبت‌نام رد شد." } : { error: result.error };
}

export async function inviteNextWaitlistAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await inviteNextWaitlist(classId, actor.id);
  revalidateClassPaths(classId);
  return result.ok ? { success: "دعوت نفر بعدی لیست انتظار ارسال شد." } : { error: result.error };
}

export async function removeWaitlistEntryAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const entryId = String(data.get("entryId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await removeWaitlistEntry(actor, classId, entryId);
  revalidateClassPaths(classId);
  return result.ok ? { success: "ردیف از لیست انتظار حذف شد." } : { error: result.error };
}

export async function moveWaitlistAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const entryId = String(data.get("entryId") || "");
  const direction = String(data.get("direction") || "up") === "down" ? "down" as const : "up" as const;
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await moveWaitlistEntry(actor, classId, entryId, direction);
  revalidateClassPaths(classId);
  return result.ok ? { success: "ترتیب لیست انتظار به‌روزرسانی شد." } : { error: result.error };
}

// ---------- پیامک‌های ادمین ----------

export async function resendInvitesAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const summary = await sendClassInvites(classId, actor);
  revalidateClassPaths(classId);
  return { success: `ارسال دوباره انجام شد: ${summary.queued} پیامک تازه در صف قرار گرفت؛ ${summary.alreadySent} نفر قبلاً دعوت شده بودند${summary.withoutPhone ? `؛ ${summary.withoutPhone} نفر بدون شماره` : ""}.` };
}

export async function remindClassAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const summary = await sendClassReminders(actor, [classId]);
  revalidateClassPaths(classId);
  return summary.classes
    ? { success: `یادآور کلاس: ${summary.queued} پیامک در صف قرار گرفت${summary.alreadySent ? `؛ ${summary.alreadySent} یادآور قبلاً ارسال شده بود` : ""}.` }
    : { error: "پنجرهٔ یادآور این کلاس باز نیست (زمان یادآور به تاریخ برگزاری و فاصلهٔ تعیین‌شده بستگی دارد)." };
}

export async function notifyChangeAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const changeText = String(data.get("changeText") || "").trim();
  if (!changeText) return { error: "شرح تغییر را بنویسید." };
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await notifyClassChange(classId, actor, changeText);
  revalidateClassPaths(classId);
  return result.ok ? { success: `اطلاع‌رسانی تغییر برای ${result.queued} نفر در صف ارسال قرار گرفت.` } : { error: result.error };
}

export async function sendManualSmsAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const classId = String(data.get("classId") || "");
  const userId = String(data.get("userId") || "");
  const text = String(data.get("text") || "").trim();
  if (!text) return { error: "متن پیامک را بنویسید." };
  if (!(await canManageClass(actor, classId))) return { error: "دسترسی ندارید." };
  const result = await sendManualSms(actor, classId, userId, text);
  revalidateClassPaths(classId);
  return result.ok ? { success: "پیامک در صف ارسال قرار گرفت." } : { error: result.error };
}

// ---------- حضور و غیاب ----------

export async function saveAttendanceAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  const classId = String(data.get("classId") || "");
  const sessionId = String(data.get("sessionId") || "");
  if (!(await can(actor, "classes.manage")) && !(await can(actor, "classes.teach"))) redirect("/dashboard");
  const [cls] = await db.select({ teacherUserId: classes.teacherUserId }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls || !(await canTakeAttendance(actor, cls))) return { error: "برای ثبت حضور و غیاب این کلاس دسترسی ندارید." };
  let entries: { userId: string; status: AttendanceStatus; notes?: string }[] = [];
  try {
    entries = JSON.parse(String(data.get("entries") || "[]"));
  } catch { return { error: "قالب دادهٔ حضور نامعتبر است." }; }
  const result = await saveAttendance(actor, classId, sessionId, entries);
  revalidateClassPaths(classId);
  return result.ok ? { success: "حضور و غیاب ثبت شد؛ تغییرات در سوابق ثبت گردید." } : { error: result.error };
}
