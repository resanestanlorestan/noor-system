// آزمون‌های الحاقیهٔ ۲.۱۹.۰ — سیستم مدیریت کلاس‌ها، دوره‌های آموزشی و ثبت‌نام
// هوشمند روی دیتابیس واقعی noor_feature:
// ۱) توابع خالص (درصد حضور، وضعیت ظرفیت، پنجرهٔ یادآور، مهلت پاسخ)؛
// ۲) جامعهٔ هدف: فقط پروندهٔ تکمیل‌شده + هم‌خوانی شهرستان + گروه؛
// ۳) چرخهٔ ثبت‌نام: ظرفیت، ضدتکرار، عدم واجد شرایط، مهلت ثبت‌نام؛
// ۴) لیست انتظار: نوبت FIFO، دعوت خودکار با پیامک، پاسخ/عدم پاسخ و انتقال نوبت؛
// ۵) دعوت فعال‌سازی با ضدتکرار (دعوت دوباره = ارسال تازه نمی‌سازد)؛
// ۶) حضور و غیاب با سوابق تغییر و درصد حضور؛
// ۷) دسترسی‌ها (مدیریت جغرافیایی، مدرس فقط کلاس خودش) و داشبورد آماری.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, featureSeed, type Fixture } from "./feature/helpers";
import {
  attendancePercent, attendanceTally, isReminderDue, isRespondDeadlinePassed, listEligibleAudience,
  listSessions, resolveCapacityStatus, validTimeRange, canManageClass, canTakeAttendance,
  cancelRegistration, classDashboard, expireWaitlistInvitations, isUserEligible, joinWaitlist,
  listClassAttendanceSummary, listTeachingClasses, listUserClasses, registerForClass,
  respondToInvitation, saveAttendance, sendClassInvites,
} from "@/lib/classes";
import { isUuid } from "@/lib/workflow-utils";
import type { MaybeSessionUser, SessionUser } from "@/lib/auth";

