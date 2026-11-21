// الحاقیهٔ ۲.۱۹.۰ — سیستم مدیریت کلاس‌ها و دوره‌های آموزشی با ثبت‌نام هوشمند.
//
// هستهٔ منطق: هدف‌گیری چند گروه تخصصی (تخصص‌های موجود سامانه) و چند شهرستان
// از میان داده‌های موجود، شناسایی «جامعهٔ هدف» فقط از میان پرونده‌های
// تکمیل‌شده، پیامک دعوت/یادآور/تغییر/لغو با ضدتکرار در سطح دیتابیس، ثبت‌نام
// امن در برابر درخواست‌های هم‌زمان (قفل ردیف کلاس با FOR UPDATE)، لیست انتظار
// با دعوت خودکار و مهلت پاسخ، حضور و غیاب به تفکیک جلسه با سوابق تغییر و
// داشبورد آماری. هیچ جدول یا جریان موجودی بازنویسی نشده است.
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activistSpecialties, activists, applications, auditLogs, counties, classAttendance, classAttendanceLogs,
  classRegistrations, classSmsLog, classSessions, classWaitlist, classes, classesCounties,
  classesSpecialties, notifications, specialties, users,
} from "@/db/schema";
import { audit } from "@/lib/auth";
import type { MaybeSessionUser, SessionUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { isUuid } from "@/lib/workflow-utils";

// ---------- ثابت‌ها و برچسب‌ها ----------

export const CLASS_STATUSES = ["draft", "active", "full", "cancelled", "held"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];
export const classStatusLabels: Record<ClassStatus, string> = {
  draft: "پیش‌نویس", active: "فعال", full: "تکمیل ظرفیت", cancelled: "لغوشده", held: "برگزارشده",
};

export const CLASS_FORMATS = ["in_person", "online", "hybrid"] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];
export const classFormatLabels: Record<ClassFormat, string> = { in_person: "حضوری", online: "آنلاین", hybrid: "ترکیبی" };

export type RegistrationStatus = "registered" | "cancelled";
export const registrationStatusLabels: Record<RegistrationStatus, string> = { registered: "ثبت‌نام‌شده", cancelled: "انصراف‌داده" };

export type WaitlistStatus = "waiting" | "invited" | "converted" | "declined" | "no_response" | "cancelled";
export const waitlistStatusLabels: Record<WaitlistStatus, string> = {
  waiting: "در انتظار", invited: "دعوت‌شده", converted: "ثبت‌نام‌شده", declined: "انصراف‌داده",
  no_response: "عدم پاسخ", cancelled: "حذف‌شده",
};

export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  present: "حاضر", absent: "غایب", late: "تأخیر", excused: "غیبت موجه",
};

export type ClassSmsKind = "invite" | "reminder" | "change" | "cancel" | "waitlist_invite" | "waitlist_expired" | "manual";
export const classSmsKindLabels: Record<ClassSmsKind, string> = {
  invite: "دعوت به ثبت‌نام", reminder: "یادآور برگزاری", change: "اطلاع‌رسانی تغییر", cancel: "اطلاع‌رسانی لغو",
  waitlist_invite: "دعوت از لیست انتظار", waitlist_expired: "انقضای دعوت", manual: "ارسال دستی",
};

/** پروندهٔ «تکمیل‌شده»: ارسال‌شده و نه پیش‌نویس و نه ردشده — همان تعریف مخاطبان ابزار پیام گروهی. */
const ELIGIBLE_CASE_CONDITION = sql`exists (select 1 from ${applications} ap where ap.activist_id = ${activists.id} and ap.deleted_at is null and ap.submitted_at is not null and ap.status not in ('draft','rejected'))`;

export const DEFAULT_WAITLIST_RESPOND_HOURS = 24;
export const MAX_CLASS_SMS_BATCH = 300;
/** برنامهٔ کلاس (تاریخ/ساعت بدون منطقهٔ زمانی) به ساعت رسمی ایران تفسیر می‌شود. */
const TEHRAN_OFFSET = "+03:30";

// ---------- توابع خالص (قابل آزمون) ----------

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}
export function validTimeRange(start: string, end: string): boolean {
  const s = timeToMinutes(start), e = timeToMinutes(end);
  return s >= 0 && e >= 0 && e > s;
}
/** تاریخ/ساعت جلسه بر پایهٔ ساعت ایران. */
export function scheduleAt(startsOn: string, startTime: string): Date {
  return new Date(`${startsOn}T${startTime}:00${TEHRAN_OFFSET}`);
}
export function isReminderDue(startsOn: string, startTime: string, reminderHours: number, now = new Date()): boolean {
  const at = scheduleAt(startsOn, startTime).getTime();
  return at > now.getTime() && at - reminderHours * 3600_000 <= now.getTime();
}
export function isRespondDeadlinePassed(deadline: Date | null, now = new Date()): boolean {
  return !!deadline && deadline.getTime() <= now.getTime();
}
export function faSchedule(startsOn: string, startTime: string, endTime?: string | null): string {
  const base = `${faDate(scheduleAt(startsOn, startTime))} ساعت ${startTime}${endTime ? ` تا ${endTime}` : ""}`;
  return base;
}
/** درصد حضور: حاضر و تأخیر حضور محسوب می‌شوند؛ غیبت موجه از صورت کسر نمی‌شود. */
export function attendancePercent(rows: { status: string }[]): number {
  if (!rows.length) return 0;
  const attended = rows.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / rows.length) * 100);
}
export function attendanceTally(rows: { status: string }[]) {
  const tally = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) if (r.status in tally) tally[r.status as keyof typeof tally]++;
  return tally;
}
/** وضعیت خودکار کلاس: با پر شدن ظرفیت «full» و با آزاد شدن صندلی به «active» برمی‌گردد. */
export function resolveCapacityStatus(current: ClassStatus, registeredCount: number, capacity: number): ClassStatus {
  if (current !== "active" && current !== "full") return current;
  if (capacity > 0 && registeredCount >= capacity) return "full";
  return "active";
}

// ---------- محدودهٔ دسترسی ----------

/** کلاس‌های قابل مدیریت برای نقش: ابرمدیر همه؛ مدیر استان/شهرستان فقط کلاس‌های
 *  شهرستان‌های محدودهٔ خودش (بر پایهٔ شهرستان‌های هدف کلاس). */
export function classScopeCondition(user: MaybeSessionUser): SQL {
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return sql`true`;
  if (role === "county_admin") {
    return user.countyId
      ? sql`exists (select 1 from ${classesCounties} cc where cc.class_id = ${classes.id} and cc.county_id = ${user.countyId})`
      : sql`false`;
  }
  if (user.provinceId) {
    return sql`exists (select 1 from ${classesCounties} cc join ${counties} c on c.id = cc.county_id where cc.class_id = ${classes.id} and c.province_id = ${user.provinceId})`;
  }
  return sql`false`;
}

export async function canManageClass(user: MaybeSessionUser, classId: string): Promise<boolean> {
  if (!isUuid(classId)) return false;
  const rows = await db.select({ countyId: classesCounties.countyId })
    .from(classes).innerJoin(classesCounties, eq(classesCounties.classId, classes.id))
    .where(eq(classes.id, classId));
  if (!rows.length) return false;
  const role = user.effectiveRole ?? user.role;
  if (role === "super_admin") return true;
  if (role === "county_admin") return rows.some((r) => r.countyId === user.countyId);
  if (user.provinceId) {
    const provinceCounties = await db.select({ id: counties.id }).from(counties).where(eq(counties.provinceId, user.provinceId));
    const ids = new Set(provinceCounties.map((c) => c.id));
    return rows.some((r) => ids.has(r.countyId));
  }
  return false;
}

/** آیا کاربر اجازهٔ ثبت حضور و غیاب این کلاس را دارد؟ (ادمین یا مدرس اختصاص‌یافته) */
export async function canTakeAttendance(user: MaybeSessionUser, cls: { teacherUserId: string | null }): Promise<boolean> {
  const { can } = await import("@/lib/permissions");
  if (await can(user, "classes.manage")) return true;
  return (await can(user, "classes.teach")) && cls.teacherUserId === user.id;
}

// ---------- شمارنده‌های مشترک ----------

