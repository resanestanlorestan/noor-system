// الحاقیهٔ ۲.۱۹.۰ — مونتاژ سمت سرور برای پنل جزئیات کلاس (ادمین یا مدرس):
// همهٔ داده‌ها سری‌سازی می‌شوند تا به کامپوننت کلاینت پاس شود. دسترسی:
// classes.manage با محدودهٔ جغرافیایی، یا classes.teach برای مدرسِ همان کلاس.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classes } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { canManageClass, canTakeAttendance, getClassDetail, listAttendanceEdits, listClassAttendanceSummary, listClassSms, listParticipants, listSessions, listWaitlist } from "@/lib/classes";
import type { ClassDetailProps } from "@/components/class-detail";

export type ClassViewAccess = { ok: false; error: string } | { ok: true; isAdmin: boolean; props: ClassDetailProps };

export async function loadClassView(actor: SessionUser, classId: string): Promise<ClassViewAccess> {
  const detail = await getClassDetail(classId);
  if (!detail) return { ok: false, error: "کلاس یافت نشد." };
  const isAdmin = await canManageClass(actor, classId);
  const [cls] = await db.select({ teacherUserId: classes.teacherUserId }).from(classes).where(eq(classes.id, classId)).limit(1);
  const isTeacher = !isAdmin && !!cls?.teacherUserId && cls.teacherUserId === actor.id
    && (await canTakeAttendance(actor, { teacherUserId: cls.teacherUserId }));
  if (!isAdmin && !isTeacher) return { ok: false, error: "به این کلاس دسترسی ندارید." };
  if (!isAdmin && !detail.sessions.length) {
    // مدرس به کلاس بدون جلسه دسترسی مدیریتی ندارد؛ جزئیات محدود نمایش داده می‌شود
  }
  const [participants, waitlist, sms, attendanceEdits, attendanceSummary, sessions] = await Promise.all([
    listParticipants(classId, {}),
    listWaitlist(classId),
    isAdmin ? listClassSms(classId) : Promise.resolve([]),
    isAdmin ? listAttendanceEdits(classId) : Promise.resolve([]),
    listClassAttendanceSummary(classId),
    listSessions(classId),
  ]);
  return {
    ok: true, isAdmin,
    props: {
      id: detail.id, title: detail.title, topic: detail.topic,
      description: detail.description, syllabus: detail.syllabus,
      status: detail.status, formatType: detail.formatType, capacity: detail.capacity,
      startsOn: detail.startsOn, startTime: detail.startTime, endTime: detail.endTime,
      location: detail.location, address: detail.address,
      teacherName: detail.teacherName, teacherPhone: detail.teacherPhone,
      registrationDeadline: detail.registrationDeadline ? detail.registrationDeadline.toISOString() : null,
      reminderHours: detail.reminderHours, waitlistRespondHours: detail.waitlistRespondHours,
      creatorName: detail.creatorName, hasPoster: detail.hasPoster,
      registeredCount: Number(detail.registeredCount), waitlistCount: Number(detail.waitlistCount),
      smsCount: Number(detail.smsCount), eligibleCount: Number(detail.eligibleCount),
      counties: detail.counties.map((c) => ({ county: c.county, province: c.province })),
      specialties: detail.specialties.map((s) => s.specialty),
      sessions: sessions.map((s) => ({ id: s.id, sessionNo: s.sessionNo, startsOn: s.startsOn, startTime: s.startTime, endTime: s.endTime, location: s.location, teacherName: s.teacherName, notes: s.notes })),
      participants: participants.map((p) => ({
        id: p.id, status: p.status, source: p.source,
        registeredAt: p.registeredAt.toISOString(),
        cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
        cancelReason: p.cancelReason, approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
        userId: p.userId, userFullName: p.userFullName, caseName: p.caseName || null,
        phone: p.phone || p.userPhone || null, county: p.county || null, specialties: p.specialties || null,
      })),
      waitlist: waitlist.map((w) => ({
        id: w.id, status: w.status, position: w.position,
        invitedAt: w.invitedAt ? w.invitedAt.toISOString() : null,
        respondDeadline: w.respondDeadline ? w.respondDeadline.toISOString() : null,
        respondedAt: w.respondedAt ? w.respondedAt.toISOString() : null,
        createdAt: w.createdAt.toISOString(), userId: w.userId, userFullName: w.userFullName,
        userPhone: w.userPhone, county: w.county || null,
      })),
      sms: sms.map((s) => ({
        id: s.id, kind: s.kind, phone: s.phone, message: s.message, status: s.status,
        error: s.error, createdAt: s.createdAt.toISOString(),
        sentAt: s.sentAt ? s.sentAt.toISOString() : null,
        userFullName: s.userFullName || null, createdByName: s.createdByName || null,
      })),
      attendanceEdits: attendanceEdits.map((e) => ({
        id: e.id, oldStatus: e.oldStatus, newStatus: e.newStatus, note: e.note,
        changedAt: e.changedAt.toISOString(), changedByName: e.changedByName || null,
        sessionNo: e.sessionNo, userFullName: e.userFullName || null,
      })),
      attendanceSummary,
      isAdmin,
    },
  };
}