let f: Fixture;
beforeAll(async () => { f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

// شماره موبایل یکتا در هر اجرا (app_users.phone یکتاست)
const runSuffix = String(Date.now()).slice(-5);
let seq = 0;
const nextMobile = () => `0912${runSuffix}${String(++seq).padStart(2, "0")}`;

/** حساب کاربری تازه با پروندهٔ تکمیل‌شده در شهرستان و تخصص مشخص. */
async function makeEligibleUser(opts: { countyId: number; specialtyId: number; submitted?: boolean; status?: "pending" | "draft" | "rejected" }): Promise<{ id: string }> {
  const mobile = nextMobile();
  const [user] = await db.insert(s.users).values({
    fullName: `آزمون کلاس ${++seq}`, phone: mobile, passwordHash: "scrypt$00000000000000000000000000000000$" + "00".repeat(64),
    role: "activist", active: true,
  }).returning({ id: s.users.id });
  const [activist] = await db.insert(s.activists).values({
    userId: user.id, firstName: "نام", lastName: `کلاسی${seq}`, phone: mobile,
    provinceId: f.tehranProvinceId, countyId: opts.countyId,
  }).returning({ id: s.activists.id });
  await db.insert(s.activistSpecialties).values({ activistId: activist.id, specialtyId: opts.specialtyId });
  const submitted = opts.submitted !== false;
  await db.insert(s.applications).values({
    activistId: activist.id, status: opts.status ?? "pending", source: "self",
    createdBy: f.users.super.id, submittedAt: submitted ? new Date() : null,
  });
  return user;
}

/** کلاس با هدف‌گیری مشخص؛ خروجی شناسهٔ کلاس. */
async function makeClass(opts: { countyIds: number[]; specialtyIds: number[]; capacity?: number; status?: "draft" | "active" | "full"; startsOn?: string; deadline?: Date; respondHours?: number; teacherUserId?: string | null }): Promise<string> {
  const classId = crypto.randomUUID();
  await db.insert(s.classes).values({
    id: classId, title: `کلاس آزمون ${seq + 1}`, topic: `موضوع ${++seq}`,
    status: opts.status ?? "active", formatType: "in_person", capacity: opts.capacity ?? 2,
    startsOn: opts.startsOn ?? "2026-12-01", startTime: "08:00", endTime: "10:00",
    location: "سالن آزمون", teacherName: "استاد آزمون", teacherUserId: opts.teacherUserId ?? null,
    registrationDeadline: opts.deadline ?? null, reminderHours: 48,
    waitlistRespondHours: opts.respondHours ?? 24, createdBy: f.users.super.id,
  });
  await db.insert(s.classesCounties).values(opts.countyIds.map((countyId) => ({ classId, countyId })));
  await db.insert(s.classesSpecialties).values(opts.specialtyIds.map((specialtyId) => ({ classId, specialtyId })));
  return classId;
}

async function smsRows(classId: string, kind: "invite" | "waitlist_invite") {
  return db.select().from(s.classSmsLog).where(and(eq(s.classSmsLog.classId, classId), eq(s.classSmsLog.kind, kind)));
}
async function outboxCount(templateKey: string) {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(s.messageOutbox).where(eq(s.messageOutbox.templateKey, templateKey));
  return Number(row?.total ?? 0);
}

describe("توابع خالص کلاس‌ها", () => {
  it("درصد حضور: حاضر و تأخیر حضور محسوب می‌شوند", () => {
    expect(attendancePercent([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "excused" }])).toBe(50);
    expect(attendancePercent([])).toBe(0);
    expect(attendanceTally([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "absent" }, { status: "excused" }])).toEqual({ present: 1, absent: 2, late: 1, excused: 1 });
  });
  it("گذار وضعیت ظرفیت: پر شدن → full و آزاد شدن → active؛ سایر وضعیت‌ها دست‌نخورده", () => {
    expect(resolveCapacityStatus("active", 3, 3)).toBe("full");
    expect(resolveCapacityStatus("full", 2, 3)).toBe("active");
    expect(resolveCapacityStatus("held", 0, 3)).toBe("held");
    expect(resolveCapacityStatus("cancelled", 0, 3)).toBe("cancelled");
  });
  it("پنجرهٔ یادآور و مهلت پاسخ", () => {
    const now = new Date("2026-01-10T10:00:00+03:30");
    expect(isReminderDue("2026-01-11", "10:00", 24, now)).toBe(true);
    expect(isReminderDue("2026-01-11", "11:00", 24, now)).toBe(false);
    expect(isReminderDue("2026-01-09", "10:00", 24, now)).toBe(false);
    expect(isRespondDeadlinePassed(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isRespondDeadlinePassed(new Date(now.getTime() + 60_000), now)).toBe(false);
    expect(isRespondDeadlinePassed(null, now)).toBe(false);
  });
  it("بازهٔ ساعت معتبر", () => {
    expect(validTimeRange("08:00", "10:30")).toBe(true);
    expect(validTimeRange("10:00", "08:00")).toBe(false);
    expect(validTimeRange("8:00", "10:00")).toBe(false);
  });
});

describe("جامعهٔ هدف — شناسایی افراد واجد شرایط", () => {
  it("فقط پروندهٔ تکمیل‌شده با هم‌خوانی شهرستان و گروه هدف قرار می‌گیرد", async () => {
    const okUser = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const wrongCounty = await makeEligibleUser({ countyId: f.islamshahrCountyId, specialtyId: f.specialtyId });
    const wrongGroup = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    await db.delete(s.activistSpecialties).where(and(eq(s.activistSpecialties.activistId, (await db.select({ id: s.activists.id }).from(s.activists).where(eq(s.activists.userId, wrongGroup.id)).limit(1))[0]!.id)));
    const draftUser = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId, status: "draft", submitted: false });

    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId] });
    const audience = await listEligibleAudience(classId);
    const ids = audience.map((a) => a.userId);
    expect(ids).toContain(okUser.id);
    expect(ids).not.toContain(wrongCounty.id);
    expect(ids).not.toContain(draftUser.id);
    // wrongGroup حذف تخصص شد؛ کماکان شهرستانی است اما گروه ندارد → خارج از جامعهٔ هدف
    expect(ids).not.toContain(wrongGroup.id);
  });
});

