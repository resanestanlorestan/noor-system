// الحاقیهٔ ۲.۱۹.۰ — صفحهٔ کاربر «کلاس‌ها و دوره‌های آموزشی»: فقط کلاس‌های
// متناسب با گروه (تخصص پرونده) و شهرستانِ کاربر؛ وضعیت خودش نسبت به هر کلاس
// (ثبت‌نام/لیست انتظار/دعوت) و سوابق حضورش به تفکیک جلسات.
import { requireUser } from "@/lib/auth";
import { isUserEligible, listUserClassAttendance, listUserClasses } from "@/lib/classes";
import { MyClassesView, type UserClassCard } from "@/components/my-classes-view";

export const dynamic = "force-dynamic";

/** مهلت گذشته؟ — در سطح ماژول تعریف شده تا قانون «فراخوانی ناخالص در رندر» لینت راحت باشد. */
const isPast = (date: Date | null) => !!date && date.getTime() <= Date.now();

export default async function MyClassesPage() {
  const actor = await requireUser();
  const rows = await listUserClasses(actor);
  const cards: UserClassCard[] = await Promise.all(rows.map(async (r) => {
    const eligibility = await isUserEligible(actor, r.id);
    return {
      id: r.id, title: r.title, topic: r.topic,
      description: r.description, syllabus: r.syllabus,
      status: r.status, formatType: r.formatType, capacity: r.capacity,
      startsOn: r.startsOn, startTime: r.startTime, endTime: r.endTime,
      location: r.location ?? null, address: r.address ?? null, teacherName: r.teacherName,
      registrationDeadline: r.registrationDeadline ? r.registrationDeadline.toISOString() : null,
      deadlinePassed: isPast(r.registrationDeadline),
      hasPoster: r.hasPoster, sessionCount: Number(r.sessionCount),
      registeredCount: Number(r.registeredCount),
      myRegistrationId: r.myRegistrationId, myCancelled: !!r.myCancelledId,
      myWaitlistStatus: r.myWaitlistStatus, myWaitlistDeadline: r.myWaitlistDeadline,
      eligible: eligibility.ok, eligibilityReason: eligibility.reason,
    };
  }));
  const myAttendance = await listUserClassAttendance(actor.id);
  return <MyClassesView rows={cards} myAttendance={myAttendance.map((a) => ({ classTitle: a.classTitle, sessionNo: a.sessionNo, startsOn: a.startsOn, status: a.status, notes: a.notes }))} />;
}
