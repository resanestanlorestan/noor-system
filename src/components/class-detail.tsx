"use client";

// الحاقیهٔ ۲.۱۹.۰ — پنل جزئیات کلاس برای ادمین و مدرس: مشخصات و کنش‌های وضعیت
// (فعال‌سازی با دعوت خودکار، یادآور، اطلاع‌رسانی تغییر، لغو)، جلسات،
// ثبت‌نام‌کنندگان با تأیید/رد/پیامک دستی، لیست انتظار با دعوت/حذف/ترتیب،
// تاریخچهٔ پیامک‌ها و شبکهٔ حضور و غیاب هر جلسه با سوابق تغییر.
// مدرس فقط تب‌های «جلسات» و «حضور و غیاب» و فهرست کلاس خودش را می‌بیند.
import { useActionState, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BellRing, CalendarDays, CircleAlert, CircleCheck, Download, Image as ImageIcon, Mail, MessageSquare, Send, Trash2, Users } from "lucide-react";
import { JalaliDateInput } from "@/components/jalali-date-picker";
import { initialActionState } from "@/lib/action-state";
import type { ActionState } from "@/lib/action-state";
import {
  addSessionAction, decideRegistrationAction, deleteSessionAction, inviteNextWaitlistAction,
  moveWaitlistAction, notifyChangeAction, remindClassAction, removeWaitlistEntryAction,
  resendInvitesAction, respondInvitationAction, saveAttendanceAction, sendManualSmsAction,
  setClassStatusAction,
} from "@/app/actions/classes";

type ActionFn = (state: ActionState, data: FormData) => Promise<ActionState>;

const faDt = (iso: string | Date | null | undefined) => iso
  ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso))
  : "—";
const faN = (n: number | string) => new Intl.NumberFormat("fa-IR").format(Number(n));

export type ClassDetailProps = {
  id: string; title: string; topic: string; description: string | null; syllabus: string | null;
  status: string; formatType: string; capacity: number; startsOn: string; startTime: string; endTime: string;
  location: string | null; address: string | null; teacherName: string; teacherPhone: string | null;
  registrationDeadline: string | null; reminderHours: number; waitlistRespondHours: number;
  creatorName: string | null; hasPoster: boolean;
  registeredCount: number; waitlistCount: number; smsCount: number; eligibleCount: number;
  counties: { county: string; province: string }[]; specialties: string[];
  sessions: { id: string; sessionNo: number; startsOn: string; startTime: string; endTime: string; location: string | null; teacherName: string | null; notes: string | null }[];
  participants: { id: string; status: string; source: string; registeredAt: string; cancelledAt: string | null; cancelReason: string | null; approvedAt: string | null; userId: string; userFullName: string; caseName: string | null; phone: string | null; county: string | null; specialties: string | null }[];
  waitlist: { id: string; status: string; position: number; invitedAt: string | null; respondDeadline: string | null; respondedAt: string | null; createdAt: string; userId: string; userFullName: string; userPhone: string | null; county: string | null }[];
  sms: { id: string; kind: string; phone: string; message: string; status: string; error: string | null; createdAt: string; sentAt: string | null; userFullName: string | null; createdByName: string | null }[];
  attendanceEdits: { id: string; oldStatus: string | null; newStatus: string; note: string | null; changedAt: string; changedByName: string | null; sessionNo: number; userFullName: string | null }[];
  attendanceSummary: { userId: string; userFullName: string; percent: number; tally: { present: number; absent: number; late: number; excused: number } }[];
  isAdmin: boolean;
};

const statusLabels: Record<string, string> = { draft: "پیش‌نویس", active: "فعال", full: "تکمیل ظرفیت", cancelled: "لغوشده", held: "برگزارشده" };
const statusBadge: Record<string, string> = { draft: "status-draft", active: "status-approved", full: "status-completing", cancelled: "status-rejected", held: "status-specialist" };
const formatLabels: Record<string, string> = { in_person: "حضوری", online: "آنلاین", hybrid: "ترکیبی" };
const attendanceLabels: Record<string, string> = { present: "حاضر", absent: "غایب", late: "تأخیر", excused: "غیبت موجه" };
const waitlistLabels: Record<string, string> = { waiting: "در انتظار", invited: "دعوت‌شده", converted: "ثبت‌نام‌شده", declined: "انصراف‌داده", no_response: "عدم پاسخ", cancelled: "حذف‌شده" };
const smsKindLabels: Record<string, string> = { invite: "دعوت", reminder: "یادآور", change: "تغییر", cancel: "لغو", waitlist_invite: "دعوت لیست انتظار", waitlist_expired: "انقضای دعوت", manual: "دستی" };
const smsStatusLabels: Record<string, string> = { queued: "در صف", sent: "ارسال‌شده", failed: "ناموفق", local: "محلی" };