describe("چرخهٔ ثبت‌نام و ظرفیت", () => {
  it("ثبت‌نام تا ظرفیت، ضدتکرار، ردِ غیرواجد و مهلت گذشته", async () => {
    const u1 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const u2 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const u3 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const outsider = await makeEligibleUser({ countyId: f.islamshahrCountyId, specialtyId: f.specialtyId });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], capacity: 2 });

    expect((await registerForClass(u1, classId)).ok).toBe(true);
    expect((await registerForClass(u1, classId)).ok).toBe(false); // تکراری
    expect((await registerForClass(outsider, classId)).ok).toBe(false); // شهرستان دیگر
    expect((await registerForClass(u2, classId)).ok).toBe(true);

    const [row] = await db.select({ status: s.classes.status }).from(s.classes).where(eq(s.classes.id, classId));
    expect(row!.status).toBe("full"); // گذار خودکار تکمیل ظرفیت

    const third = await registerForClass(u3, classId);
    expect(third.ok).toBe(false);
    expect(third.full).toBe(true);

    const past = await registerForClass(u3, await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], deadline: new Date(Date.now() - 3600_000) }));
    expect(past.ok).toBe(false);
    expect(past.error).toContain("مهلت");
  });

  it("کاربر بدون پروندهٔ تکمیل‌شده مجاز به ثبت‌نام نیست", async () => {
    const incomplete = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId, status: "draft", submitted: false });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId] });
    const result = await registerForClass(incomplete, classId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("تکمیل");
  });
});

describe("لیست انتظار و دعوت خودکار", () => {
  it("نوبت FIFO، دعوت خودکار پس از انصراف با پیامک، پذیرش و گذار وضعیت", async () => {
    const u1 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const u2 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const u3 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], capacity: 2 });
    await registerForClass(u1, classId);
    await registerForClass(u2, classId);

    expect((await joinWaitlist(u3, classId)).ok).toBe(true);
    const waitlistRows = await db.select().from(s.classWaitlist).where(eq(s.classWaitlist.classId, classId));
    expect(waitlistRows).toHaveLength(1);
    expect(waitlistRows[0]!.position).toBe(1);

    // ثبت‌نام مستقیم وقتی ظرفیت آزاد است از لیست انتظار رد می‌شود
    const u4 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const freeJoin = await joinWaitlist(u4, classId);
    // کلاس full است؛ اجازه دارد
    expect(freeJoin.ok).toBe(true);

    // انصراف u1 → نفر اول لیست (u3) دعوت می‌شود + پیامک + اعلان
    const beforeOutbox = await outboxCount("class_waitlist_invite");
    expect((await cancelRegistration(u1, classId)).ok).toBe(true);
    const invited = await db.select().from(s.classWaitlist).where(and(eq(s.classWaitlist.classId, classId), eq(s.classWaitlist.status, "invited")));
    expect(invited).toHaveLength(1);
    expect(invited[0]!.userId).toBe(u3.id);
    expect(invited[0]!.respondDeadline).toBeTruthy();
    expect(await outboxCount("class_waitlist_invite")).toBe(beforeOutbox + 1);
    expect(await smsRows(classId, "waitlist_invite")).toHaveLength(1);

    // پذیرش دعوت → ثبت‌نام با منبع لیست انتظار
    expect((await respondToInvitation(u3, classId, true)).ok).toBe(true);
    const [reg] = await db.select().from(s.classRegistrations).where(and(eq(s.classRegistrations.classId, classId), eq(s.classRegistrations.userId, u3.id)));
    expect(reg!.status).toBe("registered");
    expect(reg!.source).toBe("waitlist");
    const [converted] = await db.select().from(s.classWaitlist).where(eq(s.classWaitlist.id, invited[0]!.id));
    expect(converted!.status).toBe("converted");

    // کلاس دوباره full است (2 نفر: u2 و u3)
    const [cls] = await db.select().from(s.classes).where(eq(s.classes.id, classId));
    expect(cls!.status).toBe("full");
  });

  it("عدم پاسخ در مهلت → نوبت به نفر بعدی منتقل می‌شود", async () => {
    const u1 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const w1 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const w2 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], capacity: 1 });
    await registerForClass(u1, classId);
    await joinWaitlist(w1, classId);
    await joinWaitlist(w2, classId);

    // انصراف u1 → دعوت w1؛ مهلت را به گذشته ببریم و کرون را اجرا کنیم
    await cancelRegistration(u1, classId);
    const [invited] = await db.select().from(s.classWaitlist).where(and(eq(s.classWaitlist.classId, classId), eq(s.classWaitlist.status, "invited")));
    expect(invited!.userId).toBe(w1.id);
    await db.update(s.classWaitlist).set({ respondDeadline: new Date(Date.now() - 60_000) }).where(eq(s.classWaitlist.id, invited!.id));

    const result = await expireWaitlistInvitations();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const [expired] = await db.select().from(s.classWaitlist).where(eq(s.classWaitlist.id, invited!.id));
    expect(expired!.status).toBe("no_response");
    const nextInvited = await db.select().from(s.classWaitlist).where(and(eq(s.classWaitlist.classId, classId), eq(s.classWaitlist.status, "invited")));
    expect(nextInvited).toHaveLength(1);
    expect(nextInvited[0]!.userId).toBe(w2.id);
  });
});

