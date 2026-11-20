// الحاقیهٔ ۲.۱۹.۰ — پنل مدرس: کلاس‌هایی که به مدرسِ دارای حساب اختصاص یافته‌اند؛
// ورود به پنل هر کلاس برای مشاهدهٔ شرکت‌کنندگان و ثبت حضور و غیاب.
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { faNumber } from "@/lib/format";
import { classStatusLabels, listTeachingClasses } from "@/lib/classes";

export const dynamic = "force-dynamic";

export default async function TeachingPage() {
  const actor = await requireUser();
  if (!(await can(actor, "classes.teach")) && !(await can(actor, "classes.manage"))) redirect("/dashboard");
  const rows = await listTeachingClasses(actor);
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1><GraduationCap size={20} /> کلاس‌های تدریسی من</h1>
        <p>کلاس‌هایی که به شما به‌عنوان مدرس اختصاص یافته است؛ فهرست شرکت‌کنندگان، زمان‌بندی جلسات و ثبت حضور و غیاب کلاس‌های خودتان.</p>
      </div>
    </header>
    {rows.length === 0 && <p className="cls-empty">هنوز کلاسی به شما اختصاص نیافته است؛ پس از تعریف کلاس توسط مدیریت، این‌جا نمایش داده می‌شود.</p>}
    <section className="cls-table-wrap">
      <table className="cls-table">
        <thead><tr><th>کلاس</th><th>وضعیت</th><th>نخستین جلسه</th><th>ثبت‌نام</th><th>جلسات</th><th> </th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}>
            <td><Link href={`/teaching/${r.id}`} className="cls-title-link"><strong>{r.title}</strong><small>{r.topic}</small></Link></td>
            <td>{classStatusLabels[r.status]}</td>
            <td><CalendarDays size={13} /> {r.startsOn} <small dir="ltr">{r.startTime}</small></td>
            <td>{faNumber(r.registeredCount)}/{faNumber(r.capacity)}</td>
            <td>{faNumber(r.sessionCount)}</td>
            <td><Link className="ws-btn-secondary" href={`/teaching/${r.id}`}>پنل کلاس</Link></td>
          </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