const registeredCountExpr = sql<number>`(select count(*) from ${classRegistrations} r where r.class_id = ${classes.id} and r.status = 'registered')`;
const waitlistCountExpr = sql<number>`(select count(*) from ${classWaitlist} w where w.class_id = ${classes.id} and w.status in ('waiting','invited'))`;
const smsSentCountExpr = sql<number>`(select count(*) from ${classSmsLog} s where s.class_id = ${classes.id} and s.status in ('sent','queued','local'))`;
// جامعهٔ هدف با alias «a»؛ هر ارجاع داخل زیرکوئری‌ها باید هم‌نام همین alias باشد
const eligibleCountExpr = sql<number>`(select count(*) from ${activists} a where a.deleted_at is null and exists (select 1 from applications ap where ap.activist_id = a.id and ap.deleted_at is null and ap.submitted_at is not null and ap.status not in ('draft','rejected')) and exists (select 1 from ${classesCounties} cc where cc.class_id = ${classes.id} and cc.county_id = a.county_id) and exists (select 1 from ${classesSpecialties} cs where cs.class_id = ${classes.id} and exists (select 1 from ${activistSpecialties} a_s where a_s.activist_id = a.id and a_s.specialty_id = cs.specialty_id)))`;

async function classRegisteredCount(tx: DbApi, classId: string): Promise<number> {
  const [row] = await tx.select({ total: sql<number>`count(*)` }).from(classRegistrations)
    .where(and(eq(classRegistrations.classId, classId), eq(classRegistrations.status, "registered")));
  return Number(row?.total ?? 0);
}
async function waitlistHead(tx: DbApi, classId: string) {
  const [head] = await tx.select({ id: classWaitlist.id, userId: classWaitlist.userId, position: classWaitlist.position })
    .from(classWaitlist).where(and(eq(classWaitlist.classId, classId), eq(classWaitlist.status, "waiting")))
    .orderBy(asc(classWaitlist.position), asc(classWaitlist.createdAt)).limit(1);
  return head ?? null;
}

// ---------- جامعهٔ هدف (افراد واجد شرایط) ----------

export type EligibleRow = {
  activistId: string; userId: string | null; fullName: string; phone: string | null;
  county: string | null; specialties: string; registered: boolean; invited: boolean;
};

/** افراد واجد شرایط یک کلاس: پروندهٔ تکمیل‌شده + شهرستان هدف + گروه هدف. */
export async function listEligibleAudience(classId: string): Promise<EligibleRow[]> {
  if (!isUuid(classId)) return [];
  return db.select({
    activistId: activists.id, userId: activists.userId,
    fullName: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    phone: activists.phone,
    county: counties.name,
    specialties: sql<string>`(select string_agg(sp.title, '، ') from ${activistSpecialties} a_s join quranic_specialties sp on sp.id = a_s.specialty_id where a_s.activist_id = ${activists.id})`,
    registered: sql<boolean>`exists (select 1 from ${classRegistrations} r where r.class_id = ${classId} and r.user_id = ${users.id} and r.status = 'registered')`,
    invited: sql<boolean>`exists (select 1 from ${classSmsLog} s where s.class_id = ${classId} and s.user_id = ${users.id} and s.kind = 'invite')`,
  }).from(activists)
    .leftJoin(users, eq(users.id, activists.userId))
    .leftJoin(counties, eq(counties.id, activists.countyId))
    .where(and(
      sql`${activists.deletedAt} is null`,
      ELIGIBLE_CASE_CONDITION,
      sql`exists (select 1 from ${classesCounties} cc where cc.class_id = ${classId} and cc.county_id = ${activists.countyId})`,
      sql`exists (select 1 from ${classesSpecialties} cs where cs.class_id = ${classId} and exists (select 1 from ${activistSpecialties} a_s where a_s.activist_id = ${activists.id} and a_s.specialty_id = cs.specialty_id))`,
    ))
    .orderBy(asc(activists.lastName));
}

// ---------- CRUD و فهرست‌ها ----------

export type ClassListRow = Awaited<ReturnType<typeof listClasses>>[number];

export async function listClasses(user: MaybeSessionUser, filters: { status?: string; countyId?: number; specialtyId?: number; teacherUserId?: string; limit?: number } = {}) {
  const conditions: SQL[] = [classScopeCondition(user)];
  if (filters.status && CLASS_STATUSES.includes(filters.status as ClassStatus)) conditions.push(sql`${classes.status} = ${filters.status}`);
  if (filters.countyId) conditions.push(sql`exists (select 1 from ${classesCounties} cc where cc.class_id = ${classes.id} and cc.county_id = ${filters.countyId})`);
  if (filters.specialtyId) conditions.push(sql`exists (select 1 from ${classesSpecialties} cs where cs.class_id = ${classes.id} and cs.specialty_id = ${filters.specialtyId})`);
  if (filters.teacherUserId) conditions.push(sql`${classes.teacherUserId} = ${filters.teacherUserId}`);
  return db.select({
    id: classes.id, title: classes.title, topic: classes.topic, description: classes.description, syllabus: classes.syllabus,
    status: classes.status, formatType: classes.formatType, capacity: classes.capacity,
    startsOn: classes.startsOn, startTime: classes.startTime, endTime: classes.endTime,
    location: classes.location, address: classes.address, teacherName: classes.teacherName,
    teacherPhone: classes.teacherPhone, teacherUserId: classes.teacherUserId,
    registrationDeadline: classes.registrationDeadline, reminderHours: classes.reminderHours,
    waitlistRespondHours: classes.waitlistRespondHours, createdBy: classes.createdBy, createdAt: classes.createdAt,
    creatorName: users.fullName, hasPoster: sql<boolean>`${classes.posterData} is not null`,
    sessionCount: sql<number>`(select count(*) from ${classSessions} s where s.class_id = ${classes.id})`,
    registeredCount: registeredCountExpr, waitlistCount: waitlistCountExpr,
    smsCount: smsSentCountExpr, eligibleCount: eligibleCountExpr,
  }).from(classes)
    .leftJoin(users, eq(users.id, classes.createdBy))
    .where(and(...conditions))
    .orderBy(desc(classes.createdAt))
    .limit(filters.limit ?? 200);
}

/** کلاس‌های تدریسی کاربر (دسترسی مدرس). */
export async function listTeachingClasses(user: { id: string }) {
  return listClasses({ id: user.id, role: "super_admin" } as MaybeSessionUser, { teacherUserId: user.id, limit: 100 });
}

export type ClassDetail = Awaited<ReturnType<typeof getClassDetail>>;

export async function getClassDetail(classId: string) {
  if (!isUuid(classId)) return null;
  const [row] = await db.select({
    id: classes.id, title: classes.title, topic: classes.topic,
    description: classes.description, syllabus: classes.syllabus, status: classes.status,
    formatType: classes.formatType, capacity: classes.capacity, startsOn: classes.startsOn,
    startTime: classes.startTime, endTime: classes.endTime, location: classes.location, address: classes.address,
    teacherName: classes.teacherName, teacherPhone: classes.teacherPhone, teacherUserId: classes.teacherUserId,
    registrationDeadline: classes.registrationDeadline, reminderHours: classes.reminderHours,
    waitlistRespondHours: classes.waitlistRespondHours, createdAt: classes.createdAt, updatedAt: classes.updatedAt,
    createdBy: classes.createdBy, creatorName: users.fullName, hasPoster: sql<boolean>`${classes.posterData} is not null`,
  }).from(classes).leftJoin(users, eq(users.id, classes.createdBy)).where(eq(classes.id, classId));
  if (!row) return null;
  const [countyRows, specialtyRows, sessions] = await Promise.all([
    db.select({ countyId: classesCounties.countyId, county: counties.name, province: sql<string>`(select p.name from provinces p where p.id = ${counties.provinceId})` })
      .from(classesCounties).innerJoin(counties, eq(counties.id, classesCounties.countyId)).where(eq(classesCounties.classId, classId)).orderBy(asc(counties.name)),
    db.select({ specialtyId: classesSpecialties.specialtyId, specialty: specialties.title })
      .from(classesSpecialties).innerJoin(specialties, eq(specialties.id, classesSpecialties.specialtyId))
      .where(eq(classesSpecialties.classId, classId)),
    listSessions(classId),
  ]);
  const [counts] = await db.select({
    registeredCount: registeredCountExpr, waitlistCount: waitlistCountExpr, smsCount: smsSentCountExpr, eligibleCount: eligibleCountExpr,
  }).from(classes).where(eq(classes.id, classId));
  return { ...row, counties: countyRows, specialties: specialtyRows, sessions, ...counts };
}

export async function listSessions(classId: string) {
  return db.select().from(classSessions).where(eq(classSessions.classId, classId)).orderBy(asc(classSessions.sessionNo));
}