describe("دعوت فعال‌سازی با ضدتکرار", () => {
  it("دعوت فقط برای واجد شرایطانِ دارای موبایل؛ دعوت دوباره ردیف تازه نمی‌سازد", async () => {
    const a = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const b = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], status: "draft" });

    const first = await sendClassInvites(classId, f.users.super as unknown as SessionUser);
    expect(first.ok).toBe(true);
    expect(first.queued).toBeGreaterThanOrEqual(2);
    // جمع بدون‌شماره و صف‌شده = کل واجد شرایط (فقط دارای موبایل دعوت می‌شوند)
    expect(first.withoutPhone + first.queued).toBe(first.eligible);

    const beforeSecond = await smsRows(classId, "invite");
    const second = await sendClassInvites(classId, f.users.super as unknown as SessionUser);
    expect(second.queued).toBe(0);
    expect(second.alreadySent).toBe(beforeSecond.length);
  });
});

describe("حضور و غیاب", () => {
  it("ثبت، ویرایش با سوابق، درصد حضور و خلاصهٔ دوره", async () => {
    const u1 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const u2 = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], capacity: 5 });
    await registerForClass(u1, classId);
    await registerForClass(u2, classId);
    const sessions = await db.insert(s.classSessions).values([
      { classId, sessionNo: 1, startsOn: "2026-12-01", startTime: "08:00", endTime: "10:00" },
      { classId, sessionNo: 2, startsOn: "2026-12-08", startTime: "08:00", endTime: "10:00" },
    ]).returning({ id: s.classSessions.id });

    expect((await saveAttendance(f.users.super as unknown as SessionUser, classId, sessions[0]!.id, [
      { userId: u1.id, status: "present", notes: "به‌موقع" },
      { userId: u2.id, status: "absent" },
    ])).ok).toBe(true);

    // ویرایش وضعیت u2 → ثبت سوابق تغییر
    expect((await saveAttendance(f.users.super as unknown as SessionUser, classId, sessions[0]!.id, [
      { userId: u2.id, status: "late", notes: "۲۰ دقیقه تأخیر" },
    ])).ok).toBe(true);
    const logs = await db.select().from(s.classAttendanceLogs)
      .innerJoin(s.classAttendance, eq(s.classAttendance.id, s.classAttendanceLogs.attendanceId))
      .where(eq(s.classAttendance.sessionId, sessions[0]!.id));
    expect(logs).toHaveLength(3); // دو ثبت اولیه + یک تغییر
    const edit = logs.find((l) => l.class_attendance_logs.newStatus === "late");
    expect(edit!.class_attendance_logs.oldStatus).toBe("absent");
    expect(edit!.class_attendance_logs.changedBy).toBe(f.users.super.id);

    // جلسهٔ دوم
    await saveAttendance(f.users.super as unknown as SessionUser, classId, sessions[1]!.id, [
      { userId: u1.id, status: "present" },
      { userId: u2.id, status: "excused", notes: "موجه" },
    ]);
    const summary = await listClassAttendanceSummary(classId);
    const u1Summary = summary.find((row) => row.userId === u1.id);
    const u2Summary = summary.find((row) => row.userId === u2.id);
    expect(u1Summary!.percent).toBe(100);
    expect(u2Summary!.percent).toBe(50); // تأخیر حاضر؛ غیبت موجه غایب شمرده می‌شود
  });
});

