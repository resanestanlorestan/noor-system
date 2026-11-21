// الحاقیهٔ ۲.۱۹.۰ — ویرایش کلاس: همهٔ فیلدها با مقادیر فعلی؛ جلسات دوره قابل
// بازنویسی است (حذف جلسه، حضور و غیاب آن را نیز حذف می‌کند).
import { notFound, redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCountiesOptions, listSpecialtyOptions, listTeacherOptions } from "@/lib/classes";
import { ClassForm } from "@/components/class-form";

export const dynamic = "force-dynamic";

const tehranTime = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

export default async function EditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const { id } = await params;
  const [detail, counties, specialties, teachers] = await Promise.all([
    (await import("@/lib/classes")).getClassDetail(id),
    listCountiesOptions(actor), listSpecialtyOptions(), listTeacherOptions(),
  ]);
  if (!detail) notFound();
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1><GraduationCap size={20} /> ویرایش کلاس «{detail.title}»</h1>
        <p>تغییرات بلافاصله در پنل کاربران اعمال می‌شود؛ برای اطلاع‌رسانی تغییر زمان/مکان از دکمهٔ «اطلاع‌رسانی تغییر» در صفحهٔ کلاس استفاده کنید.</p>
      </div>
    </header>
    <ClassForm mode="edit"
      counties={counties.map((c) => ({ id: c.id, label: c.name, group: c.province }))}
      specialties={specialties.map((s) => ({ id: s.id, label: s.title }))}
      teachers={teachers.map((t) => ({ id: t.id, label: `${t.fullName}${t.phone ? ` (${t.phone})` : ""}` }))}
      initial={{
        id: detail.id, title: detail.title, topic: detail.topic,
        description: detail.description ?? undefined, syllabus: detail.syllabus ?? undefined,
        formatType: detail.formatType, capacity: detail.capacity,
        startsOn: detail.startsOn, startTime: detail.startTime, endTime: detail.endTime,
        location: detail.location ?? undefined, address: detail.address ?? undefined,
        teacherName: detail.teacherName, teacherPhone: detail.teacherPhone ?? undefined,
        teacherUserId: detail.teacherUserId ?? undefined,
        deadlineDate: detail.registrationDeadline ? detail.registrationDeadline.toISOString() : undefined,
        deadlineTime: detail.registrationDeadline ? tehranTime(detail.registrationDeadline) : undefined,
        reminderHours: detail.reminderHours, waitlistRespondHours: detail.waitlistRespondHours,
        countyIds: detail.counties.map((c) => c.countyId),
        specialtyIds: detail.specialties.map((s) => s.specialtyId),
        hasPoster: detail.hasPoster,
        sessions: detail.sessions.map((s) => ({ startsOn: s.startsOn, startTime: s.startTime, endTime: s.endTime, location: s.location, teacherName: s.teacherName, notes: s.notes })),
      }}
    />
  </div>;
}