export async function listCountiesOptions(user: MaybeSessionUser) {
  const role = user.effectiveRole ?? user.role;
  const conditions: SQL[] = [];
  if (role !== "super_admin" && user.provinceId) conditions.push(eq(counties.provinceId, user.provinceId));
  return db.select({ id: counties.id, name: counties.name, province: sql<string>`(select p.name from provinces p where p.id = ${counties.provinceId})` })
    .from(counties).where(conditions.length ? and(...conditions) : sql`true`).orderBy(asc(counties.name));
}

// ---------- ثبت‌نام‌کنندگان / لیست انتظار / پیامک‌ها ----------

export type ParticipantRow = Awaited<ReturnType<typeof listParticipants>>[number];

export async function listParticipants(classId: string, filters: { q?: string; countyId?: number; specialtyId?: number; status?: string } = {}) {
  const conditions: SQL[] = [eq(classRegistrations.classId, classId)];
  if (filters.status && ["registered", "cancelled"].includes(filters.status)) conditions.push(sql`${classRegistrations.status} = ${filters.status}`);
  if (filters.countyId) conditions.push(sql`${activists.countyId} = ${filters.countyId}`);
  if (filters.specialtyId) conditions.push(sql`exists (select 1 from ${activistSpecialties} a_s where a_s.activist_id = ${activists.id} and a_s.specialty_id = ${filters.specialtyId})`);
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(sql`(${users.fullName} ilike ${q} or ${activists.firstName} || ' ' || ${activists.lastName} ilike ${q} or coalesce(${activists.phone},'') ilike ${q})`);
  }
  return db.select({
    id: classRegistrations.id, status: classRegistrations.status, source: classRegistrations.source,
    registeredAt: classRegistrations.registeredAt, cancelledAt: classRegistrations.cancelledAt,
    cancelReason: classRegistrations.cancelReason, approvedAt: classRegistrations.approvedAt,
    userId: classRegistrations.userId, userFullName: users.fullName, userPhone: users.phone,
    activistId: activists.id, caseName: sql<string>`${activists.firstName} || ' ' || ${activists.lastName}`,
    phone: activists.phone, county: counties.name,
    specialties: sql<string>`(select string_agg(sp.title, '، ') from ${activistSpecialties} a_s join quranic_specialties sp on sp.id = a_s.specialty_id where a_s.activist_id = ${activists.id})`,
  }).from(classRegistrations)
    .innerJoin(users, eq(users.id, classRegistrations.userId))
    .leftJoin(activists, eq(activists.userId, classRegistrations.userId))
    .leftJoin(counties, eq(counties.id, activists.countyId))
    .where(and(...conditions))
    .orderBy(desc(classRegistrations.registeredAt));
}

export type WaitlistRow = Awaited<ReturnType<typeof listWaitlist>>[number];

export async function listWaitlist(classId: string) {
  return db.select({
    id: classWaitlist.id, status: classWaitlist.status, position: classWaitlist.position,
    invitedAt: classWaitlist.invitedAt, respondDeadline: classWaitlist.respondDeadline, respondedAt: classWaitlist.respondedAt,
    createdAt: classWaitlist.createdAt, userId: classWaitlist.userId, userFullName: users.fullName, userPhone: users.phone,
    county: sql<string | null>`(select c.name from quranic_activists a left join counties c on c.id = a.county_id where a.user_id = ${classWaitlist.userId} limit 1)`,
  }).from(classWaitlist)
    .innerJoin(users, eq(users.id, classWaitlist.userId))
    .where(eq(classWaitlist.classId, classId))
    .orderBy(asc(classWaitlist.position), asc(classWaitlist.createdAt));
}

export async function listClassSms(classId: string, kind?: string) {
  const conditions: SQL[] = [eq(classSmsLog.classId, classId)];
  if (kind && kind in classSmsKindLabels) conditions.push(sql`${classSmsLog.kind} = ${kind}`);
  return db.select({
    id: classSmsLog.id, kind: classSmsLog.kind, phone: classSmsLog.phone, message: classSmsLog.message,
    status: classSmsLog.status, error: classSmsLog.error, createdAt: classSmsLog.createdAt, sentAt: classSmsLog.sentAt,
    userFullName: users.fullName, createdByName: sql<string | null>`(select u2.full_name from app_users u2 where u2.id = ${classSmsLog.createdBy})`,
  }).from(classSmsLog)
    .leftJoin(users, eq(users.id, classSmsLog.userId))
    .where(and(...conditions))
    .orderBy(desc(classSmsLog.createdAt)).limit(400);
}

// ---------- حضور و غیاب ----------

export async function listSessionAttendance(classId: string, sessionId: string) {
  return db.select({
    id: classAttendance.id, userId: classAttendance.userId, status: classAttendance.status, notes: classAttendance.notes,
    updatedAt: classAttendance.updatedAt, userFullName: users.fullName,
    county: sql<string | null>`(select c.name from quranic_activists a left join counties c on c.id = a.county_id where a.user_id = ${classAttendance.userId} limit 1)`,
  }).from(classAttendance)
    .innerJoin(users, eq(users.id, classAttendance.userId))
    .where(and(eq(classAttendance.classId, classId), eq(classAttendance.sessionId, sessionId)))
    .orderBy(asc(users.fullName));
}

export type AttendanceEditRow = Awaited<ReturnType<typeof listAttendanceEdits>>[number];

export async function listAttendanceEdits(classId: string, limit = 50) {
  return db.select({
    id: classAttendanceLogs.id, oldStatus: classAttendanceLogs.oldStatus, newStatus: classAttendanceLogs.newStatus,
    note: classAttendanceLogs.note, changedAt: classAttendanceLogs.changedAt,
    changedByName: users.fullName,
    sessionNo: classSessions.sessionNo, userFullName: users.fullName,
  }).from(classAttendanceLogs)
    .innerJoin(classAttendance, eq(classAttendance.id, classAttendanceLogs.attendanceId))
    .innerJoin(classSessions, eq(classSessions.id, classAttendance.sessionId))
    .leftJoin(users, eq(users.id, classAttendanceLogs.changedBy))
    .where(eq(classAttendance.classId, classId))
    .orderBy(desc(classAttendanceLogs.changedAt)).limit(limit);
}

/** درصد حضور هر فرد در یک کلاس (روی همهٔ جلسات) — برای گزارش و ستون درصد. */
export async function listClassAttendanceSummary(classId: string) {
  const rows = await db.select({
    userId: classAttendance.userId, userFullName: users.fullName, status: classAttendance.status,
    sessionNo: classSessions.sessionNo, sessionId: classSessions.id,
  }).from(classAttendance)
    .innerJoin(users, eq(users.id, classAttendance.userId))
    .innerJoin(classSessions, eq(classSessions.id, classAttendance.sessionId))
    .where(eq(classAttendance.classId, classId))
    .orderBy(asc(users.fullName), asc(classSessions.sessionNo));
  const byUser = new Map<string, { userId: string; userFullName: string; rows: { status: string }[] }>();
  for (const r of rows) {
    let entry = byUser.get(r.userId);
    if (!entry) { entry = { userId: r.userId, userFullName: r.userFullName, rows: [] }; byUser.set(r.userId, entry); }
    entry.rows.push({ status: r.status });
  }
  return [...byUser.values()].map((entry) => ({ ...entry, percent: attendancePercent(entry.rows), tally: attendanceTally(entry.rows) }));
}

/** سوابق حضور یک فرد در همهٔ کلاس‌ها (مشاهده توسط ادمین). */
export async function listUserClassAttendance(userId: string) {
  return db.select({
    classId: classAttendance.classId, classTitle: classes.title, sessionNo: classSessions.sessionNo,
    startsOn: classSessions.startsOn, status: classAttendance.status, notes: classAttendance.notes,
  }).from(classAttendance)
    .innerJoin(classes, eq(classes.id, classAttendance.classId))
    .innerJoin(classSessions, eq(classSessions.id, classAttendance.sessionId))
    .where(eq(classAttendance.userId, userId))
    .orderBy(asc(classSessions.startsOn));
}

// ---------- نمای کاربر عادی ----------

export type UserClassRow = Awaited<ReturnType<typeof listUserClasses>>[number];