function ActionButton({ action, hidden, children, className = "cls-btn-sm", confirm, title }: {
  action: ActionFn; hidden: Record<string, string>; children: React.ReactNode; className?: string; confirm?: string; title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return <span className="cls-inline">
    <form action={formAction} className="cls-inline-form">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={className} title={title} disabled={pending}
        onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
        {pending ? "…" : children}
      </button>
    </form>
    {state.error && <span className="cls-inline-error">{state.error}</span>}
    {state.success && <span className="cls-inline-ok">{state.success}</span>}
  </span>;
}

export function ClassDetail(props: ClassDetailProps) {
  const isAdmin = props.isAdmin;
  const [tab, setTab] = useState<"overview" | "sessions" | "participants" | "waitlist" | "sms" | "attendance">(
    isAdmin ? "overview" : (props.sessions.length ? "attendance" : "sessions"));
  const remaining = Math.max(0, props.capacity - props.registeredCount);
  const tabs: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "مشخصات و کنش‌ها", icon: <CalendarDays size={14} /> },
    { key: "sessions", label: `جلسات (${faN(props.sessions.length)})`, icon: <CalendarDays size={14} /> },
    { key: "participants", label: `ثبت‌نام‌کنندگان (${faN(props.participants.filter((p) => p.status === "registered").length)})`, icon: <Users size={14} /> },
    { key: "waitlist", label: `لیست انتظار (${faN(props.waitlistCount)})`, icon: <Users size={14} /> },
    ...(isAdmin ? [{ key: "sms" as const, label: `پیامک‌ها (${faN(props.smsCount)})`, icon: <MessageSquare size={14} /> }] : []),
    { key: "attendance", label: "حضور و غیاب", icon: <BellRing size={14} /> },
  ];
  return <div className="cls-detail">
    <div className="cls-tabs" role="tablist">
      {tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`cls-tab ${tab === t.key ? "cls-tab-active" : ""}`} onClick={() => setTab(t.key)}>{t.icon} {t.label}</button>)}
    </div>
    {tab === "overview" && <Overview {...props} />}
    {tab === "sessions" && <Sessions {...props} />}
    {tab === "participants" && <Participants {...props} />}
    {tab === "waitlist" && <Waitlist {...props} />}
    {tab === "sms" && isAdmin && <SmsLog {...props} />}
    {tab === "attendance" && <Attendance {...props} />}
  </div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`cls-stat ${tone ?? ""}`}><strong>{value}</strong><small>{label}</small></div>;
}

