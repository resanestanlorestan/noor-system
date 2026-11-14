import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarPlus, Clock, Inbox, MapPin, Megaphone, Trash2, UserPlus, Users } from "lucide-react";
import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";
import { db } from "@/db";
import { activists, counties, provinces as provincesTable } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { scopeCondition } from "@/lib/data";
import { faDate, faNumber } from "@/lib/format";
import { maskPhone } from "@/lib/reminders";
import { smsProviderLabel } from "@/lib/messaging";
import {
  PARTICIPANT_STATUSES, REMINDER_HOUR_OPTIONS, eventKindLabels,
  listEvents, listParticipants, participantStatusLabels, type EventRow,
} from "@/lib/events";
import {
  addParticipantsAction, createEventAction, deleteEventAction, removeParticipantAction,
  sendEventRemindersAction, setParticipantStatusAction, updateEventAction,
} from "@/app/actions/events";
import { ActionForm, EventCreateForm, InviteHint, tehranLocalInput } from "@/components/event-forms";
import { ConfirmButton } from "@/components/case-controls";

const kindBadge: Record<string, string> = { meeting: "status-draft", workshop: "status-completing", competition: "status-pending", ceremony: "status-approved", course: "status-specialist" };

/** Current Tehran date → Jalali {jy, jm, jd}. */
function tehranJalali(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).split("-").map(Number);
  return toJalaali(parts[0], parts[1], parts[2]);
}