/** کلاس‌های متناسب با گروه (تخصص) و شهرستان کاربر، همراه با وضعیت خود او. */
export async function listUserClasses(user: { id: string }) {
  const [activist] = await db.select({ id: activists.id, countyId: activists.countyId })
    .from(activists).where(and(eq(activists.userId, user.id), sql`${activists.deletedAt} is null`)).limit(1);
  if (!activist) return [];
  const specialtyRows = await db.select({ specialtyId: activistSpecialties.specialtyId })
    .from(activistSpecialties).where(eq(activistSpecialties.activistId, activist.id));
  const specialtyIds = specialtyRows.map((r) => r.specialtyId);
  const conditions: SQL[] = [
    sql`${classes.status} in ('active','full','held')`,
    sql`exists (select 1 from ${classesCounties} cc where cc.class_id = ${classes.id} and cc.county_id = ${activist.countyId})`,
  ];
  if (specialtyIds.length) {
    conditions.push(sql`exists (select 1 from ${classesSpecialties} cs where cs.class_id = ${classes.id} and cs.specialty_id in ${specialtyIds})`);
  } else conditions.push(sql`false`);
  return db.select({
    id: classes.id, title: classes.title, topic: classes.topic, description: classes.description, syllabus: classes.syllabus,
    status: classes.status, formatType: classes.formatType, capacity: classes.capacity,
    startsOn: classes.startsOn, startTime: classes.startTime, endTime: classes.endTime,
    location: classes.location, address: classes.address, teacherName: classes.teacherName,
    registrationDeadline: classes.registrationDeadline, hasPoster: sql<boolean>`${classes.posterData} is not null`,
    sessionCount: sql<number>`(select count(*) from ${classSessions} s where s.class_id = ${classes.id})`,
    registeredCount: registeredCountExpr,
    myRegistrationId: sql<string | null>`(select r.id from ${classRegistrations} r where r.class_id = ${classes.id} and r.user_id = ${user.id} and r.status = 'registered' limit 1)`,
    myCancelledId: sql<string | null>`(select r.id from ${classRegistrations} r where r.class_id = ${classes.id} and r.user_id = ${user.id} and r.status = 'cancelled' order by r.cancelled_at desc limit 1)`,
    myWaitlistStatus: sql<string | null>`(select w.status from ${classWaitlist} w where w.class_id = ${classes.id} and w.user_id = ${user.id} and w.status in ('waiting','invited') limit 1)`,
    myWaitlistDeadline: sql<string | null>`(select w.respond_deadline::text from ${classWaitlist} w where w.class_id = ${classes.id} and w.user_id = ${user.id} and w.status = 'invited' limit 1)`,
  }).from(classes).where(and(...conditions)).orderBy(asc(classes.startsOn));
}

/** آیا کاربر برای این کلاس واجد شرایط است؟ (پروندهٔ تکمیل + شهرستان + گروه) */
export async function isUserEligible(user: { id: string }, classId: string): Promise<{ ok: boolean; reason?: string }> {
  const [activist] = await db.select({ id: activists.id, countyId: activists.countyId })
    .from(activists).where(and(eq(activists.userId, user.id), sql`${activists.deletedAt} is null`)).limit(1);
  if (!activist) return { ok: false, reason: "پروندهٔ فعالی در سامانه ندارید؛ ابتدا پروندهٔ خود را تکمیل کنید." };
  const [caseRow] = await db.select({ status: applications.status, submittedAt: applications.submittedAt })
    .from(applications).where(and(eq(applications.activistId, activist.id), sql`${applications.deletedAt} is null`)).limit(1);
  if (!caseRow?.submittedAt || ["draft", "rejected"].includes(caseRow.status ?? "")) {
    return { ok: false, reason: "پروندهٔ شما هنوز تکمیل و ارسال نشده است." };
  }
  const [countyMatch] = await db.select({ one: sql<number>`1` }).from(classesCounties)
    .where(and(eq(classesCounties.classId, classId), eq(classesCounties.countyId, activist.countyId ?? -1))).limit(1);
  if (!countyMatch) return { ok: false, reason: "شهرستان پروندهٔ شما با شهرستان‌های هدف این کلاس هم‌خوان نیست." };
  const [specialtyMatch] = await db.select({ one: sql<number>`1` }).from(classesSpecialties)
    .where(and(
      eq(classesSpecialties.classId, classId),
      sql`exists (select 1 from ${activistSpecialties} a_s where a_s.activist_id = ${activist.id} and a_s.specialty_id = ${classesSpecialties.specialtyId})`,
    )).limit(1);
  if (!specialtyMatch) return { ok: false, reason: "گروه (تخصص) پروندهٔ شما با گروه‌های هدف این کلاس هم‌خوان نیست." };
  return { ok: true };
}

// ---------- پیامک‌ها ----------

type SmsQueueContext = Parameters<typeof import("@/lib/messaging").queueSms>[0];

/** ثبت ردیف لاگ پیامک کلاس با ضدتکرار؛ خروجی: آیا ردیف تازه ساخته شد؟ */
async function logClassSms(tx: SmsQueueContext, entry: {
  classId: string; userId: string | null; kind: ClassSmsKind; phone: string; message: string; createdBy: string | null;
}): Promise<boolean> {
  const inserted = await tx.insert(classSmsLog).values({
    classId: entry.classId, userId: entry.userId, kind: entry.kind, phone: entry.phone,
    message: entry.message, createdBy: entry.createdBy,
  }).onConflictDoNothing().returning({ id: classSmsLog.id });
  return inserted.length > 0;
}

/** ارسال دعوتنامهٔ پیامکی فعال‌سازی کلاس به افراد واجد شرایطِ دارای موبایل.
 *  ضدتکرار با ایندکس یکتا (کلاس، فرد، نوع) تضمین می‌شود؛ «ارسال مجدد» ادمین
 *  با نوع «manual» خارج از قید یکتا انجام می‌شود. */
export async function sendClassInvites(classId: string, actor: SessionUser | null): Promise<{
  ok: boolean; error?: string; eligible: number; queued: number; withoutPhone: number; alreadySent: number;
}> {
  const summary = { ok: false, eligible: 0, queued: 0, withoutPhone: 0, alreadySent: 0 };
  const [cls] = await db.select({ topic: classes.topic }).from(classes).where(eq(classes.id, classId));
  if (!cls) return { ...summary, error: "کلاس یافت نشد." };
  const audience = await listEligibleAudience(classId);
  summary.eligible = audience.filter((p) => !p.registered).length;
  const countiesRows = await db.select({ name: counties.name }).from(classesCounties)
    .innerJoin(counties, eq(counties.id, classesCounties.countyId)).where(eq(classesCounties.classId, classId)).orderBy(asc(counties.name));
  const specialtyRows = await db.select({ title: specialties.title })
    .from(classesSpecialties).innerJoin(specialties, eq(specialties.id, classesSpecialties.specialtyId))
    .where(eq(classesSpecialties.classId, classId));
  const groups = specialtyRows.map((r) => r.title).join("، ") || "قرآنی";
  const countyNames = countiesRows.map((r) => r.name).join("، ") || "مقرر";
  const { queueSms } = await import("@/lib/messaging");
  const message = (await resolveSmsTemplateSafe("class_invite", { topic: cls.topic, groups, counties: countyNames, app: "سامانه نور" }))
    ?? `کاربر گرامی، دورهٔ آموزشی «${cls.topic}» ویژهٔ گروه ${groups} در شهرستان ${countyNames} برگزار می‌شود. جهت مشاهدهٔ جزئیات و ثبت‌نام به سامانه نور مراجعه کنید.`;
  for (const person of audience) {
    if (summary.queued >= MAX_CLASS_SMS_BATCH) break;
    if (person.registered) continue;
    if (!person.phone) { summary.withoutPhone++; continue; }
    await db.transaction(async (tx) => {
      // ضدتکرار: ردیف لاگ فقط بار اول ساخته می‌شود (ایندکس یکتای کلاس+فرد+نوع)
      const fresh = await logClassSms(tx, {
        classId, userId: person.userId, kind: "invite", phone: person.phone!, message, createdBy: actor?.id ?? null,
      });
      if (!fresh) { summary.alreadySent++; return; }
      await queueSms(tx, person.phone!, message, { userId: person.userId ?? null, category: "class", templateKey: "class_invite" });
      if (person.userId) {
        await tx.insert(notifications).values({
          userId: person.userId, title: "دعوت به ثبت‌نام در کلاس",
          body: `دورهٔ آموزشی «${cls.topic}» برای گروه و شهرستان شما فعال شد؛ برای ثبت‌نام به بخش «کلاس‌ها و دوره‌های آموزشی» مراجعه کنید.`,
          applicationId: null,
        });
      }
      summary.queued++;
    });
  }
  await audit(actor?.id ?? null, "send_class_invite_sms", "class", classId, `eligible=${summary.eligible};queued=${summary.queued};withoutPhone=${summary.withoutPhone};already=${summary.alreadySent}`);
  summary.ok = true;
  return summary;
}

