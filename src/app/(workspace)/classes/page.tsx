// الحاقیهٔ ۲.۱۹.۰ — داشبورد «مدیریت کلاس‌ها و دوره‌های آموزشی»: آمار کلی،
// فیلترها، فهرست کلاس‌ها با شمارنده‌ها، سوابق اخیر و خروجی اکسل داشبورد.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, GraduationCap, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { faNumber } from "@/lib/format";
import { classDashboard, classFormatLabels, classStatusLabels, listCountiesOptions, listRecentClassActivity, listSpecialtyOptions } from "@/lib/classes";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = { draft: "status-draft", active: "status-approved", full: "status-completing", cancelled: "status-rejected", held: "status-specialist" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireUser();
  if (!(await can(actor, "classes.manage"))) redirect("/dashboard");
  const query = await searchParams;
  const status = typeof query.status === "string" ? query.status : "";
  const countyId = Number(query.countyId || 0) || undefined;
  const specialtyId = Number(query.specialtyId || 0) || undefined;
  const [stats, counties, specialties, activity] = await Promise.all([
    classDashboard(actor, { status: status || undefined, countyId, specialtyId }),
    listCountiesOptions(actor),
    listSpecialtyOptions(),
    listRecentClassActivity(8),
  ]);
  const rows = stats.rows;

  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1><GraduationCap size={20} /> مدیریت کلاس‌ها و دوره‌های آموزشی</h1>
        <p>تعریف کلاس با گروه هدف و شهرستان، دعوت خودکار افراد واجد شرایط، ثبت‌نام، لیست انتظار، حضور و غیاب و گزارش‌ها.</p>
      </div>
      <div className="ws-page-actions">
        <a className="ws-btn-secondary" href="/api/classes/export"><Download size={15} /> خروجی اکسل داشبورد</a>
        <Link className="ws-btn" href="/classes/new"><PlusCircle size={15} /> کلاس جدید</Link>
      </div>
    </header>

    <section className="cls-stats-row">
      {([["همه", stats.totals.all], ["فعال", stats.byStatus.active], ["تکمیل ظرفیت", stats.byStatus.full], ["برگزارشده", stats.byStatus.held], ["لغوشده", stats.byStatus.cancelled], ["پیش‌نویس", stats.byStatus.draft]] as const).map(([label, value]) => <div key={label} className="cls-stat"><strong>{faNumber(value)}</strong><small>{label}</small></div>)}
      <div className="cls-stat"><strong>{faNumber(stats.totals.registrations)}</strong><small>ثبت‌نام</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.totals.waitlist)}</strong><small>لیست انتظار</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.totals.sms)}</strong><small>پیامک</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.totals.cancellations)}</strong><small>انصراف</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.attendance.avgPercent)}٪</strong><small>میانگین حضور</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.attendance.present)}</strong><small>حاضر</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.attendance.absent)}</strong><small>غایب</small></div>
      <div className="cls-stat"><strong>{faNumber(stats.attendance.late)}</strong><small>تأخیر</small></div>
    </section>

    {(stats.byCounty.length > 0 || stats.bySpecialty.length > 0) && <section className="cls-breakdown">
      <div><strong>ثبت‌نام به تفکیک شهرستان</strong>
        <ul>{stats.byCounty.map((r) => <li key={r.name}>{r.name}: <b>{faNumber(r.total)}</b></li>)}</ul>
      </div>
      <div><strong>ثبت‌نام به تفکیک گروه</strong>
        <ul>{stats.bySpecialty.map((r) => <li key={r.name}>{r.name}: <b>{faNumber(r.total)}</b></li>)}</ul>
      </div>
    </section>}

    <form className="cls-filter-row" method="get">
      <select name="status" defaultValue={status}>
        <option value="">همهٔ وضعیت‌ها</option>
        {Object.entries(classStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select name="countyId" defaultValue={String(countyId ?? "")}>
        <option value="">همهٔ شهرستان‌ها</option>
        {counties.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.province}</option>)}
      </select>
      <select name="specialtyId" defaultValue={String(specialtyId ?? "")}>
        <option value="">همهٔ گروه‌ها</option>
        {specialties.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button type="submit" className="ws-btn-secondary">اعمال فیلتر</button>
    </form>

    <section className="cls-table-wrap">
      <table className="cls-table">
        <thead><tr><th>عنوان / موضوع</th><th>وضعیت</th><th>نوع</th><th>زمان</th><th>ظرفیت</th><th>واجد شرایط</th><th>ثبت‌نام</th><th>لیست انتظار</th><th>پیامک</th><th>جلسات</th><th> </th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={11} className="cls-empty">کلاسی مطابق فیلتر یافت نشد؛ با «کلاس جدید» نخستین کلاس را تعریف کنید.</td></tr>}
          {rows.map((r) => <tr key={r.id}>
            <td><Link href={`/classes/${r.id}`} className="cls-title-link"><strong>{r.title}</strong><small>{r.topic}</small></Link></td>
            <td><span className={`cls-badge ${badge[r.status]}`}>{classStatusLabels[r.status]}</span></td>
            <td>{classFormatLabels[r.formatType]}</td>
            <td>{r.startsOn}<small dir="ltr"> {r.startTime}</small></td>
            <td>{faNumber(r.capacity)}</td>
            <td>{faNumber(r.eligibleCount)}</td>
            <td>{faNumber(r.registeredCount)}</td>
            <td>{faNumber(r.waitlistCount)}</td>
            <td>{faNumber(r.smsCount)}</td>
            <td>{faNumber(r.sessionCount)}</td>
            <td><Link className="ws-btn-secondary" href={`/classes/${r.id}`}>مدیریت</Link></td>
          </tr>)}
        </tbody>
      </table>
    </section>

    {activity.length > 0 && <section className="cls-activity">
      <strong>سوابق اخیر</strong>
      <ul>
        {activity.map((a) => <li key={a.id}><b>{a.actorName || "سیستم"}</b> — {a.action}{a.detail ? <small> ({a.detail})</small> : null}</li>)}
      </ul>
    </section>}
  </div>;
}
