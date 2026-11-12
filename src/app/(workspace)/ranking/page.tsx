import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Trophy } from "lucide-react";
import { db } from "@/db";
import { counties, provinces as provincesTable } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { faNumber } from "@/lib/format";
import { listRanking, listSpecialtyOptions, SCORE_WEIGHTS } from "@/lib/ranking";

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireUser();
  if (!(await can(actor, "reports.view"))) redirect("/dashboard");
  const query = await searchParams;
  const pick = (key: string) => {
    const raw = typeof query[key] === "string" ? query[key] : undefined;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const filters = { provinceId: pick("provinceId"), countyId: pick("countyId"), specialtyId: pick("specialtyId") };
  const [rows, specialtyOptions, provinceOptions, countyOptions] = await Promise.all([
    listRanking(actor, filters),
    listSpecialtyOptions(),
    db.select({ id: provincesTable.id, name: provincesTable.name }).from(provincesTable).orderBy(provincesTable.name),
    db.select({ id: counties.id, name: counties.name, provinceId: counties.provinceId }).from(counties).orderBy(counties.name),
  ]);
  const topScore = rows[0]?.score ?? 0;
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
  const gold = rows.filter((row) => row.level.label === "طلایی").length;
  const role = actor.effectiveRole ?? actor.role;

  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>رتبه‌بندی فعالان</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> شفاف و مستند</div><h1>رتبه‌بندی و امتیاز فعالان قرآنی</h1><p>امتیاز هر فعال از مجموع وزن‌دار سوابق ساختاریافته پرونده او محاسبه می‌شود: فعالیت‌ها، تدریس، داوری، مسابقات، پژوهش، دوره‌ها (و ساعت آن‌ها)، گواهینامه‌ها و حضور در رویدادها</p></div></div>

    <section className="ws-panel"><div className="ws-panel-head"><div><span>وزن‌های امتیازدهی</span><h2>فرمول امتیاز</h2><p>فعالیت {faNumber(SCORE_WEIGHTS.activity)} · تدریس {faNumber(SCORE_WEIGHTS.teaching)} · داوری {faNumber(SCORE_WEIGHTS.judging)} · مسابقه {faNumber(SCORE_WEIGHTS.competition)} · پژوهش {faNumber(SCORE_WEIGHTS.research)} · دوره {faNumber(SCORE_WEIGHTS.course)} + هر {faNumber(SCORE_WEIGHTS.courseHoursPerPoint)} ساعت ۱ امتیاز · گواهینامه {faNumber(SCORE_WEIGHTS.certificate)} · حضور در رویداد {faNumber(SCORE_WEIGHTS.eventAttended)}</p></div><span className="panel-outline-icon"><Trophy size={18} /></span></div>
      <form method="get" action="/ranking" className="ranking-filters">
        {role === "super_admin" && <label>استان<select name="provinceId" defaultValue={filters.provinceId ? String(filters.provinceId) : ""}><option value="">همه استان‌ها (محدوده مجاز)</option>{provinceOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {role !== "county_admin" && <label>شهرستان<select name="countyId" defaultValue={filters.countyId ? String(filters.countyId) : ""}><option value="">همه شهرستان‌ها</option>{countyOptions.filter((item) => !filters.provinceId || item.provinceId === filters.provinceId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        <label>تخصص<select name="specialtyId" defaultValue={filters.specialtyId ? String(filters.specialtyId) : ""}><option value="">همه تخصص‌ها</option>{specialtyOptions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <button className="secondary-button small-button">اعمال فیلتر</button>
      </form>
      <div className="ws-stats ranking-stats">
        <div className="ws-stat"><span className="ws-stat-icon mint"><Trophy size={22} /></span><div><small>بالاترین امتیاز</small><strong>{faNumber(topScore)}</strong><p>امتیاز رتبه نخست</p></div></div>
        <div className="ws-stat"><span className="ws-stat-icon blue"><Award size={22} /></span><div><small>میانگین امتیاز</small><strong>{faNumber(average)}</strong><p>میانگین {faNumber(rows.length)} فعال</p></div></div>
        <div className="ws-stat"><span className="ws-stat-icon gold"><Trophy size={22} /></span><div><small>سطح طلایی</small><strong>{faNumber(gold)}</strong><p>امتیاز ۲۵ و بالاتر</p></div></div>
      </div>
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>جدول رتبه‌بندی</span><h2>{faNumber(rows.length)} فعال در محدوده شما</h2><p>سطح‌ها: طلایی (۲۵+)، نقره‌ای (۱۲+)، برنزی (۵+) و فعال. امتیاز از داده‌های واقعی پرونده هر فعال محاسبه می‌شود.</p></div><span className="panel-outline-icon"><Award size={18} /></span></div>
      {rows.length ? <div className="ws-table-scroll"><table className="ws-table ranking-table"><thead><tr><th>رتبه</th><th>فعال قرآنی</th><th>محدوده</th><th>تخصص‌ها</th><th>فعالیت / تدریس / داوری</th><th>دوره‌ها / ساعت</th><th>گواهینامه</th><th>حضور رویداد</th><th>امتیاز</th><th>سطح</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.activistId}>
          <td><strong>{faNumber(index + 1)}</strong>{index < 3 && row.score > 0 && <span className="rank-medal" style={{ background: row.level.color }}><Trophy size={12} /></span>}</td>
          <td>{row.caseId ? <Link className="table-link" href={`/cases/${row.caseId}`}>{row.fullName}</Link> : row.fullName}</td>
          <td>{[row.province, row.county].filter(Boolean).join(" / ") || "—"}</td>
          <td><small>{row.specialtyTitles || "—"}</small></td>
          <td>{faNumber(row.activityCount)} / {faNumber(row.teachingCount)} / {faNumber(row.judgingCount)}</td>
          <td>{faNumber(row.courseCount)} / {faNumber(row.courseHours)}</td>
          <td>{faNumber(row.certificateCount)}</td>
          <td>{faNumber(row.attendedCount)}</td>
          <td><strong>{faNumber(row.score)}</strong></td>
          <td><span className="status-badge" style={{ background: `${row.level.color}1a`, color: row.level.color }}>{row.level.label}</span></td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span><Trophy size={22} /></span><strong>فعالی برای رتبه‌بندی یافت نشد</strong><p>با ثبت سوابق ساختاریافته در پرونده‌ها (فعالیت، دوره، گواهینامه) و حضور در رویدادها، امتیاز فعالان اینجا محاسبه می‌شود.</p></div>}
      <p className="table-footnote">امتیازها لحظه‌ای و بر اساس نقش فعلی و محدوده دسترسی شما محاسبه می‌شوند؛ این صفحه هیچ امتیاز ذخیره‌شده‌ای نگه نمی‌دارد.</p>
    </section>
  </>;
}