async function resolveSmsTemplateSafe(key: string, vars: Record<string, string>): Promise<string | null> {
  const { resolveSmsTemplate } = await import("@/lib/sms-admin");
  const t = await resolveSmsTemplate(key, vars);
  return t?.body ?? null;
}

export async function deliverQueued(): Promise<void> {
  const { deliverOutbox } = await import("@/lib/messaging");
  await deliverOutbox();
}

// ---------- گزینه‌های فرم ----------

export async function listSpecialtyOptions() {
  return db.select({ id: specialties.id, title: specialties.title }).from(specialties).orderBy(asc(specialties.title));
}
export async function listTeacherOptions() {
  // حساب‌های فعال به‌عنوان مدرس (اختیار مدرسِ حساب‌دار برای پنل تدریس)
  return db.select({ id: users.id, fullName: users.fullName, phone: users.phone })
    .from(users).where(eq(users.active, true)).orderBy(asc(users.fullName)).limit(200);
}

// ---------- چرخهٔ ثبت‌نام (امن در برابر درخواست هم‌زمان) ----------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** تراکنش درایو فقط متدهای پایه را برای helperها لازم دارد؛ $client متعلق به db است نه تراکنش. */
type DbApi = Omit<typeof db, "$client" | "_">;
const asDb = (tx: Tx) => tx as unknown as DbApi;
export type ClassFlowResult = { ok: boolean; error?: string; full?: boolean };

/** دعوت نفر بعدی لیست انتظار درون یک تراکنش: گذار waiting→invited خودش ایدمپوتنس است. */
async function inviteNextInTx(tx: Tx, classId: string, actorId: string | null): Promise<boolean> {
  const [cls] = await tx.select({ topic: classes.topic, respondHours: classes.waitlistRespondHours })
    .from(classes).where(eq(classes.id, classId)).for("update").limit(1);
  if (!cls) return false;
  const head = await waitlistHead(tx, classId);
  if (!head) return false;
  const now = new Date();
  const deadline = new Date(now.getTime() + cls.respondHours * 3600_000);
  const updated = await tx.update(classWaitlist).set({ status: "invited", invitedAt: now, respondDeadline: deadline })
    .where(and(eq(classWaitlist.id, head.id), eq(classWaitlist.status, "waiting"))).returning({ id: classWaitlist.id });
  if (!updated.length) return false;
  const [person] = await tx.select({ phone: users.phone, fullName: users.fullName })
    .from(users).where(eq(users.id, head.userId)).limit(1);
  if (person?.phone) {
    const { queueSms } = await import("@/lib/messaging");
    const message = (await resolveSmsTemplateSafe("class_waitlist_invite", {
      topic: cls.topic,
      deadline: `${faDate(deadline, true)} ساعت ${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`,
    })) ?? `سامانه نور: یک ظرفیت در کلاس «${cls.topic}» آزاد شد و نوبت شما رسید. تا پایان مهلت اعلام‌شده از پنل کاربری خود ثبت‌نام را نهایی کنید.`;
    await queueSms(tx, person.phone, message, { userId: head.userId, category: "class", templateKey: "class_waitlist_invite" });
    await tx.insert(classSmsLog).values({
      classId, userId: head.userId, kind: "waitlist_invite", phone: person.phone, message, createdBy: actorId,
    });
  }
  await tx.insert(notifications).values({
    userId: head.userId, title: "دعوت از لیست انتظار کلاس",
    body: `نوبت شما برای ثبت‌نام در کلاس «${cls.topic}» رسید؛ تا ${faDate(deadline, true)} از بخش «کلاس‌ها و دوره‌های آموزشی» ثبت‌نام را نهایی کنید.`,
    applicationId: null,
  });
  await tx.insert(auditLogs).values({ actorId, action: "waitlist_invite", targetType: "class", targetId: classId, detail: `waitlistEntry=${head.id};position=${head.position}` });
  return true;
}

async function refreshCapacityStatus(tx: Tx, classId: string): Promise<void> {
  const [cls] = await tx.select({ status: classes.status, capacity: classes.capacity }).from(classes).where(eq(classes.id, classId)).for("update").limit(1);
  if (!cls) return;
  const next = resolveCapacityStatus(cls.status, await classRegisteredCount(asDb(tx), classId), cls.capacity);
  if (next !== cls.status) await tx.update(classes).set({ status: next, updatedAt: new Date() }).where(eq(classes.id, classId));
}

/** ثبت‌نام کاربر در کلاس: قفل ردیف کلاس، کنترل ظرفیت و مهلت، ضدتکرار با ایندکس یکتا. */
export async function registerForClass(user: { id: string }, classId: string, options: { source?: "self" | "waitlist" | "admin"; skipEligibility?: boolean } = {}): Promise<ClassFlowResult> {
  const eligibility = options.skipEligibility ? { ok: true } : await isUserEligible(user, classId);
  if (!eligibility.ok) return { ok: false, error: eligibility.reason };
  const result = await db.transaction(async (tx) => {
    const [cls] = await tx.select({ status: classes.status, capacity: classes.capacity, registrationDeadline: classes.registrationDeadline })
      .from(classes).where(eq(classes.id, classId)).for("update").limit(1);
    if (!cls) return { ok: false, error: "کلاس یافت نشد." };
    if (cls.status !== "active" && cls.status !== "full") return { ok: false, error: "ثبت‌نام در این کلاس ممکن نیست (وضعیت کلاس مجاز نیست)." };
    if (cls.registrationDeadline && cls.registrationDeadline.getTime() < Date.now()) return { ok: false, error: "مهلت ثبت‌نام این کلاس گذشته است." };
    const [existing] = await tx.select({ id: classRegistrations.id }).from(classRegistrations)
      .where(and(eq(classRegistrations.classId, classId), eq(classRegistrations.userId, user.id), eq(classRegistrations.status, "registered"))).limit(1);
    if (existing) return { ok: false, error: "شما قبلاً در این کلاس ثبت‌نام کرده‌اید." };
    const count = await classRegisteredCount(asDb(tx), classId);
    if (cls.capacity > 0 && count >= cls.capacity) return { ok: false, full: true, error: "ظرفیت این کلاس تکمیل شده است؛ می‌توانید در لیست انتظار نام‌نویسی کنید." };
    await tx.insert(classRegistrations).values({ classId, userId: user.id, source: options.source ?? "self" });
    if (cls.capacity > 0 && count + 1 >= cls.capacity) {
      await tx.update(classes).set({ status: "full", updatedAt: new Date() }).where(eq(classes.id, classId));
    }
    return { ok: true };
  });
  if (result.ok) await audit(user.id, "class_register", "class", classId, `source=${options.source ?? "self"}`);
  return result;
}

/** ورود به لیست انتظار: فقط وقتی ظرفیت تکمیل است. */
export async function joinWaitlist(user: { id: string }, classId: string): Promise<ClassFlowResult> {
  const eligibility = await isUserEligible(user, classId);
  if (!eligibility.ok) return { ok: false, error: eligibility.reason };
  const result = await db.transaction(async (tx) => {
    const [cls] = await tx.select({ status: classes.status, capacity: classes.capacity, registrationDeadline: classes.registrationDeadline })
      .from(classes).where(eq(classes.id, classId)).for("update").limit(1);
    if (!cls) return { ok: false, error: "کلاس یافت نشد." };
    if (!["active", "full"].includes(cls.status)) return { ok: false, error: "لیست انتظار این کلاس باز نیست." };
    if (cls.registrationDeadline && cls.registrationDeadline.getTime() < Date.now()) return { ok: false, error: "مهلت ثبت‌نام این کلاس گذشته است." };
    const count = await classRegisteredCount(asDb(tx), classId);
    if (cls.capacity > 0 && count < cls.capacity) return { ok: false, error: "هنوز ظرفیت آزاد وجود دارد؛ مستقیماً ثبت‌نام کنید." };
    const [existing] = await tx.select({ id: classWaitlist.id }).from(classWaitlist)
      .where(and(eq(classWaitlist.classId, classId), eq(classWaitlist.userId, user.id), sql`${classWaitlist.status} in ('waiting','invited')`)).limit(1);
    if (existing) return { ok: false, error: "شما هم‌اکنون در لیست انتظار این کلاس هستید." };
    const [maxRow] = await tx.select({ maxPos: sql<number>`coalesce(max(${classWaitlist.position}), 0)` }).from(classWaitlist)
      .where(and(eq(classWaitlist.classId, classId), sql`${classWaitlist.status} in ('waiting','invited','converted')`));
    await tx.insert(classWaitlist).values({ classId, userId: user.id, position: Number(maxRow?.maxPos ?? 0) + 1 });
    return { ok: true };
  });
  if (result.ok) await audit(user.id, "class_waitlist_join", "class", classId);
  return result;
}

