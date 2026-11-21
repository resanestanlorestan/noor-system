"use client";

// الحاقیهٔ ۲.۱۹.۰ — «کلاس‌ها و دوره‌های آموزشی» در پنل کاربر: فقط کلاس‌های
// متناسب با گروه و شهرستان خودِ کاربر؛ دکمهٔ درست بر اساس وضعیت (ثبت‌نام /
// ورود به لیست انتظار / مشاهدهٔ وضعیت / لغو ثبت‌نام) و بنر دعوت لیست انتظار
// با مهلت پاسخ. اعلان دلیلِ عدم واجد شرایط بودن هنگام ثبت‌نام نمایش داده می‌شود.
import { useActionState, useState } from "react";
import { CalendarDays, CircleAlert, CircleCheck, Clock, GraduationCap, MapPin, Users } from "lucide-react";
import { initialActionState } from "@/lib/action-state";
import type { ActionState } from "@/lib/action-state";
import { cancelRegistrationAction, joinWaitlistAction, registerClassAction } from "@/app/actions/classes";
import { InvitationBanner } from "@/components/class-detail";

const faN = (n: number | string) => new Intl.NumberFormat("fa-IR").format(Number(n));
const faDt = (iso: string | null) => iso
  ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso))
  : "—";
const statusLabels: Record<string, string> = { active: "در حال ثبت‌نام", full: "تکمیل ظرفیت", held: "برگزارشده" };

export type UserClassCard = {
  id: string; title: string; topic: string; description: string | null; syllabus: string | null;
  status: string; formatType: string; capacity: number; startsOn: string; startTime: string; endTime: string;
  location: string | null; address: string | null; teacherName: string;
  registrationDeadline: string | null; deadlinePassed: boolean; hasPoster: boolean; sessionCount: number;
  registeredCount: number;
  myRegistrationId: string | null; myCancelled: boolean;
  myWaitlistStatus: string | null; myWaitlistDeadline: string | null;
  eligible: boolean; eligibilityReason?: string;
};

const formatLabels: Record<string, string> = { in_person: "حضوری", online: "آنلاین", hybrid: "ترکیبی" };

function ActionRow({ action, hidden, label, className = "cls-btn-primary", confirm }: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>; hidden: Record<string, string>; label: string; className?: string; confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return <span className="cls-inline">
    <form action={formAction} className="cls-inline-form">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={className} disabled={pending} onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
        {pending ? "…" : label}
      </button>
    </form>
    {state.error && <span className="cls-inline-error"><CircleAlert size={13} /> {state.error}</span>}
    {state.success && <span className="cls-inline-ok"><CircleCheck size={13} /> {state.success}</span>}
  </span>;
}

