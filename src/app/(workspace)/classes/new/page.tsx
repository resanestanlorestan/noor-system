// الحاقیهٔ ۲.۱۹.۰ — صفحهٔ تعریف کلاس جدید (ادمین دارای classes.manage).
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCountiesOptions, listSpecialtyOptions, listTeacherOptions } from "@/lib/classes";
import { ClassForm } from "@/components/class-form";

export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const [counties, specialties, teachers] = await Promise.all([
    listCountiesOptions(actor), listSpecialtyOptions(), listTeacherOptions(),
  ]);
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1><GraduationCap size={20} /> تعریف کلاس یا دورهٔ آموزشی</h1>
        <p>پس از ایجاد، کلاس در وضعیت «پیش‌نویس» است؛ با فعال‌سازی، پیامک دعوت برای همهٔ افراد واجد شرایطِ گروه و شهرستان‌های انتخابی ارسال می‌شود.</p>
      </div>
    </header>
    <ClassForm mode="create"
      counties={counties.map((c) => ({ id: c.id, label: c.name, group: c.province }))}
      specialties={specialties.map((s) => ({ id: s.id, label: s.title }))}
      teachers={teachers.map((t) => ({ id: t.id, label: `${t.fullName}${t.phone ? ` (${t.phone})` : ""}` }))}
    />
  </div>;
}