/** لغو ثبت‌نام توسط کاربر: صندلی آزاد و نفر اول لیست انتظار دعوت می‌شود. */
export async function cancelRegistration(user: { id: string }, classId: string, reason?: string): Promise<ClassFlowResult> {
  const result = await db.transaction(async (tx) => {
    const [cls] = await tx.select({ status: classes.status }).from(classes).where(eq(classes.id, classId)).for("update").limit(1);
    if (!cls) return { ok: false, error: "کلاس یافت نشد." };
    if (["held", "cancelled"].includes(cls.status)) return { ok: false, error: "لغو ثبت‌نام در این مرحله ممکن نیست." };
    const [reg] = await tx.select({ id: classRegistrations.id }).from(classRegistrations)
      .where(and(eq(classRegistrations.classId, classId), eq(classRegistrations.userId, user.id), eq(classRegistrations.status, "registered"))).limit(1);
    if (!reg) return { ok: false, error: "ثبت‌نام فعالی در این کلاس ندارید." };
    await tx.update(classRegistrations).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason?.trim() || "انصراف کاربر" }).where(eq(classRegistrations.id, reg.id));
    await refreshCapacityStatus(tx, classId);
    await inviteNextInTx(tx, classId, user.id);
    return { ok: true };
  });
  if (result.ok) await audit(user.id, "class_cancel_registration", "class", classId, reason || "انصراف کاربر");
  return result;
}

/** پاسخ به دعوت لیست انتظار: نهایی‌کردن ثبت‌نام یا انصراف (انتقال نوبت به بعدی). */
export async function respondToInvitation(user: { id: string }, classId: string, accept: boolean): Promise<ClassFlowResult> {
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx.select({ id: classWaitlist.id, respondDeadline: classWaitlist.respondDeadline })
      .from(classWaitlist).where(and(eq(classWaitlist.classId, classId), eq(classWaitlist.userId, user.id), eq(classWaitlist.status, "invited"))).limit(1);
    if (!invitation) return { ok: false, error: "دعوت فعالی برای شما در این کلاس نیست." };
    const [cls] = await tx.select({ status: classes.status, capacity: classes.capacity })
      .from(classes).where(eq(classes.id, classId)).for("update").limit(1);
    if (!cls || !["active", "full"].includes(cls.status)) return { ok: false, error: "این کلاس دیگر قابل ثبت‌نام نیست." };
    if (accept) {
      const count = await classRegisteredCount(asDb(tx), classId);
      if (cls.capacity > 0 && count >= cls.capacity) return { ok: false, full: true, error: "ظرفیت پیش از پاسخ شما پر شد؛ رتبهٔ شما در لیست انتظار حفظ می‌شود." };
      await tx.insert(classRegistrations).values({ classId, userId: user.id, source: "waitlist" });
      if (cls.capacity > 0 && count + 1 >= cls.capacity) {
        await tx.update(classes).set({ status: "full", updatedAt: new Date() }).where(eq(classes.id, classId));
      }
      await tx.update(classWaitlist).set({ status: "converted", respondedAt: new Date() }).where(eq(classWaitlist.id, invitation.id));
      return { ok: true };
    }
    await tx.update(classWaitlist).set({ status: "declined", respondedAt: new Date() }).where(eq(classWaitlist.id, invitation.id));
    await inviteNextInTx(tx, classId, user.id);
    return { ok: true };
  });
  if (result.ok) await audit(user.id, accept ? "class_waitlist_accept" : "class_waitlist_decline", "class", classId);
  return result;
}

/** دعوت دستی نفر بعدی لیست انتظار توسط ادمین (مثلاً پس از حذف ردیف). */
export async function inviteNextWaitlist(classId: string, actorId: string | null): Promise<ClassFlowResult> {
  const result = await db.transaction(async (tx) => { return { ok: await inviteNextInTx(tx, classId, actorId) }; });
  if (!result.ok) return { ok: false, error: "نفر در انتظاری برای دعوت وجود ندارد." };
  return { ok: true };
}

/** تأیید/رد ثبت‌نام توسط ادمین. */
export async function decideRegistration(actor: SessionUser, registrationId: string, approve: boolean, note?: string): Promise<ClassFlowResult> {
  const result = await db.transaction(async (tx) => {
    const [reg] = await tx.select({ id: classRegistrations.id, classId: classRegistrations.classId, userId: classRegistrations.userId, status: classRegistrations.status })
      .from(classRegistrations).where(eq(classRegistrations.id, registrationId)).for("update").limit(1);
    if (!reg) return { ok: false, error: "ثبت‌نام یافت نشد." };
    const [cls] = await tx.select({ capacity: classes.capacity }).from(classes).where(eq(classes.id, reg.classId)).for("update").limit(1);
    if (approve) {
      if (reg.status !== "registered") return { ok: false, error: "فقط ثبت‌نام فعال قابل تأیید است." };
      const count = await classRegisteredCount(asDb(tx), reg.classId);
      if (cls && cls.capacity > 0 && count > cls.capacity) return { ok: false, error: "ظرفیت کلاس پیش از تأیید پر شده است." };
      await tx.update(classRegistrations).set({ approvedBy: actor.id, approvedAt: new Date(), decisionNote: note?.trim() || null }).where(eq(classRegistrations.id, reg.id));
    } else {
      if (reg.status !== "registered") return { ok: false, error: "فقط ثبت‌نام فعال قابل رد است." };
      await tx.update(classRegistrations).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: note?.trim() || "رد توسط ادمین", approvedBy: actor.id, approvedAt: new Date() })
        .where(eq(classRegistrations.id, reg.id));
      await refreshCapacityStatus(tx, reg.classId);
      await inviteNextInTx(tx, reg.classId, actor.id);
    }
    return { ok: true };
  });
  if (result.ok) await audit(actor.id, approve ? "class_registration_approve" : "class_registration_reject", "class_registration", registrationId, note);
  return result;
}

/** انقضای دعوت‌های پاسخ‌نداده (کرون): عدم پاسخ ثبت و نوبت به نفر بعدی می‌رسد. */
export async function expireWaitlistInvitations(now = new Date()): Promise<{ expired: number; invitedNext: number }> {
  const due = await db.select({ id: classWaitlist.id, classId: classWaitlist.classId, userId: classWaitlist.userId })
    .from(classWaitlist).where(and(eq(classWaitlist.status, "invited"), sql`${classWaitlist.respondDeadline} is not null and ${classWaitlist.respondDeadline} <= ${now.toISOString()}::timestamptz`))
    .limit(MAX_CLASS_SMS_BATCH);
  let invitedNext = 0;
  for (const row of due) {
    await db.transaction(async (tx) => {
      const updated = await tx.update(classWaitlist).set({ status: "no_response", respondedAt: new Date() })
        .where(and(eq(classWaitlist.id, row.id), eq(classWaitlist.status, "invited"))).returning({ id: classWaitlist.id });
      if (!updated.length) return;
      await audit(null, "class_waitlist_expired", "class", row.classId, `entry=${row.id}`);
      if (await inviteNextInTx(tx, row.classId, null)) invitedNext++;
    });
  }
  return { expired: due.length, invitedNext };
}

// ---------- پیامک‌های جریان کلاس ----------