describe("دسترسی‌ها", () => {
  it("مدیریت جغرافیایی و پنل مدرس", async () => {
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId] });
    expect(await canManageClass(f.users.super, classId)).toBe(true);
    expect(await canManageClass(f.users.prov, classId)).toBe(true);
    expect(await canManageClass(f.users.county, classId)).toBe(true);

    const teacher = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const teacherClassId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId], teacherUserId: teacher.id });
    // مدرس فقط کلاس خودش را می‌بیند و اجازهٔ ثبت حضور دارد
    expect(await canTakeAttendance({ ...teacher, effectiveRole: "activist" } as unknown as MaybeSessionUser, { teacherUserId: teacher.id })).toBe(false); // بدون مجوز classes.teach
    const teaching = await listTeachingClasses({ id: teacher.id, role: "super_admin" } as never);
    expect(teaching).toHaveLength(1);
    expect(teaching[0]!.id).toBe(teacherClassId);
    expect(await canManageClass({ id: teacher.id, role: "activist", effectiveRole: "activist" } as unknown as MaybeSessionUser, teacherClassId)).toBe(false);
  });
});

describe("نمای کاربر و داشبورد", () => {
  it("کلاس‌های کاربر فقط همان شهرستان/گروه؛ داشبورد شمارنده‌ها را برمی‌گرداند", async () => {
    const user = await makeEligibleUser({ countyId: f.tehranCountyId, specialtyId: f.specialtyId });
    const mine = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId] });
    await makeClass({ countyIds: [f.islamshahrCountyId], specialtyIds: [f.specialtyId] });
    const rows = await listUserClasses(user);
    expect(rows.map((r) => r.id)).toContain(mine);
    // کلاس شهرستان دیگر در فهرست کاربر نیست (دیتابیس انباشتهٔ تست‌های قبلی است)
    const islamshahrClasses = await db.select({ id: s.classes.id }).from(s.classes)
      .innerJoin(s.classesCounties, eq(s.classesCounties.classId, s.classes.id))
      .where(eq(s.classesCounties.countyId, f.islamshahrCountyId));
    for (const other of islamshahrClasses) expect(rows.map((r) => r.id)).not.toContain(other.id);
    const eligibility = await isUserEligible(user, mine);
    expect(eligibility.ok).toBe(true);

    const dashboard = await classDashboard(f.users.super);
    expect(dashboard.totals.all).toBeGreaterThanOrEqual(1);
    expect(dashboard.totals.registrations).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dashboard.byCounty)).toBe(true);
  });

  it("جلسات دوره چندجلسه‌ای به ترتیب شماره برمی‌گردد", async () => {
    const classId = await makeClass({ countyIds: [f.tehranCountyId], specialtyIds: [f.specialtyId] });
    await db.insert(s.classSessions).values([
      { classId, sessionNo: 2, startsOn: "2026-12-08", startTime: "09:00", endTime: "11:00" },
      { classId, sessionNo: 1, startsOn: "2026-12-01", startTime: "08:00", endTime: "10:00" },
    ]);
    const sessions = await listSessions(classId);
    expect(sessions.map((s2) => s2.sessionNo)).toEqual([1, 2]);
    expect(sessions.every((s2) => isUuid(s2.id))).toBe(true);
  });
});