function Overview(p: ClassDetailProps) {
  const [changeText, setChangeText] = useState("");
  return <div className="cls-tab-body">
    <div className="cls-stats-row">
      <Stat label="واجد شرایط" value={faN(p.eligibleCount)} />
      <Stat label="ثبت‌نام‌شده" value={faN(p.registeredCount)} />
      <Stat label="ظرفیت باقی‌مانده" value={faN(Math.max(0, p.capacity - p.registeredCount))} />
      <Stat label="لیست انتظار" value={faN(p.waitlistCount)} />
      <Stat label="پیامک‌ها" value={faN(p.smsCount)} />
      <Stat label="جلسات" value={faN(p.sessions.length)} />
    </div>
    {p.hasPoster && <div className="cls-poster-view"><img src={`/api/classes/${p.id}/poster`} alt={`پوستر کلاس ${p.title}`} /></div>}
    <div className="cls-info-grid">
      <div><small>وضعیت</small><span className={`cls-badge ${statusBadge[p.status]}`}>{statusLabels[p.status]}</span></div>
      <div><small>نوع برگزاری</small><span>{formatLabels[p.formatType]}</span></div>
      <div><small>زمان</small><span>{p.startsOn} ساعت {p.startTime} تا {p.endTime}</span></div>
      <div><small>محل</small><span>{p.location || "—"}</span></div>
      <div><small>مدرس</small><span>{p.teacherName}{p.teacherPhone ? ` — ${p.teacherPhone}` : ""}</span></div>
      <div><small>مهلت ثبت‌نام</small><span>{p.registrationDeadline ? faDt(p.registrationDeadline) : "تا لحظهٔ برگزاری"}</span></div>
      <div><small>شهرستان‌های هدف</small><span>{p.counties.map((c) => c.county).join("، ") || "—"}</span></div>
      <div><small>گروه‌های هدف</small><span>{p.specialties.join("، ") || "—"}</span></div>
      <div><small>ایجادکننده</small><span>{p.creatorName || "—"}</span></div>
    </div>
    {p.description && <div className="cls-text-block"><strong>توضیحات</strong><p>{p.description}</p></div>}
    {p.syllabus && <div className="cls-text-block"><strong>سرفصل‌ها</strong><p>{p.syllabus}</p></div>}
    {p.address && <div className="cls-text-block"><strong>آدرس</strong><p>{p.address}</p></div>}
    {p.isAdmin && <div className="cls-actions-panel">
      <strong>کنش‌های مدیریت</strong>
      <div className="cls-actions-row">
        {p.status === "draft" && <ActionButton action={setClassStatusAction} hidden={{ classId: p.id, status: "active" }} className="cls-btn-primary-sm" confirm="با فعال‌سازی، پیامک دعوت برای همهٔ افراد واجد شرایط ارسال می‌شود. ادامه؟"><Send size={13} /> فعال‌سازی و ارسال دعوت</ActionButton>}
        {["active", "full"].includes(p.status) && <>
          <ActionButton action={resendInvitesAction} hidden={{ classId: p.id }} title="دعوت برای افراد واجد شرایطِ بدون دعوت قبلی"><Send size={13} /> ارسال مجدد دعوت</ActionButton>
          <ActionButton action={remindClassAction} hidden={{ classId: p.id }} title="در پنجرهٔ یادآور (نزدیک به زمان برگزاری)"><BellRing size={13} /> ارسال یادآور</ActionButton>
        </>}
        {["active", "full"].includes(p.status) && <ActionButton action={setClassStatusAction} hidden={{ classId: p.id, status: "held" }} confirm="کلاس «برگزارشده» علامت می‌خورد و ثبت‌نام بسته می‌شود. ادامه؟">ثبت برگزاری</ActionButton>}
        {p.status !== "cancelled" && p.status !== "held" && <ActionButton action={setClassStatusAction} hidden={{ classId: p.id, status: "cancelled" }} className="cls-btn-danger-sm" confirm="کلاس لغو و به همهٔ ثبت‌نام‌کنندگان اطلاع‌رسانی می‌شود. ادامه؟"><Trash2 size={13} /> لغو کلاس</ActionButton>}
        <a className="cls-btn-sm" href={`/classes/${p.id}/edit`}>ویرایش کلاس</a>
      </div>
      {["active", "full"].includes(p.status) && <div className="cls-change-row">
        <input value={changeText} onChange={(e) => setChangeText(e.target.value)} placeholder="شرح تغییر برای اطلاع‌رسانی (مثلاً: محل برگزاری به سالن شمارهٔ ۲ تغییر کرد)" />
        <ActionButton action={notifyChangeAction} hidden={{ classId: p.id, changeText }} className="cls-btn-primary-sm" confirm="به همهٔ ثبت‌نام‌کنندگان فعال پیامک و اعلان تغییر ارسال می‌شود. ادامه؟"><Mail size={13} /> اطلاع‌رسانی تغییر</ActionButton>
      </div>}
      <div className="cls-exports">
        <strong>خروجی اکسل:</strong>
        {[["eligible", "واجد شرایط"], ["participants", "ثبت‌نام‌کنندگان"], ["cancelled", "انصراف‌داده‌ها"], ["waitlist", "لیست انتظار"], ["sms", "پیامک‌ها"], ["attendance", "حضور و غیاب"], ["info", "مشخصات"]].map(([key, label]) => <a key={key} className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=${key}`}><Download size={13} /> {label}</a>)}
      </div>
    </div>}
  </div>;
}

function Sessions(p: ClassDetailProps) {
  const [state, formAction, pending] = useActionState(addSessionAction, initialActionState);
  return <div className="cls-tab-body">
    {p.sessions.length === 0 && <p className="cls-empty">جلسه‌ای ثبت نشده است؛ برنامهٔ کلاس بر پایهٔ تاریخ اصلی کلاس است.</p>}
    <table className="cls-table">
      <thead><tr><th>جلسه</th><th>تاریخ</th><th>ساعت</th><th>محل</th><th>مدرس</th><th>توضیح</th>{p.isAdmin && <th> </th>}</tr></thead>
      <tbody>
        {[...p.sessions, ...(p.sessions.length === 0 ? [{ id: "-", sessionNo: 1, startsOn: p.startsOn, startTime: p.startTime, endTime: p.endTime, location: p.location, teacherName: p.teacherName, notes: null }] : [])].map((s) => <tr key={s.id}>
          <td>{faN(s.sessionNo)}</td>
          <td>{s.startsOn}</td>
          <td dir="ltr">{s.startTime} — {s.endTime}</td>
          <td>{s.location || "—"}</td>
          <td>{s.teacherName || "—"}</td>
          <td>{s.notes || "—"}</td>
          {p.isAdmin && <td>{s.id !== "-" && <ActionButton action={deleteSessionAction} hidden={{ classId: p.id, sessionId: s.id }} className="cls-btn-danger-sm" confirm="جلسه و حضور و غیاب آن حذف می‌شود. ادامه؟"><Trash2 size={13} /></ActionButton>}</td>}
        </tr>)}
      </tbody>
    </table>
    {p.isAdmin && <form action={formAction} className="cls-add-session">
      <input type="hidden" name="classId" value={p.id} />
      <strong>افزودن جلسهٔ تازه</strong>
      <div className="cls-session-fields">
        <JalaliDateInput name="startsOn" required ariaLabel="تاریخ جلسهٔ تازه" />
        <input type="time" name="startTime" defaultValue="08:00" aria-label="ساعت شروع" />
        <input type="time" name="endTime" defaultValue="10:00" aria-label="ساعت پایان" />
        <input name="location" placeholder="محل (اختیاری)" maxLength={180} />
        <input name="teacherName" placeholder="مدرس جلسه (اختیاری)" maxLength={120} />
        <input name="notes" placeholder="توضیح (اختیاری)" maxLength={500} />
      </div>
      <button type="submit" className="cls-btn-primary-sm" disabled={pending}>افزودن جلسه</button>
      {state.error && <span className="cls-inline-error">{state.error}</span>}
      {state.success && <span className="cls-inline-ok">{state.success}</span>}
    </form>}
  </div>;
}

function Participants(p: ClassDetailProps) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("registered");
  const rows = useMemo(() => p.participants.filter((r) =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (!q.trim() || [r.userFullName, r.caseName, r.phone, r.county, r.specialties].some((f) => (f ?? "").includes(q.trim())))),
    [p.participants, q, statusFilter]);
  return <div className="cls-tab-body">
    <div className="cls-filter-row">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو بر اساس نام، موبایل، شهرستان..." />
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="registered">ثبت‌نام‌شده</option>
        <option value="cancelled">انصراف‌داده</option>
        <option value="all">همه</option>
      </select>
      <a className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=participants`}><Download size={13} /> اکسل ثبت‌نام‌کنندگان</a>
      <a className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=cancelled`}><Download size={13} /> اکسل انصراف‌داده‌ها</a>
    </div>
    {rows.length === 0 && <p className="cls-empty">موردی یافت نشد.</p>}
    {rows.length > 0 && <table className="cls-table">
      <thead><tr><th>نام کاربر</th><th>نام پرونده</th><th>موبایل</th><th>شهرستان</th><th>گروه‌ها</th><th>منبع</th><th>زمان ثبت‌نام</th><th>وضعیت</th>{p.isAdmin && <th> </th>}</tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id} className={r.status === "cancelled" ? "cls-row-muted" : ""}>
          <td>{r.userFullName}</td>
          <td>{r.caseName || "—"}</td>
          <td dir="ltr">{r.phone || r.userFullName}</td>
          <td>{r.county || "—"}</td>
          <td>{r.specialties || "—"}</td>
          <td>{r.source === "waitlist" ? "لیست انتظار" : r.source === "admin" ? "ادمین" : "مستقیم"}</td>
          <td>{faDt(r.registeredAt)}</td>
          <td>{r.status === "registered" ? <span className="cls-badge status-approved">ثبت‌نام‌شده</span> : <span className="cls-badge status-draft">انصراف‌داده{r.cancelReason ? ` — ${r.cancelReason}` : ""}</span>}</td>
          {p.isAdmin && <td className="cls-row-actions">
            {r.status === "registered" && <>
              <ActionButton action={decideRegistrationAction} hidden={{ registrationId: r.id, classId: p.id, approve: "1" }} className="cls-btn-primary-sm" title="تأیید ثبت‌نام"><CircleCheck size={13} /></ActionButton>
              <ActionButton action={decideRegistrationAction} hidden={{ registrationId: r.id, classId: p.id, approve: "0", note: "رد توسط ادمین" }} className="cls-btn-danger-sm" title="رد ثبت‌نام (صندلی آزاد و نوبت لیست انتظار می‌رسد)"><Trash2 size={13} /></ActionButton>
              <ManualSmsButton classId={p.id} userId={r.userId} name={r.userFullName} />
            </>}
          </td>}
        </tr>)}
      </tbody>
    </table>}
  </div>;
}

function ManualSmsButton({ classId, userId, name }: { classId: string; userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return <span className="cls-inline">
    <button type="button" className="cls-btn-sm" onClick={() => setOpen((v) => !v)} title={`پیامک دستی به ${name}`}><MessageSquare size={13} /></button>
    {open && <div className="cls-manual-sms">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="متن پیامک دستی" maxLength={500} />
      <ActionButton action={sendManualSmsAction} hidden={{ classId, userId, text }} className="cls-btn-primary-sm"><Send size={13} /> ارسال</ActionButton>
    </div>}
  </span>;
}

function Waitlist(p: ClassDetailProps) {
  const active = p.waitlist.filter((w) => ["waiting", "invited"].includes(w.status));
  const history = p.waitlist.filter((w) => !["waiting", "invited"].includes(w.status));
  return <div className="cls-tab-body">
    <div className="cls-filter-row">
      <strong>ترتیب نوبت‌ها بر پایهٔ زمان درخواست است؛ با فلش‌ها اولویت را تغییر دهید.</strong>
      <a className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=waitlist`}><Download size={13} /> اکسل لیست انتظار</a>
      {p.isAdmin && <ActionButton action={inviteNextWaitlistAction} hidden={{ classId: p.id }} className="cls-btn-primary-sm"><Send size={13} /> دعوت نفر بعدی</ActionButton>}
    </div>
    {active.length === 0 && <p className="cls-empty">لیست انتظار خالی است.</p>}
    {active.length > 0 && <table className="cls-table">
      <thead><tr><th>نوبت</th><th>نام</th><th>موبایل</th><th>شهرستان</th><th>وضعیت</th><th>مهلت پاسخ</th>{p.isAdmin && <th> </th>}</tr></thead>
      <tbody>
        {active.map((w) => <tr key={w.id}>
          <td>{faN(w.position)}</td>
          <td>{w.userFullName}</td>
          <td dir="ltr">{w.userPhone || "—"}</td>
          <td>{w.county || "—"}</td>
          <td>
            <span className={`cls-badge ${w.status === "invited" ? "status-completing" : "status-pending"}`}>{waitlistLabels[w.status]}</span>
            {w.status === "invited" && w.respondDeadline && <small className="cls-deadline">مهلت: {faDt(w.respondDeadline)}</small>}
          </td>
          {p.isAdmin && <td className="cls-row-actions">
            <ActionButton action={moveWaitlistAction} hidden={{ classId: p.id, entryId: w.id, direction: "up" }} className="cls-btn-sm" title="اولویت بالاتر"><ArrowUp size={13} /></ActionButton>
            <ActionButton action={moveWaitlistAction} hidden={{ classId: p.id, entryId: w.id, direction: "down" }} className="cls-btn-sm" title="اولویت پایین‌تر"><ArrowDown size={13} /></ActionButton>
            <ActionButton action={removeWaitlistEntryAction} hidden={{ classId: p.id, entryId: w.id }} className="cls-btn-danger-sm" title="حذف از لیست انتظار"><Trash2 size={13} /></ActionButton>
          </td>}
        </tr>)}
      </tbody>
    </table>}
    {history.length > 0 && <>
      <strong className="cls-section-title">سابقهٔ لیست انتظار</strong>
      <table className="cls-table">
        <thead><tr><th>نام</th><th>وضعیت</th><th>زمان درخواست</th><th>زمان پاسخ</th></tr></thead>
        <tbody>{history.map((w) => <tr key={w.id} className="cls-row-muted">
          <td>{w.userFullName}</td><td>{waitlistLabels[w.status]}</td><td>{faDt(w.createdAt)}</td><td>{faDt(w.respondedAt)}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </div>;
}

function SmsLog(p: ClassDetailProps) {
  const [kind, setKind] = useState("all");
  const rows = p.sms.filter((s) => kind === "all" || s.kind === kind);
  return <div className="cls-tab-body">
    <div className="cls-filter-row">
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="all">همهٔ انواع</option>
        {Object.entries(smsKindLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <a className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=sms`}><Download size={13} /> اکسل پیامک‌ها</a>
    </div>
    {rows.length === 0 && <p className="cls-empty">پیامکی ثبت نشده است.</p>}
    {rows.length > 0 && <table className="cls-table">
      <thead><tr><th>نوع</th><th>گیرنده</th><th>نام</th><th>وضعیت</th><th>زمان</th><th>متن</th><th>فرستنده</th></tr></thead>
      <tbody>
        {rows.map((s) => <tr key={s.id}>
          <td>{smsKindLabels[s.kind] ?? s.kind}</td>
          <td dir="ltr">{s.phone}</td>
          <td>{s.userFullName || "—"}</td>
          <td><span className={`cls-badge ${s.status === "failed" ? "status-rejected" : s.status === "sent" ? "status-approved" : "status-pending"}`}>{smsStatusLabels[s.status] ?? s.status}{s.error ? ` — ${s.error}` : ""}</span></td>
          <td>{faDt(s.sentAt ?? s.createdAt)}</td>
          <td className="cls-msg-cell">{s.message}</td>
          <td>{s.createdByName || "سیستم"}</td>
        </tr>)}
      </tbody>
    </table>}
  </div>;
}

function Attendance(p: ClassDetailProps) {
  const [sessionId, setSessionId] = useState(p.sessions[0]?.id ?? "");
  const session = p.sessions.find((s) => s.id === sessionId) ?? p.sessions[0];
  const [entries, setEntries] = useState<Record<string, { status: string; notes: string }>>({});
  const [state, formAction, pending] = useActionState(saveAttendanceAction, initialActionState);
  const summaryFor = (userId: string) => p.attendanceSummary.find((s) => s.userId === userId);
  return <div className="cls-tab-body">
    {p.sessions.length === 0 && <p className="cls-empty">برای این کلاس جلسه‌ای تعریف نشده است؛ ابتدا از تب «جلسات» جلسه اضافه کنید یا در ویرایش کلاس جلسات دوره را ثبت نمایید.</p>}
    {p.sessions.length > 0 && <>
      <div className="cls-filter-row">
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="انتخاب جلسه">
          {p.sessions.map((s) => <option key={s.id} value={s.id}>جلسهٔ {faN(s.sessionNo)} — {s.startsOn} ({s.startTime})</option>)}
        </select>
      </div>
      {session && <form action={formAction} className="cls-attendance">
        <input type="hidden" name="classId" value={p.id} />
        <input type="hidden" name="sessionId" value={session.id} />
        <input type="hidden" name="entries" value={JSON.stringify(Object.entries(entries).map(([userId, e]) => ({ userId, status: e.status, notes: e.notes || undefined })))} />
        <table className="cls-table">
          <thead><tr><th>نام</th><th>شهرستان</th><th>وضعیت حضور</th><th>توضیح</th><th>درصد کل</th></tr></thead>
          <tbody>
            {p.participants.filter((r) => r.status === "registered").map((r) => {
              const entry = entries[r.userId] ?? { status: "", notes: "" };
              const summary = summaryFor(r.userId);
              return <tr key={r.id}>
                <td>{r.userFullName}</td>
                <td>{r.county || "—"}</td>
                <td className="cls-att-options">
                  {Object.entries(attendanceLabels).map(([key, label]) => <label key={key} className="cls-check-inline">
                    <input type="radio" name={`att-${r.userId}`} checked={entry.status === key} onChange={() => setEntries((prev) => ({ ...prev, [r.userId]: { status: key, notes: prev[r.userId]?.notes ?? "" } }))} />
                    <span>{label}</span>
                  </label>)}
                </td>
                <td><input value={entry.notes} onChange={(e) => setEntries((prev) => ({ ...prev, [r.userId]: { status: prev[r.userId]?.status ?? "", notes: e.target.value } }))} placeholder="توضیح (اختیاری)" maxLength={300} /></td>
                <td>{summary ? `${faN(summary.percent)}٪` : "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <div className="cls-form-submit">
          <button type="submit" className="cls-btn-primary" disabled={pending}>{pending ? "در حال ثبت..." : "ثبت حضور و غیاب جلسه"}</button>
          {state.error && <span className="cls-inline-error">{state.error}</span>}
          {state.success && <span className="cls-inline-ok"><CircleCheck size={14} /> {state.success}</span>}
        </div>
      </form>}
      <strong className="cls-section-title">درصد حضور کل دوره</strong>
      {p.attendanceSummary.length === 0 && <p className="cls-empty">هنوز حضور و غیابی ثبت نشده است.</p>}
      {p.attendanceSummary.length > 0 && <table className="cls-table">
        <thead><tr><th>نام</th><th>حاضر</th><th>غایب</th><th>تأخیر</th><th>غیبت موجه</th><th>درصد</th></tr></thead>
        <tbody>{p.attendanceSummary.map((s) => <tr key={s.userId}>
          <td>{s.userFullName}</td><td>{faN(s.tally.present)}</td><td>{faN(s.tally.absent)}</td><td>{faN(s.tally.late)}</td><td>{faN(s.tally.excused)}</td><td><strong>{faN(s.percent)}٪</strong></td>
        </tr>)}</tbody>
      </table>}
      {p.attendanceEdits.length > 0 && p.isAdmin && <>
        <strong className="cls-section-title">سوابق تغییرات حضور</strong>
        <table className="cls-table">
          <thead><tr><th>زمان</th><th>جلسه</th><th>نام</th><th>از</th><th>به</th><th>ثبت‌کننده</th><th>توضیح</th></tr></thead>
          <tbody>{p.attendanceEdits.map((e) => <tr key={e.id}>
            <td>{faDt(e.changedAt)}</td><td>{faN(e.sessionNo)}</td><td>{e.userFullName || "—"}</td>
            <td>{e.oldStatus ? attendanceLabels[e.oldStatus] : "—"}</td><td>{attendanceLabels[e.newStatus]}</td>
            <td>{e.changedByName || "—"}</td><td>{e.note || "—"}</td>
          </tr>)}</tbody>
        </table>
      </>}
      <div className="cls-exports"><a className="cls-btn-sm" href={`/api/classes/${p.id}/export?type=attendance`}><Download size={13} /> اکسل حضور و غیاب</a></div>
    </>}
    {p.isAdmin && <p className="cls-hint"><ImageIcon size={13} /> حضور و غیاب هر جلسه مستقل است و هر تغییر با نام ثبت‌کننده در سوابق می‌ماند.</p>}
  </div>;
}

// اعلان‌های دعوت لیست انتظار برای کاربر (استفاده‌شده در نمای کاربر)
export function InvitationBanner({ classId, deadline }: { classId: string; deadline: string }) {
  const [state, formAction, pending] = useActionState(respondInvitationAction, initialActionState);
  return <div className="cls-invite-banner" role="status">
    <CircleAlert size={16} />
    <div>
      <strong>نوبت شما رسید!</strong>
      <p>یک ظرفیت در این کلاس آزاد شده است. تا {faDt(deadline)} ثبت‌نام را نهایی کنید؛ پس از مهلت، نوبت به نفر بعدی منتقل می‌شود.</p>
      <form action={formAction} className="cls-inline-form">
        <input type="hidden" name="classId" value={classId} />
        <button type="submit" name="accept" value="1" className="cls-btn-primary-sm" disabled={pending}>ثبت‌نام نهایی</button>
        <button type="submit" name="accept" value="0" className="cls-btn-sm" disabled={pending}>انصراف</button>
        {state.error && <span className="cls-inline-error">{state.error}</span>}
      </form>
    </div>
  </div>;
}