/** یادآور پیش از برگزاری (کرون یا دکمهٔ ادمین): فقط ثبت‌نام‌کنندگان فعال. */
export async function sendClassReminders(actor: SessionUser | null, classIds?: string[], now = new Date()): Promise<{ classes: number; queued: number; withoutPhone: number; alreadySent: number }> {
  const conditions: SQL[] = [sql`${classes.status} in ('active','full')`];
  const selected = classIds?.filter(isUuid);
  if (selected?.length) conditions.push(inArray(classes.id, selected));
  const candidates = await db.select({
    id: classes.id, topic: classes.topic, startsOn: classes.startsOn, startTime: classes.startTime, location: classes.location,
  }).from(classes).where(and(...conditions)).limit(MAX_CLASS_SMS_BATCH);
  const summary = { classes: 0, queued: 0, withoutPhone: 0, alreadySent: 0 };
  const { queueSms } = await import("@/lib/messaging");
  for (const cls of candidates) {
    const [row] = await db.select({ reminderHours: classes.reminderHours }).from(classes).where(eq(classes.id, cls.id));
    if (!row || !isReminderDue(cls.startsOn, cls.startTime, row.reminderHours, now)) continue;
    if (actor && !(await canManageClass(actor, cls.id))) continue;
    const participants = await db.select({
      userId: classRegistrations.userId, phone: users.phone,
    }).from(classRegistrations).innerJoin(users, eq(users.id, classRegistrations.userId))
      .where(and(eq(classRegistrations.classId, cls.id), eq(classRegistrations.status, "registered")));
    const message = (await resolveSmsTemplateSafe("class_reminder", {
      topic: cls.topic, date: faSchedule(cls.startsOn, cls.startTime),
      place: cls.location ? ` در محل «${cls.location}»` : "",
    })) ?? `سامانه نور: یادآور برگزاری کلاس «${cls.topic}» در تاریخ ${faSchedule(cls.startsOn, cls.startTime)}${cls.location ? ` در محل «${cls.location}»` : ""}.`;
    for (const p of participants) {
      if (!p.phone) { summary.withoutPhone++; continue; }
      await db.transaction(async (tx) => {
        const fresh = await logClassSms(tx, { classId: cls.id, userId: p.userId, kind: "reminder", phone: p.phone!, message, createdBy: actor?.id ?? null });
        if (!fresh) { summary.alreadySent++; return; }
        await queueSms(tx, p.phone!, message, { userId: p.userId, category: "class", templateKey: "class_reminder" });
        await tx.insert(notifications).values({
          userId: p.userId, title: "یادآور کلاس",
          body: `کلاس «${cls.topic}» در تاریخ ${faSchedule(cls.startsOn, cls.startTime)}${cls.location ? ` در محل «${cls.location}»` : ""} برگزار می‌شود.`,
          applicationId: null,
        });
        summary.queued++;
      });
    }
    summary.classes++;
  }
  await audit(actor?.id ?? null, "send_class_reminder_sms", "class", classIds?.[0], `classes=${summary.classes};queued=${summary.queued};already=${summary.alreadySent}`);
  return summary;
}

/** اطلاع‌رسانی تغییر (زمان/مکان/...) به ثبت‌نام‌کنندگان فعال. */
export async function notifyClassChange(classId: string, actor: SessionUser, changeText: string): Promise<{ ok: boolean; error?: string; queued: number; withoutPhone: number }> {
  const [cls] = await db.select({ topic: classes.topic }).from(classes).where(eq(classes.id, classId));
  if (!cls) return { ok: false, error: "کلاس یافت نشد.", queued: 0, withoutPhone: 0 };
  const summary = { ok: true, queued: 0, withoutPhone: 0 };
  const participants = await db.select({ userId: classRegistrations.userId, phone: users.phone })
    .from(classRegistrations).innerJoin(users, eq(users.id, classRegistrations.userId))
    .where(and(eq(classRegistrations.classId, classId), eq(classRegistrations.status, "registered")));
  const { queueSms } = await import("@/lib/messaging");
  const message = (await resolveSmsTemplateSafe("class_change", { topic: cls.topic, change: changeText }))
    ?? `سامانه نور: در کلاس «${cls.topic}» تغییر ایجاد شد؛ ${changeText}. جزئیات کامل در سامانه قابل مشاهده است.`;
  for (const p of participants) {
    if (!p.phone) { summary.withoutPhone++; continue; }
    await db.transaction(async (tx) => {
      await tx.insert(classSmsLog).values({ classId, userId: p.userId, kind: "change", phone: p.phone!, message, createdBy: actor.id });
      await queueSms(tx, p.phone!, message, { userId: p.userId, category: "class", templateKey: "class_change" });
      await tx.insert(notifications).values({ userId: p.userId, title: "تغییر در کلاس", body: `کلاس «${cls.topic}»: ${changeText}`, applicationId: null });
      summary.queued++;
    });
  }
  await audit(actor.id, "send_class_change_sms", "class", classId, changeText);
  return summary;
}

/** لغو کلاس: وضعیت، ثبت‌نام‌ها و لیست انتظار بسته و به همه اطلاع‌رسانی می‌شود. */
export async function cancelClass(actor: SessionUser, classId: string, reason?: string): Promise<ClassFlowResult> {
  const summary = { ok: false, notified: 0 };
  const [cls] = await db.select({ topic: classes.topic }).from(classes).where(eq(classes.id, classId));
  if (!cls) return { ok: false, error: "کلاس یافت نشد." };
  await db.transaction(async (tx) => {
    await tx.update(classes).set({ status: "cancelled", updatedAt: new Date() }).where(eq(classes.id, classId));
    await tx.update(classRegistrations).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason?.trim() || "لغو کلاس" })
      .where(and(eq(classRegistrations.classId, classId), eq(classRegistrations.status, "registered")));
    await tx.update(classWaitlist).set({ status: "cancelled", respondedAt: new Date() })
      .where(and(eq(classWaitlist.classId, classId), sql`${classWaitlist.status} in ('waiting','invited')`));
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "class_cancel", targetType: "class", targetId: classId, detail: reason || "لغو کلاس" });
  });
  const affected = await db.select({ userId: classRegistrations.userId, phone: users.phone })
    .from(classRegistrations).innerJoin(users, eq(users.id, classRegistrations.userId))
    .where(and(eq(classRegistrations.classId, classId), sql`${classRegistrations.cancelReason} = ${reason?.trim() || "لغو کلاس"}`));
  const { queueSms } = await import("@/lib/messaging");
  const message = (await resolveSmsTemplateSafe("class_cancel", { topic: cls.topic, reason: reason ? `${reason.trim()} ` : "" }))
    ?? `سامانه نور: کلاس «${cls.topic}» ${reason ? `${reason.trim()} ` : ""}لغو شد. در صورت برگزاری دورهٔ جایگزین اطلاع‌رسانی می‌شود.`;
  for (const p of affected) {
    if (!p.phone) continue;
    await db.transaction(async (tx) => {
      await tx.insert(classSmsLog).values({ classId, userId: p.userId, kind: "cancel", phone: p.phone!, message, createdBy: actor.id });
      await queueSms(tx, p.phone!, message, { userId: p.userId, category: "class", templateKey: "class_cancel" });
      await tx.insert(notifications).values({ userId: p.userId, title: "لغو کلاس", body: `کلاس «${cls.topic}» لغو شد. ${reason ?? ""}`, applicationId: null });
      summary.notified++;
    });
  }
  summary.ok = true;
  return { ok: true };
}

