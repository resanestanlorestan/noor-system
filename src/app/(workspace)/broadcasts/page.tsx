import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Inbox, Megaphone, Send, UsersRound } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { counties as countiesTable, provinces as provincesTable, specialties as specialtiesTable } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData } from "@/lib/data";
import { can } from "@/lib/permissions";
import { statusLabels } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/format";
import { smsProviderLabel } from "@/lib/messaging";
import {
  MAX_BROADCAST_RECIPIENTS, MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH,
  audienceLabel, filterParams, listRecentBroadcasts,
  parseBroadcastFilters, previewAudience,
} from "@/lib/broadcasts";
import { maskPhone } from "@/lib/reminders";
import { sendBroadcastAction } from "@/app/actions/broadcasts";
import { BroadcastFiltersForm } from "@/components/broadcast-filters";
import { ConfirmButton } from "@/components/case-controls";

export default async function BroadcastsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireUser();
  if (!(await can(actor, "messages.broadcast"))) redirect("/dashboard");
  await ensureReferenceData();

  const query = await searchParams;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") flat[key] = value;
  const { filters, error: filterError } = parseBroadcastFilters(flat);
  const error = typeof flat.error === "string" ? flat.error : filterError;
  const hasFilters = Boolean(filters.provinceId || filters.countyId || filters.specialtyId || filters.status || filters.onlyWithPhone);

  const [allProvinces, allCounties, allSpecialties, history] = await Promise.all([
    db.select({ id: provincesTable.id, name: provincesTable.name }).from(provincesTable).orderBy(asc(provincesTable.id)),
    db.select({ id: countiesTable.id, name: countiesTable.name, provinceId: countiesTable.provinceId }).from(countiesTable).orderBy(asc(countiesTable.id)),
    db.select({ id: specialtiesTable.id, title: specialtiesTable.title }).from(specialtiesTable).orderBy(asc(specialtiesTable.id)),
    listRecentBroadcasts(12),
  ]);
  const provinces = actor.effectiveRole === "super_admin" ? allProvinces : allProvinces.filter((item) => item.id === actor.provinceId);
  const counties = actor.effectiveRole === "super_admin" ? allCounties : allCounties.filter((item) => item.provinceId === actor.provinceId && (!actor.countyId || item.id === actor.countyId));

  const names = {
    province: provinces.find((item) => item.id === filters.provinceId)?.name,
    county: counties.find((item) => item.id === filters.countyId)?.name,
    specialty: allSpecialties.find((item) => item.id === filters.specialtyId)?.title,
  };
  const label = audienceLabel(filters, names);
  const audience = await previewAudience(actor, filters);
  const banner = typeof flat.sent === "string" ? { sent: Number(flat.sent) || 0, sms: Number(flat.sms) || 0, local: Number(flat.local) || 0, notified: Number(flat.notified) || 0 } : null;
  const smsOn = smsProviderLabel();
  const hidden = filterParams(filters);
  const workflowStatuses = Object.entries(statusLabels).filter(([key]) => !["draft", "filling", "needs_correction"].includes(key));

  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>پیام گروهی</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> اطلاع‌رسانی دسته‌جمعی</div><h1>ارسال پیام گروهی به فعالان</h1><p>پیامک و اعلان هم‌زمان برای فعالان محدوده مدیریتی شما، بر اساس فیلتر جغرافیا، تخصص و وضعیت پرونده</p></div></div>

    {banner && <div className="ws-notice"><Megaphone size={18} /> <strong>{faNumber(banner.sent)} پیام گروهی ارسال شد</strong>{banner.sent ? <> — {banner.sms ? `${faNumber(banner.sms)} پیامک در صف ارسال` : ""}{banner.local ? `${banner.sms ? " و " : ""}${faNumber(banner.local)} پیامک در حالت محلی ثبت شد` : ""}{banner.notified ? `${banner.sms || banner.local ? " و " : ""}${faNumber(banner.notified)} اعلان درون‌برنامه‌ای` : ""}</> : ""}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}

    <section className="ws-panel report-filter-panel"><div className="ws-panel-head"><div><span>انتخاب مخاطبان</span><h2>فیلتر گیرندگان</h2><p>همیشه داخل محدوده دسترسی شما؛ فیلترها فقط دامنه را محدودتر می‌کنند.</p></div><span className="panel-outline-icon"><UsersRound size={18} /></span></div>
      <BroadcastFiltersForm provinces={provinces} counties={counties} specialties={allSpecialties} filters={filters} workflowStatuses={workflowStatuses} />
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>{label}</span><h2>{audience.overCap ? `بیش از ${faNumber(MAX_BROADCAST_RECIPIENTS)} گیرنده — فیلتر را محدودتر کنید` : `${faNumber(audience.total)} گیرنده`}</h2><p>{faNumber(audience.withPhone)} نفر دارای شماره همراه (پیامک) · {faNumber(audience.withAccount)} حساب کاربری متصل (اعلان درون‌برنامه‌ای)</p></div><span className="panel-outline-icon"><UsersRound size={18} /></span></div>
      {audience.sample.length ? <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>نمونه گیرندگان</th><th>محدوده</th><th>شماره همراه</th><th>حساب کاربری</th></tr></thead><tbody>{audience.sample.map((item) => <tr key={item.id}><td>{item.name}</td><td>{[item.province, item.county].filter(Boolean).join(" / ") || "—"}</td><td dir="ltr">{maskPhone(item.phone)}</td><td>{item.userId ? (item.userActive ? "فعال" : "غیرفعال") : "ندارد"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span><UsersRound size={22} /></span><strong>گیرنده‌ای با این فیلترها یافت نشد</strong><p>فیلترها را تغییر دهید یا گزینه «فقط دارای شماره همراه» را بردارید.</p></div>}
    </section>

    <section className="ws-panel"><div className="ws-panel-head"><div><span>{smsOn ? `پیامک واقعی از طریق ${smsOn} فعال است` : "حالت محلی: پیامک‌ها در صندوق پیام‌ها ذخیره می‌شوند"}</span><h2>نگارش و ارسال پیام</h2><p>پیامک با پیشوند «سامانه نور:» برای دارندگان شماره و اعلان درون‌برنامه‌ای برای دارندگان حساب ارسال می‌شود.</p></div><span className="panel-outline-icon"><Send size={18} /></span></div>
      {audience.overCap ? <div className="form-error" role="alert">سقف هر بار ارسال {faNumber(MAX_BROADCAST_RECIPIENTS)} گیرنده است؛ فیلترها را محدودتر کنید.</div> :
        <form action={sendBroadcastAction} className="broadcast-compose">
          {Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <label>عنوان پیام<input name="subject" required maxLength={MAX_SUBJECT_LENGTH} placeholder="مثلاً: اطلاعیه ثبت‌نام دوره آموزشی" /></label>
          <label>متن پیام<textarea name="body" required maxLength={MAX_BODY_LENGTH} rows={5} placeholder="متن پیام برای پیامک و اعلان درون‌برنامه‌ای..." /></label>
          <div className="workflow-buttons">
            {audience.total > 0 ? <ConfirmButton className="primary-button" name="confirm" value="yes" confirmText={`${faNumber(audience.total)} پیام برای گیرندگان انتخاب‌شده ارسال شود؟`}><Send size={16} /> ارسال به {faNumber(audience.total)} گیرنده</ConfirmButton>
              : <p className="table-footnote">فعلاً گیرنده‌ای در این محدوده نیست؛ پس از ثبت فعالان جدید این صفحه به‌روز می‌شود.</p>}
          </div>
        </form>}
      <p className="table-footnote">هر ارسال در <Link href="/audit" className="ws-text-link">رویدادهای حساس</Link> ثبت می‌شود و پیامک‌ها در <Link href="/outbox" className="ws-text-link">صندوق پیام‌ها</Link> قابل پیگیری‌اند.</p>
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>تاریخچه</span><h2>پیام‌های گروهی اخیر</h2><p>آخرین ارسال‌های گروهی ثبت‌شده در سامانه</p></div><span className="panel-outline-icon"><Inbox size={18} /></span></div>
      {history.length ? <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>عنوان</th><th>مخاطبان</th><th>گیرنده</th><th>پیامک</th><th>اعلان</th><th>ارسال‌کننده</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{faDate(item.createdAt, true)}</td><td><details className="outbox-body"><summary>{item.subject}</summary><pre>{item.body}</pre></details></td><td>{item.audienceLabel}</td><td>{faNumber(item.recipientCount)}</td><td>{faNumber(item.smsCount)}</td><td>{faNumber(item.notificationCount)}</td><td>{item.senderName || "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span><Bell size={22} /></span><strong>هنوز پیام گروهی ارسال نشده</strong><p>اولین ارسال گروهی پس از نگارش پیام بالا اینجا ثبت می‌شود.</p></div>}
    </section></>;
}