function Card({ cls }: { cls: UserClassCard }) {
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, cls.capacity - cls.registeredCount);
  const deadlinePassed = cls.deadlinePassed;
  const registered = !!cls.myRegistrationId;
  return <article className="cls-card">
    <header className="cls-card-head">
      <div>
        <h3>{cls.title}</h3>
        <p>{cls.topic}</p>
      </div>
      <span className={`cls-badge ${cls.status === "active" ? "status-approved" : cls.status === "full" ? "status-completing" : "status-specialist"}`}>
        {statusLabels[cls.status] ?? cls.status}
      </span>
    </header>
    {cls.hasPoster && <img className="cls-card-poster" src={`/api/classes/${cls.id}/poster`} alt={`پوستر ${cls.title}`} />}
    <div className="cls-card-meta">
      <span><CalendarDays size={14} /> {cls.startsOn} ساعت {cls.startTime} تا {cls.endTime}{cls.sessionCount > 1 ? ` — ${faN(cls.sessionCount)} جلسه` : ""}</span>
      {cls.location && <span><MapPin size={14} /> {cls.location}</span>}
      <span><Users size={14} /> مدرس: {cls.teacherName}</span>
      <span><Clock size={14} /> {formatLabels[cls.formatType]} — ظرفیت: {faN(cls.registeredCount)}/{faN(cls.capacity)}{cls.status !== "held" ? ` (باقی‌مانده: ${faN(remaining)})` : ""}</span>
      {cls.registrationDeadline && <span><Clock size={14} /> مهلت ثبت‌نام: {faDt(cls.registrationDeadline)}</span>}
    </div>
    {open && <div className="cls-card-body">
      {cls.description && <p>{cls.description}</p>}
      {cls.syllabus && <div><strong>سرفصل‌ها:</strong><p>{cls.syllabus}</p></div>}
      {cls.address && <div><strong>آدرس:</strong><p>{cls.address}</p></div>}
    </div>}
    <button type="button" className="cls-link-btn" onClick={() => setOpen((v) => !v)}>{open ? "بستن جزئیات" : "جزئیات و سرفصل‌ها"}</button>

    <footer className="cls-card-actions">
      {registered && <>
        <span className="cls-badge status-approved"><CircleCheck size={13} /> ثبت‌نام‌شده — منتظر شما هستیم</span>
        {cls.status !== "held" && <ActionRow action={cancelRegistrationAction} hidden={{ classId: cls.id }} label="لغو ثبت‌نام" className="cls-btn-danger-sm" confirm="ثبت‌نام شما لغو می‌شود؛ در صورت تکمیل ظرفیت، ورود مجدد فقط از راه لیست انتظار ممکن است. ادامه؟" />}
      </>}
      {!registered && cls.myWaitlistStatus === "invited" && cls.myWaitlistDeadline && <InvitationBanner classId={cls.id} deadline={cls.myWaitlistDeadline} />}
      {!registered && cls.myWaitlistStatus === "waiting" && <span className="cls-badge status-pending">در لیست انتظار — پس از آزاد شدن ظرفیت پیامک دعوت می‌گیرید</span>}
      {!registered && !cls.myWaitlistStatus && cls.myCancelled && <small className="cls-muted-note">ثبت‌نام قبلی شما لغو شده است{cls.status !== "held" ? "؛ می‌توانید دوباره ثبت‌نام کنید" : ""}.</small>}
      {!registered && !cls.myWaitlistStatus && cls.status === "active" && remaining > 0 && !deadlinePassed && !cls.eligible &&
        <span className="cls-muted-note">{cls.eligibilityReason ?? "شما واجد شرایط این کلاس نیستید."}</span>}
      {!registered && !cls.myWaitlistStatus && cls.status === "active" && remaining > 0 && !deadlinePassed && cls.eligible &&
        <ActionRow action={registerClassAction} hidden={{ classId: cls.id }} label="ثبت‌نام در کلاس" confirm={`برای «${cls.title}» ثبت‌نام می‌کنید؟`} />}
      {!registered && !cls.myWaitlistStatus && (cls.status === "full" || (cls.status === "active" && remaining <= 0)) && !deadlinePassed && cls.eligible &&
        <ActionRow action={joinWaitlistAction} hidden={{ classId: cls.id }} label="ورود به لیست انتظار" confirm="با آزاد شدن ظرفیت، به ترتیب نوبت دعوت می‌شوید. در لیست انتظار ثبت می‌شوید؟" />}
      {deadlinePassed && !registered && !cls.myWaitlistStatus && <span className="cls-muted-note">مهلت ثبت‌نام این کلاس گذشته است.</span>}
    </footer>
  </article>;
}

export function MyClassesView({ rows, myAttendance }: {
  rows: UserClassCard[];
  myAttendance: { classTitle: string; sessionNo: number; startsOn: string; status: string; notes: string | null }[];
}) {
  const attendanceLabels: Record<string, string> = { present: "حاضر", absent: "غایب", late: "تأخیر", excused: "غیبت موجه" };
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1><GraduationCap size={20} /> کلاس‌ها و دوره‌های آموزشی</h1>
        <p>کلاس‌هایی که برای گروه و شهرستان شما تعریف شده‌اند؛ برای شرکت در هر کلاس ثبت‌نام کنید و اگر ظرفیت پر بود در لیست انتظار بنشینید.</p>
      </div>
    </header>
    {rows.length === 0 && <p className="cls-empty">
      در حال حاضر کلاسی متناسب با گروه و شهرستان پروندهٔ شما تعریف نشده است. با تکمیل پرونده و ثبت تخصص‌ها، کلاس‌های مرتبط در این صفحه نمایش داده می‌شود.
    </p>}
    <div className="cls-cards">{rows.map((cls) => <Card key={cls.id} cls={cls} />)}</div>
    {myAttendance.length > 0 && <section className="cls-activity">
      <strong>سوابق حضور من در کلاس‌ها</strong>
      <table className="cls-table">
        <thead><tr><th>کلاس</th><th>جلسه</th><th>تاریخ</th><th>وضعیت</th><th>توضیح</th></tr></thead>
        <tbody>{myAttendance.map((a, i) => <tr key={i}>
          <td>{a.classTitle}</td><td>{faN(a.sessionNo)}</td><td>{a.startsOn}</td>
          <td>{attendanceLabels[a.status] ?? a.status}</td><td>{a.notes || "—"}</td>
        </tr>)}</tbody>
      </table>
    </section>}
  </div>;
}