/** ارسال دستی ادمین به یک ثبت‌نام‌کننده (ارسال مجدد پیامک دعوت/اطلاع). */
export async function sendManualSms(actor: SessionUser, classId: string, userId: string, text: string): Promise<ClassFlowResult> {
  const [person] = await db.select({ phone: users.phone, fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1);
  const phone = person?.phone;
  if (!phone) return { ok: false, error: "شماره موبایلی برای این کاربر ثبت نشده است." };
  const { queueSms } = await import("@/lib/messaging");
  await db.transaction(async (tx) => {
    await tx.insert(classSmsLog).values({ classId, userId, kind: "manual", phone, message: text, createdBy: actor.id });
    await queueSms(tx, phone, text, { userId, category: "class" });
  });
  await audit(actor.id, "send_class_manual_sms", "class", classId, `to=${person.fullName}`);
  return { ok: true };
}

// ---------- ثبت حضور و غیاب ----------

export type AttendanceEntryInput = { userId: string; status: AttendanceStatus; notes?: string };

/** ثبت/ویرایش حضور و غیاب یک جلسه: هر تغییر با سوابق (قدیم/جدید/ثبت‌کننده) ثبت می‌شود. */
export async function saveAttendance(actor: SessionUser, classId: string, sessionId: string, entries: AttendanceEntryInput[]): Promise<ClassFlowResult> {
  if (!entries.length) return { ok: false, error: "هیچ ردیفی برای ثبت ارسال نشده است." };
  const [session] = await db.select({ id: classSessions.id, sessionNo: classSessions.sessionNo })
    .from(classSessions).where(and(eq(classSessions.id, sessionId), eq(classSessions.classId, classId))).limit(1);
  if (!session) return { ok: false, error: "جلسه یافت نشد." };
  for (const entry of entries) {
    if (!ATTENDANCE_STATUSES.includes(entry.status)) return { ok: false, error: "وضعیت حضور نامعتبر است." };
    if (!isUuid(entry.userId)) return { ok: false, error: "شناسه کاربر نامعتبر است." };
  }
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const [existing] = await tx.select({ id: classAttendance.id, status: classAttendance.status, notes: classAttendance.notes })
        .from(classAttendance).where(and(eq(classAttendance.sessionId, sessionId), eq(classAttendance.userId, entry.userId))).limit(1);
      if (existing) {
        if (existing.status === entry.status && (existing.notes ?? "") === (entry.notes ?? "")) continue;
        await tx.update(classAttendance).set({ status: entry.status, notes: entry.notes ?? null, recordedBy: actor.id, updatedAt: new Date() })
          .where(eq(classAttendance.id, existing.id));
        await tx.insert(classAttendanceLogs).values({
          attendanceId: existing.id, oldStatus: existing.status, newStatus: entry.status,
          note: entry.notes ?? null, changedBy: actor.id,
        });
      } else {
        const [created] = await tx.insert(classAttendance).values({
          classId, sessionId, userId: entry.userId, status: entry.status, notes: entry.notes ?? null, recordedBy: actor.id,
        }).returning({ id: classAttendance.id });
        await tx.insert(classAttendanceLogs).values({
          attendanceId: created.id, oldStatus: null, newStatus: entry.status, note: entry.notes ?? null, changedBy: actor.id,
        });
      }
      changed++;
    }
    await tx.insert(auditLogs).values({
      actorId: actor.id, action: "class_attendance_save", targetType: "class_session", targetId: sessionId,
      detail: `class=${classId};session=${session.sessionNo};rows=${changed}`,
    });
  });
  return { ok: true };
}

// ---------- مدیریت لیست انتظار توسط ادمین ----------

/** جابه‌جایی یک ردیف در لیست انتظار (اولویت‌دهی ادمین): تبادل با همسایهٔ قبلی/بعدی. */
export async function moveWaitlistEntry(actor: SessionUser, classId: string, entryId: string, direction: "up" | "down"): Promise<ClassFlowResult> {
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: classWaitlist.id }).from(classWaitlist)
      .where(and(eq(classWaitlist.classId, classId), sql`${classWaitlist.status} in ('waiting','invited')`))
      .orderBy(asc(classWaitlist.position), asc(classWaitlist.createdAt));
    const index = rows.findIndex((r) => r.id === entryId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= rows.length) return { ok: false, error: "جابه‌جایی ممکن نیست." };
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (let i = 0; i < rows.length; i++) {
      await tx.update(classWaitlist).set({ position: i + 1 }).where(eq(classWaitlist.id, rows[i].id));
    }
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "class_waitlist_move", targetType: "class", targetId: classId, detail: `entry=${entryId};dir=${direction}` });
    return { ok: true };
  });
  return result;
}

/** حذف فرد از لیست انتظار (حالت «حذف‌شده»). */
export async function removeWaitlistEntry(actor: SessionUser, classId: string, entryId: string): Promise<ClassFlowResult> {
  const updated = await db.update(classWaitlist).set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(classWaitlist.id, entryId), eq(classWaitlist.classId, classId), sql`${classWaitlist.status} in ('waiting','invited')`))
    .returning({ id: classWaitlist.id });
  if (!updated.length) return { ok: false, error: "ردیفی حذف نشد." };
  await audit(actor.id, "class_waitlist_remove", "class", classId, `entry=${entryId}`);
  return { ok: true };
}

// ---------- داشبورد آماری ----------

export type ClassDashboardStats = Awaited<ReturnType<typeof classDashboard>>;

export async function classDashboard(user: MaybeSessionUser, filters: { status?: string; countyId?: number; specialtyId?: number } = {}) {
  const rows = await listClasses(user, { ...filters, limit: 300 });
  const scopeSql = classScopeCondition(user);
  const byStatus: Record<ClassStatus, number> = { draft: 0, active: 0, full: 0, cancelled: 0, held: 0 };
  let registrations = 0, waitlist = 0, sms = 0, eligible = 0, capacitySum = 0, remainingSum = 0;
  for (const r of rows) {
    byStatus[r.status]++;
    registrations += Number(r.registeredCount); waitlist += Number(r.waitlistCount);
    sms += Number(r.smsCount); eligible += Number(r.eligibleCount);
    capacitySum += r.capacity; remainingSum += Math.max(0, r.capacity - Number(r.registeredCount));
  }
  const [cancellationsRow] = await db.select({ total: sql<number>`count(*)` }).from(classRegistrations)
    .where(and(eq(classRegistrations.status, "cancelled"), sql`${classRegistrations.classId} in (select id from ${classes} where ${scopeSql})`));
  const attendanceRows = await db.select({
    classId: classAttendance.classId,
    present: sql<number>`count(*) filter (where ${classAttendance.status} = 'present')`,
    absent: sql<number>`count(*) filter (where ${classAttendance.status} = 'absent')`,
    late: sql<number>`count(*) filter (where ${classAttendance.status} = 'late')`,
    excused: sql<number>`count(*) filter (where ${classAttendance.status} = 'excused')`,
    percent: sql<number>`round(100.0 * count(*) filter (where ${classAttendance.status} in ('present','late')) / greatest(count(*), 1))`,
  }).from(classAttendance).where(sql`${classAttendance.classId} in (select id from ${classes} where ${scopeSql})`).groupBy(classAttendance.classId);
  const attendance = attendanceRows.reduce((acc, r) => {
    acc.present += Number(r.present); acc.absent += Number(r.absent); acc.late += Number(r.late); acc.excused += Number(r.excused);
    acc.percentSum += Number(r.percent); return acc;
  }, { present: 0, absent: 0, late: 0, excused: 0, percentSum: 0 });
  const attendanceAvgPercent = attendanceRows.length ? Math.round(attendance.percentSum / attendanceRows.length) : 0;
  const byCounty = await db.select({
    name: counties.name, total: sql<number>`count(*)`,
  }).from(classRegistrations)
    .innerJoin(sql`classes_counties cc`, sql`cc.class_id = ${classRegistrations.classId}`)
    .innerJoin(counties, sql`${counties.id} = cc.county_id`)
    .where(and(eq(classRegistrations.status, "registered"), sql`${classRegistrations.classId} in (select id from ${classes} where ${scopeSql})`))
    .groupBy(counties.name).orderBy(desc(sql`count(*)`)).limit(15);
  const bySpecialty = await db.select({
    name: specialties.title, total: sql<number>`count(*)`,
  }).from(classRegistrations)
    .innerJoin(sql`classes_specialties cs`, sql`cs.class_id = ${classRegistrations.classId}`)
    .innerJoin(specialties, sql`${specialties.id} = cs.specialty_id`)
    .where(and(eq(classRegistrations.status, "registered"), sql`${classRegistrations.classId} in (select id from ${classes} where ${scopeSql})`))
    .groupBy(specialties.title).orderBy(desc(sql`count(*)`)).limit(15);
  return {
    rows, byStatus, totals: {
      all: rows.length, registrations, waitlist, sms, eligible, capacitySum, remainingSum,
      cancellations: Number(cancellationsRow?.total ?? 0),
      fullClasses: byStatus.full,
    },
    attendance: {
      present: attendance.present, absent: attendance.absent, late: attendance.late, excused: attendance.excused,
      avgPercent: attendanceAvgPercent,
    },
    byCounty: byCounty.map((r) => ({ name: r.name, total: Number(r.total) })),
    bySpecialty: bySpecialty.map((r) => ({ name: r.name, total: Number(r.total) })),
  };
}

/** سوابق اخیر فعالیت‌های کلاس‌ها (پانوشت صفحهٔ مدیریت). */
export async function listRecentClassActivity(limit = 10) {
  return db.select({
    id: auditLogs.id, action: auditLogs.action, detail: auditLogs.detail, createdAt: auditLogs.createdAt,
    actorName: users.fullName,
  }).from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(sql`${auditLogs.targetType} in ('class','class_session','class_registration')`)
    .orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ---------- کرون ----------

/** ورودی کرون کلاس‌ها: انقضای دعوت‌ها + یادآورها + ارسال صف پیامک. */
export async function runAutomatedClassSweeps(now = new Date()) {
  const expired = await expireWaitlistInvitations(now);
  const reminders = await sendClassReminders(null, undefined, now);
  await deliverQueued();
  return { expired, reminders };
}