function eventDayKeys(rows: EventRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(row.startsAt).split("-").map(Number);
    const j = toJalaali(parts[0], parts[1], parts[2]);
    keys.add(`${j.jy}-${j.jm}-${j.jd}`);
  }
  return keys;
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireUser();
  if (!(await can(actor, "events.manage"))) redirect("/dashboard");
  const query = await searchParams;
  const now = new Date();
  const [allEvents, candidates, geoProvinces, geoCounties] = await Promise.all([
    listEvents(actor, { limit: 300 }),
    db.select({ id: activists.id, firstName: activists.firstName, lastName: activists.lastName, phone: activists.phone })
      .from(activists).where(scopeCondition(actor)).orderBy(activists.lastName).limit(500),
    db.select({ id: provincesTable.id, name: provincesTable.name }).from(provincesTable).orderBy(provincesTable.name),
    db.select({ id: counties.id, name: counties.name, provinceId: counties.provinceId }).from(counties).orderBy(counties.name),
  ]);
  const smsOn = smsProviderLabel();
  const upcoming = allEvents.filter((row) => row.startsAt.getTime() > now.getTime());
  const past = allEvents.filter((row) => row.startsAt.getTime() <= now.getTime()).reverse().slice(0, 8);
  const managed = upcoming.slice(0, 10);
  const participants = await Promise.all(managed.map((row) => listParticipants(actor, row.id)));

  // ---- Jalali month calendar for the current Tehran month ----
  const today = tehranJalali(now);
  const monthLen = jalaaliMonthLength(today.jy, today.jm);
  const firstGreg = toGregorian(today.jy, today.jm, 1);
  const firstWeekday = (new Date(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd).getDay() + 1) % 7; // Saturday = 0
  const marked = eventDayKeys(allEvents);
  const monthLabel = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd));
  const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLen }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const banner = typeof query.reminded === "string"
    ? { kind: "reminded" as const, sent: Number(query.reminded) || 0, sms: Number(query.sms) || 0, local: Number(query.local) || 0, noPhone: Number(query.noPhone) || 0 }
    : typeof query.created === "string" ? { kind: "created" as const } : null;
  const role = actor.effectiveRole ?? actor.role;
  const geo = role === "super_admin" ? "national" as const : role === "county_admin" ? "county" as const : "province" as const;

  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>رویدادها</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> تقویم و اطلاع‌رسانی</div><h1>رویدادهای قرآنی</h1><p>ثبت رویدادهای کشوری، استانی و شهرستانی، دعوت فعالان و یادآور پیامکی پیش از برگزاری</p></div></div>

    {banner?.kind === "created" && <div className="ws-notice"><CalendarPlus size={18} /> <strong>رویداد ثبت شد.</strong> حالا فعالان محدوده خود را دعوت کنید.</div>}
    {banner?.kind === "reminded" && <div className="ws-notice"><Megaphone size={18} /> {banner.sent ? <strong>{faNumber(banner.sent)} یادآور ارسال شد</strong> : <strong>یادآور تازه‌ای ارسال نشد</strong>}{banner.sent ? <> — {banner.sms ? `${faNumber(banner.sms)} پیامک در صف ارسال` : ""}{banner.local ? `${banner.sms ? " و " : ""}${faNumber(banner.local)} پیامک در حالت محلی ثبت شد` : ""}{banner.noPhone ? ` · ${faNumber(banner.noPhone)} دعوت‌شده بدون شماره` : ""}</> : " — همه دعوت‌شدگان قبلاً یادآوری شده‌اند یا رویداد در بازه یادآور نیست."}</div>}

    <div className="settings-grid events-grid">
      <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>تقویم ماه جاری</span><h2>{monthLabel}</h2><p>روزهای دارای رویداد با نقطه نشان داده شده‌اند</p></div><CalendarDays size={19} /></div>
        <div className="event-calendar"><div className="cal-week">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
          {cells.map((day, index) => {
            const key = day ? `${today.jy}-${today.jm}-${day}` : `empty-${index}`;
            const hasEvent = day ? marked.has(`${today.jy}-${today.jm}-${day}`) : false;
            const isToday = day === today.jd;
            return <span key={key} className={`cal-day${isToday ? " today" : ""}${hasEvent ? " has-event" : ""}`}>{day ? faNumber(day) : ""}{hasEvent && <i />}</span>;
          })}
        </div>
      </section>

      <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>ثبت رویداد</span><h2>رویداد جدید</h2><p>{geo === "national" ? "به‌صورت کشوری یا استانی/شهرستانی ثبت کنید" : geo === "county" ? "رویداد در سطح شهرستان شما ثبت می‌شود" : "رویداد در سطح استان شما ثبت می‌شود"}</p></div><CalendarPlus size={19} /></div>
        <EventCreateForm action={createEventAction} provinces={geoProvinces} counties={geoCounties} geo={geo} />
      </section>
    </div>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>{smsOn ? `پیامک واقعی از طریق ${smsOn} فعال است` : "حالت محلی: پیامک‌ها در صندوق پیام‌ها ذخیره می‌شوند"}</span><h2>رویدادهای پیش رو ({faNumber(upcoming.length)})</h2><p>یادآور پیامکی برای هر دعوت‌شده یک‌بار و در فاصله تعیین‌شده (پیش‌فرض ۴۸ ساعت) ارسال می‌شود؛ ارسال دستی یا خودکار با کرون روزانه</p></div><span className="panel-outline-icon"><CalendarDays size={18} /></span></div>
      {upcoming.length ? upcoming.slice(0, 10).map((row, index) => {
        const roster = participants[index] ?? [];
        const taken = new Set(roster.map((item) => item.activistId));
        const invitable = candidates.filter((item) => !taken.has(item.id));
        const confirmed = roster.filter((item) => item.status === "confirmed").length;
        return <details className="event-card" key={row.id}>
          <summary>
            <span className={`status-badge ${kindBadge[row.kind] || "status-draft"}`}>{eventKindLabels[row.kind]}</span>
            <strong>{row.title}</strong>
            <span className="event-meta"><Clock size={14} /> {faDate(row.startsAt, true)}</span>
            <span className="event-meta"><MapPin size={14} /> {[row.location, row.county, row.province].filter(Boolean).join("، ") || (row.provinceId === null && row.countyId === null ? "سراسری" : "—")}</span>
            <span className="event-meta"><Users size={14} /> {faNumber(row.participantCount)}{row.capacity ? ` / ${faNumber(row.capacity)}` : ""}{confirmed ? ` · ${faNumber(confirmed)} تأیید کرده` : ""}</span>
          </summary>
          <div className="event-detail">
            {row.description && <p className="event-description">{row.description}</p>}
            <p className="table-subtle">یادآور پیامکی: {row.reminderHours === 168 ? "یک هفته قبل" : `${faNumber(row.reminderHours)} ساعت قبل از شروع`} · ثبت‌کننده: {row.creatorName || "—"}</p>
            {roster.length ? <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>فعال</th><th>شماره</th><th>وضعیت حضور</th><th>یادآور</th><th>تغییر وضعیت</th><th>حذف</th></tr></thead><tbody>
              {roster.map((item) => <tr key={item.id}>
                <td>{item.caseId ? <Link className="table-link" href={`/cases/${item.caseId}`}>{item.firstName} {item.lastName}</Link> : `${item.firstName} ${item.lastName}`}</td>
                <td dir="ltr">{maskPhone(item.phone)}</td>
                <td><span className="status-badge status-pending">{participantStatusLabels[item.status]}</span></td>
                <td>{item.remindedAt ? faDate(item.remindedAt, true) : "—"}</td>
                <td><ActionForm action={setParticipantStatusAction} className="inline-form"><input type="hidden" name="participantId" value={item.id} /><select name="status" defaultValue={item.status}>{PARTICIPANT_STATUSES.map((status) => <option value={status} key={status}>{participantStatusLabels[status]}</option>)}</select><button className="secondary-button small-button" title="ثبت وضعیت">ثبت</button></ActionForm></td>
                <td><ActionForm action={removeParticipantAction} className="inline-form"><input type="hidden" name="participantId" value={item.id} /><ConfirmButton name="remove" value="yes" className="secondary-button small-button danger-button" confirmText={`دعوت ${item.firstName} ${item.lastName} حذف شود؟`}><Trash2 size={14} /></ConfirmButton></ActionForm></td>
              </tr>)}
            </tbody></table></div>
              : <div className="empty-state"><span><Users size={22} /></span><strong>هنوز کسی دعوت نشده</strong><p>از فرم «دعوت فعالان» زیر فعالان محدوده خود را به این رویداد اضافه کنید.</p></div>}

            <details className="invite-box"><summary><UserPlus size={15} /> دعوت فعالان <InviteHint count={invitable.length} /></summary>
              {invitable.length ? <ActionForm action={addParticipantsAction} className="management-form">
                <input type="hidden" name="eventId" value={row.id} />
                <div className="specialty-grid">{invitable.map((item) => <label key={item.id}><input type="checkbox" name="activistIds" value={item.id} /><span>{item.firstName} {item.lastName}{item.phone ? <small dir="ltr"> {maskPhone(item.phone)}</small> : <small> بدون شماره</small>}</span></label>)}</div>
                <button className="primary-button"><UserPlus size={15} /> افزودن دعوت‌شدگان</button>
              </ActionForm> : <p className="table-footnote">همه فعالان محدوده شما به این رویداد دعوت شده‌اند.</p>}
            </details>

            <div className="workflow-buttons">
              <ActionForm action={sendEventRemindersAction} className="inline-form"><input type="hidden" name="eventId" value={row.id} /><ConfirmButton name="send" value="yes" className="primary-button" confirmText={`یادآور برای دعوت‌شدگان «${row.title}» ارسال شود؟`}><Megaphone size={15} /> ارسال یادآور پیامکی</ConfirmButton></ActionForm>
              <ActionForm action={deleteEventAction} className="inline-form"><input type="hidden" name="eventId" value={row.id} /><ConfirmButton name="delete" value="yes" className="secondary-button danger-button" confirmText={`رویداد «${row.title}» و همه دعوت‌نامه‌های آن حذف شود؟`}><Trash2 size={15} /> حذف رویداد</ConfirmButton></ActionForm>
            </div>

            <details className="invite-box"><summary>ویرایش رویداد</summary>
              <ActionForm action={updateEventAction} className="management-form">
                <input type="hidden" name="eventId" value={row.id} />
                <div className="form-grid">
                  <label className="full-field">عنوان<input name="title" defaultValue={row.title} required minLength={3} maxLength={160} /></label>
                  <label>شروع<input type="datetime-local" name="startsAt" defaultValue={tehranLocalInput(row.startsAt)} required /></label>
                  <label>محل برگزاری<input name="location" defaultValue={row.location || ""} maxLength={160} /></label>
                  <label>ظرفیت<input type="number" name="capacity" min={2} max={10000} defaultValue={row.capacity || ""} /></label>
                  <label>یادآور پیامکی<select name="reminderHours" defaultValue={String(row.reminderHours)}>{REMINDER_HOUR_OPTIONS.map((hours) => <option value={hours} key={hours}>{hours === 168 ? "یک هفته قبل" : `${faNumber(hours)} ساعت قبل`}</option>)}</select></label>
                  <label className="full-field">توضیحات<textarea name="description" rows={2} defaultValue={row.description || ""} maxLength={1000} /></label>
                </div>
                <button className="secondary-button">ذخیره تغییرات</button>
              </ActionForm>
            </details>
          </div>
        </details>;
      }) : <div className="empty-state"><span><CalendarDays size={22} /></span><strong>رویداد پیش رو ثبت نشده</strong><p>اولین رویداد را از فرم «رویداد جدید» ثبت کنید و فعالان را دعوت کنید.</p></div>}
      <p className="table-footnote">یادآور خودکار روزانه با <code dir="ltr">GET /api/cron/events?key=CRON_SECRET</code> (تنظیم‌شده در cPanel) اجرا می‌شود و فقط دعوت‌شدگانِ بدون یادآور قبلی را پیامک می‌دهد. تاریخچه ارسال‌ها در <Link href="/outbox" className="ws-text-link">صندوق پیام‌ها</Link> و رویدادهای حساس ثبت می‌شود.</p>
    </section>

    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>آرشیو</span><h2>رویدادهای برگزارشده</h2><p>آخرین رویدادهای پایان‌یافته</p></div><span className="panel-outline-icon"><Inbox size={18} /></span></div>
      {past.length ? <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>رویداد</th><th>نوع</th><th>زمان</th><th>محدوده</th><th>دعوت‌شده</th></tr></thead><tbody>{past.map((row) => <tr key={row.id}><td><strong>{row.title}</strong></td><td>{eventKindLabels[row.kind]}</td><td>{faDate(row.startsAt, true)}</td><td>{[row.province, row.county].filter(Boolean).join(" / ") || "سراسری"}</td><td>{faNumber(row.participantCount)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span><CalendarDays size={22} /></span><strong>رویداد برگزارشده‌ای ثبت نشده</strong><p>پس از برگزاری، رویدادها به‌صورت خودکار به آرشیو منتقل می‌شوند.</p></div>}
    </section>
  </>;
}

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const metadata = { title: "رویدادها — سامانه جامع فعالان قرآنی" };
export const runtime = "nodejs";
