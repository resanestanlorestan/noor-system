import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, Download, Inbox, MessageSquare, Send, Timer } from "lucide-react";
import { db } from "@/db";
import { caseReminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { statusLabels } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/format";
import { smsProviderLabel } from "@/lib/messaging";
import { DEFAULT_THRESHOLD_DAYS, THRESHOLD_OPTIONS, listOverdueCases, listRecentReminders, maskPhone, parseThreshold } from "@/lib/reminders";
import { sendRemindersAction } from "@/app/actions/reminders";
import { ConfirmButton } from "@/components/case-controls";

const thresholdLabels: Record<number, string> = { 7: "۷ روز", 14: "۱۴ روز", 30: "۳۰ روز" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireUser();
  if (!(await can(actor, "reminders.send"))) redirect("/dashboard");
  const query = await searchParams;
  const days = parseThreshold(typeof query.days === "string" ? query.days : undefined);
  const [cases, history] = await Promise.all([
    listOverdueCases(actor, days),
    listRecentReminders(15),
  ]);
  const eligible = cases.filter((item) => !item.cooldownActive);
  const banner = typeof query.sent === "string" ? { sent: Number(query.sent) || 0, sms: Number(query.sms) || 0, local: Number(query.local) || 0, skipped: Number(query.skipped) || 0 } : null;
  const smsOn = smsProviderLabel();
  const responsible = (item: Awaited<ReturnType<typeof listOverdueCases>>[number]) =>
    item.expertId && item.expertActive ? `${item.expertName || "کارشناس"} (کارشناس)`
    : item.creatorRole && item.creatorRole !== "activist" && item.creatorActive ? `${item.creatorName || "ثبت‌کننده"} (ثبت‌کننده)`
    : item.activistUserId ? "خودِ فعال" : "—";
  const responsiblePhone = (item: Awaited<ReturnType<typeof listOverdueCases>>[number]) =>
    item.expertId && item.expertActive ? item.expertPhone
    : item.creatorRole && item.creatorRole !== "activist" && item.creatorActive ? item.creatorPhone
    : item.activistPhone;

  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>یادآور معوق‌ها</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پیگیری خودکار</div><h1>یادآور پیامکی پرونده‌های معوق</h1><p>پرونده‌هایی که بیش از حد تعیین‌شده بدون به‌روزرسانی در کارتابل بررسی مانده‌اند</p></div></div>

    {banner && <div className="ws-notice"><BellRing size={18} /> {banner.sent ? <strong>{faNumber(banner.sent)} یادآور ارسال شد</strong> : <strong>یادآوری ارسال نشد</strong>}{banner.sent ? <> — {banner.sms ? `${faNumber(banner.sms)} پیامک در صف ارسال` : ""}{banner.local ? `${banner.sms ? " و " : ""}${faNumber(banner.local)} پیامک در حالت محلی ثبت شد` : ""}</> : banner.skipped ? ` — ${faNumber(banner.skipped)} مورد در بازه یادآوری قبلی بود` : " — موردی واجد شرایط نبود."}</div>}

    <section className="ws-panel"><div className="ws-panel-head"><div><span>آستانه معوق‌بودن</span><h2>پرونده‌های بدون به‌روزرسانی بیش از</h2><p>تعریف معوق مطابق کارت داشبورد و گزارش‌ها؛ فقط وضعیت‌های «در انتظار بررسی» و «بررسی تخصصی»</p></div><span className="panel-outline-icon"><Timer size={18} /></span></div>
      <div className="filter-chips">{THRESHOLD_OPTIONS.map((option) => <Link key={option} href={`/reminders?days=${option}`} className={`chip ${option === days ? "active" : ""}`}>{thresholdLabels[option]}</Link>)}</div>
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>{smsOn ? `پیامک واقعی از طریق ${smsOn} فعال است` : "حالت محلی: پیامک‌ها در صندوق پیام‌ها ذخیره می‌شوند"}</span><h2>{faNumber(cases.length)} پرونده معوق{eligible.length ? ` — ${faNumber(eligible.length)} مورد آماده ارسال` : ""}</h2><p>مسئول یادآوری: کارشناس ارجاع‌شده، در نبود او ثبت‌کننده سازمانی و در نهایت خودِ فعال. هر پرونده حداکثر هر ۳ روز یک یادآور می‌گیرد.</p></div><span className="panel-outline-icon"><BellRing size={18} /></span><Link className="secondary-button" href={`/api/exports/overdue?days=${days}`}><Download size={16} /> خروجی اکسل</Link></div>
      {cases.length ? <form action={sendRemindersAction}><input type="hidden" name="days" value={days} /><div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>انتخاب</th><th>فعال</th><th>محدوده</th><th>وضعیت</th><th>روز انتظار</th><th>مسئول یادآوری</th><th>شماره تماس</th><th>یادآور قبلی</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td>{item.cooldownActive ? <small className="table-subtle">در بازه</small> : <input type="checkbox" name="caseIds" value={item.id} defaultChecked aria-label={`یادآور برای ${item.activistName}`} />}</td><td><Link className="table-link" href={`/cases/${item.id}`}>{item.activistName}</Link></td><td>{[item.province, item.county].filter(Boolean).join(" / ") || "—"}</td><td><span className="status-badge status-pending">{statusLabels[item.status]}</span></td><td><strong>{faNumber(item.waitingDays)}</strong> روز</td><td>{responsible(item)}</td><td dir="ltr">{maskPhone(responsiblePhone(item))}</td><td>{item.lastReminderAt ? faDate(item.lastReminderAt, true) : "—"}</td></tr>)}</tbody></table></div>
        {eligible.length ? <div className="workflow-buttons"><ConfirmButton className="primary-button" name="confirm" value="yes" confirmText={`${faNumber(eligible.length)} یادآور ارسال شود؟`}><Send size={16} /> ارسال یادآور ({faNumber(eligible.length)} مورد)</ConfirmButton></div> : <p className="table-footnote">همه موارد در بازه ۳ روزه یادآوری قبلی هستند؛ پس از پایان بازه دوباره قابل ارسال‌اند.</p>}
      </form> : <div className="empty-state"><span><BellRing size={22} /></span><strong>پرونده معوقی در محدوده شما نیست</strong><p>وقتی پرونده‌ای بیش از {thresholdLabels[days]} بدون به‌روزرسانی بماند، اینجا برای ارسال یادآور دیده می‌شود.</p></div>}
      <p className="table-footnote">هر ارسال در رویدادهای حساس ثبت می‌شود و پیامک‌ها در <Link href="/outbox" className="ws-text-link">صندوق پیام‌ها</Link> قابل مشاهده‌اند.</p>
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>تاریخچه</span><h2>یادآورهای اخیر</h2><p>آخرین یادآورهای ثبت‌شده در سامانه</p></div><span className="panel-outline-icon"><Inbox size={18} /></span></div>
      {history.length ? <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>فعال</th><th>گیرنده</th><th>شماره</th><th>نوع</th><th>متن</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{faDate(item.createdAt, true)}</td><td>{item.activistName}</td><td>{item.recipientName}</td><td dir="ltr">{maskPhone(item.recipientPhone)}</td><td><span className="table-channel"><MessageSquare size={14} /> {item.automated ? "خودکار" : "دستی"}</span></td><td><details className="outbox-body"><summary>نمایش</summary><pre>{item.message}</pre></details></td></tr>)}</tbody></table></div> : <div className="empty-state"><span><Send size={22} /></span><strong>هنوز یادآوری ارسال نشده</strong><p>اولین یادآورها پس از ارسال از فهرست بالا اینجا ثبت می‌شوند.</p></div>}
    </section></>;
}
