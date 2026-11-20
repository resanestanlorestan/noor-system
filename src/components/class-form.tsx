"use client";

// الحاقیهٔ ۲.۱۹.۰ — فرم تعریف/ویرایش کلاس یا دورهٔ آموزشی: همهٔ مشخصات درخواستی
// (موضوع، سرفصل، گروه هدف چندگانه، شهرستان‌های چندگانه، زمان و محل، ظرفیت،
// مدرس با حساب سامانه، نوع برگزاری، مهلت ثبت‌نام، پوستر، جلسات چندگانه و
// پیکربندی یادآور/مهلت دعوت). تقویم شمسی با کامپوننت موجود سامانه.
import { useActionState, useState } from "react";
import { CalendarPlus, CircleAlert, CircleCheck, GraduationCap, Trash2, X } from "lucide-react";
import { JalaliDateInput } from "@/components/jalali-date-picker";
import { initialActionState } from "@/lib/action-state";
import type { ActionState } from "@/lib/action-state";
import { createClassAction, removePosterAction, updateClassAction } from "@/app/actions/classes";

type Option = { id: number | string; label: string; group?: string | null };

export type ClassFormInitial = {
  id?: string; title?: string; topic?: string; description?: string; syllabus?: string;
  formatType?: string; capacity?: number; startsOn?: string; startTime?: string; endTime?: string;
  location?: string; address?: string; teacherName?: string; teacherPhone?: string; teacherUserId?: string;
  deadlineDate?: string; deadlineTime?: string; reminderHours?: number; waitlistRespondHours?: number;
  countyIds?: number[]; specialtyIds?: number[]; status?: string; hasPoster?: boolean;
  sessions?: { startsOn: string; startTime: string; endTime: string; location?: string | null; teacherName?: string | null; notes?: string | null }[];
};

type SessionRow = { startsOn: string; startTime: string; endTime: string; location: string; teacherName: string; notes: string };

const emptySession: SessionRow = { startsOn: "", startTime: "08:00", endTime: "10:00", location: "", teacherName: "", notes: "" };

/** حذف پوستر با اکشن مستقل (فرم تودرتو مجاز نیست). */
function RemovePosterButton({ classId }: { classId: string }) {
  const [state, formAction, pending] = useActionState(removePosterAction, initialActionState);
  return <form action={formAction} className="cls-inline-form">
    <input type="hidden" name="classId" value={classId} />
    <button type="submit" className="cls-btn-danger-sm" disabled={pending}><Trash2 size={13} /> حذف پوستر</button>
    {state.error && <span className="cls-inline-error">{state.error}</span>}
    {state.success && <span className="cls-inline-ok">{state.success}</span>}
  </form>;
}

export function ClassForm({
  mode, counties, specialties, teachers, initial = {},
}: {
  mode: "create" | "edit";
  counties: Option[];
  specialties: Option[];
  teachers: Option[];
  initial?: ClassFormInitial;
}) {
  const action = mode === "create" ? createClassAction : updateClassAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [sessions, setSessions] = useState<SessionRow[]>(
    (initial.sessions?.length ? initial.sessions : []).map((s) => ({
      startsOn: s.startsOn, startTime: s.startTime, endTime: s.endTime,
      location: s.location ?? "", teacherName: s.teacherName ?? "", notes: s.notes ?? "",
    })),
  );
  const [posterPreview, setPosterPreview] = useState<string | null>(initial.hasPoster && initial.id ? `/api/classes/${initial.id}/poster` : null);

  const setSession = (index: number, patch: Partial<SessionRow>) => {
    setSessions((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return <form action={formAction} className="cls-form">
    {mode === "edit" && <input type="hidden" name="classId" value={initial.id} />}
    <input type="hidden" name="sessions" value={JSON.stringify(sessions.filter((s) => s.startsOn))} />

    <section className="cms-group">
      <div className="cms-group-head"><div><h2>مشخصات کلاس</h2><p>عنوان و موضوع و توضیحاتی که در پنل کاربران نمایش داده می‌شود.</p></div></div>
      <div className="cls-form-grid">
        <label>عنوان کلاس یا دوره *</label>
        <input name="title" defaultValue={initial.title} required maxLength={160} placeholder="مثلاً: دورهٔ تربیت معلم جزء‌خوانی" />
        <label>موضوع کلاس *</label>
        <input name="topic" defaultValue={initial.topic} required maxLength={200} placeholder="مثلاً: آموزش روش تدریس تجویدی" />
        <label>توضیحات</label>
        <textarea name="description" defaultValue={initial.description} rows={3} maxLength={4000} placeholder="توضیح کوتاه برای نمایش در صفحهٔ کلاس" />
        <label>سرفصل‌ها و محتوای آموزشی</label>
        <textarea name="syllabus" defaultValue={initial.syllabus} rows={4} maxLength={4000} placeholder="هر سرفصل در یک خط" />
      </div>
    </section>

    <section className="cms-group">
      <div className="cms-group-head"><div><h2>گروه هدف و شهرستان‌ها</h2><p>فقط فعالانِ دارای پروندهٔ تکمیل‌شده در این گروه‌ها و شهرستان‌ها دعوت و مجاز به ثبت‌نام می‌شوند.</p></div></div>
      <div className="cls-check-block">
        <strong>گروه‌های هدف (تخصص‌ها) *</strong>
        <div className="cls-check-grid">
          {specialties.map((s) => <label key={s.id} className="cls-check">
            <input type="checkbox" name="specialties" value={s.id} defaultChecked={initial.specialtyIds?.includes(Number(s.id))} />
            <span>{s.label}</span>
          </label>)}
        </div>
      </div>
      <div className="cls-check-block">
        <strong>شهرستان‌های هدف *</strong>
        <div className="cls-check-grid">
          {counties.map((c) => <label key={c.id} className="cls-check">
            <input type="checkbox" name="counties" value={c.id} defaultChecked={initial.countyIds?.includes(Number(c.id))} />
            <span>{c.group ? `${c.label} — ${c.group}` : c.label}</span>
          </label>)}
        </div>
      </div>
    </section>

    <section className="cms-group">
      <div className="cms-group-head"><div><h2>زمان، مکان و برگزاری</h2><p>برای دورهٔ چندجلسه‌ای، جلسات را در بخش «جلسات دوره» به‌تفکیک زمان‌بندی کنید.</p></div></div>
      <div className="cls-form-grid">
        <label>تاریخ برگزاری (جلسهٔ نخست) *</label>
        <JalaliDateInput name="startsOn" defaultValue={initial.startsOn} required ariaLabel="تاریخ برگزاری کلاس" />
        <label>ساعت شروع *</label>
        <input type="time" name="startTime" defaultValue={initial.startTime || "08:00"} required />
        <label>ساعت پایان *</label>
        <input type="time" name="endTime" defaultValue={initial.endTime || "10:00"} required />
        <label>محل برگزاری</label>
        <input name="location" defaultValue={initial.location} maxLength={180} placeholder="مثلاً: سالن فرهنگ قرآنی مرکز شهر" />
        <label>آدرس کامل</label>
        <textarea name="address" defaultValue={initial.address} rows={2} maxLength={1000} />
        <label>نوع برگزاری *</label>
        <select name="formatType" defaultValue={initial.formatType || "in_person"}>
          <option value="in_person">حضوری</option>
          <option value="online">آنلاین</option>
          <option value="hybrid">ترکیبی</option>
        </select>
        <label>ظرفیت کل (نفر) *</label>
        <input type="number" name="capacity" min={1} max={10000} defaultValue={initial.capacity ?? 20} required />
        <label>مهلت ثبت‌نام (تاریخ)</label>
        <JalaliDateInput name="registrationDeadlineDate" defaultValue={initial.deadlineDate} ariaLabel="مهلت ثبت‌نام" allowClear />
        <label>مهلت ثبت‌نام (ساعت)</label>
        <input type="time" name="registrationDeadlineTime" defaultValue={initial.deadlineTime || "23:59"} />
        <label>فاصلهٔ یادآور پیامکی (ساعت قبل از برگزاری)</label>
        <select name="reminderHours" defaultValue={String(initial.reminderHours ?? 48)}>
          <option value="24">۲۴ ساعت</option><option value="48">۴۸ ساعت</option>
          <option value="72">۷۲ ساعت</option><option value="168">یک هفته</option>
        </select>
        <label>مهلت پاسخ‌گویی دعوت لیست انتظار (ساعت)</label>
        <input type="number" name="waitlistRespondHours" min={1} max={168} defaultValue={initial.waitlistRespondHours ?? 24} />
      </div>
    </section>

    <section className="cms-group">
      <div className="cms-group-head"><div><h2>مدرس و پوستر</h2><p>اگر مدرس حساب کاربری در سامانه دارد، برای دسترسی به ثبت حضور و غیاب انتخابش کنید.</p></div></div>
      <div className="cls-form-grid">
        <label>نام و نام خانوادگی استاد *</label>
        <input name="teacherName" defaultValue={initial.teacherName} required maxLength={120} />
        <label>شماره تماس استاد</label>
        <input name="teacherPhone" defaultValue={initial.teacherPhone} maxLength={20} dir="ltr" placeholder="09xxxxxxxxx" />
        <label>حساب کاربری مدرس (اختیاری)</label>
        <select name="teacherUserId" defaultValue={initial.teacherUserId || ""}>
          <option value="">— بدون حساب سامانه —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label>پوستر کلاس (PNG/JPG/WebP، حداکثر ۱ مگابایت)</label>
        <input type="file" name="poster" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
          const file = e.target.files?.[0];
          setPosterPreview(file ? URL.createObjectURL(file) : (initial.hasPoster && initial.id ? `/api/classes/${initial.id}/poster` : null));
        }} />
        {posterPreview && <div className="cls-poster-preview"><img src={posterPreview} alt="پوستر کلاس" />
          {mode === "edit" && <RemovePosterButton classId={initial.id!} />}
        </div>}
      </div>
    </section>

    <section className="cms-group">
      <div className="cms-group-head"><div><h2>جلسات دوره</h2><p>برای دورهٔ چندجلسه‌ای، هر جلسه را با تاریخ و ساعت و محل مستقل اضافه کنید؛ حضور و غیاب به تفکیک همین جلسات ثبت می‌شود. ثبت‌نام شرکت‌کنندگان یک‌بار برای کل دوره است.</p></div></div>
      <div className="cls-sessions">
        {sessions.map((session, index) => <div key={index} className="cls-session-row">
          <strong>جلسهٔ {index + 1}</strong>
          <div className="cls-session-fields">
            <JalaliDateInput value={session.startsOn} onChange={(jalali) => setSession(index, { startsOn: jalali })} ariaLabel={`تاریخ جلسهٔ ${index + 1}`} />
            <input type="time" value={session.startTime} onChange={(e) => setSession(index, { startTime: e.target.value })} aria-label="ساعت شروع جلسه" />
            <input type="time" value={session.endTime} onChange={(e) => setSession(index, { endTime: e.target.value })} aria-label="ساعت پایان جلسه" />
            <input value={session.location} onChange={(e) => setSession(index, { location: e.target.value })} placeholder="محل جلسه (اختیاری)" />
            <input value={session.teacherName} onChange={(e) => setSession(index, { teacherName: e.target.value })} placeholder="مدرس جلسه (اختیاری)" />
            <input value={session.notes} onChange={(e) => setSession(index, { notes: e.target.value })} placeholder="توضیح جلسه (اختیاری)" />
          </div>
          <button type="button" className="cls-btn-danger-sm" onClick={() => setSessions((rows) => rows.filter((_, i) => i !== index))} aria-label="حذف جلسه"><X size={14} /></button>
        </div>)}
        <button type="button" className="cls-btn-add-session" onClick={() => setSessions((rows) => [...rows, { ...emptySession, location: "", teacherName: "" }])}>
          <CalendarPlus size={15} /> افزودن جلسه
        </button>
      </div>
    </section>

    {state.error && <p className="cls-message cls-message-error" role="alert"><CircleAlert size={15} /> {state.error}</p>}
    {state.success && <p className="cls-message cls-message-ok" role="status"><CircleCheck size={15} /> {state.success}</p>}
    <div className="cls-form-submit">
      <button type="submit" className="cls-btn-primary" disabled={pending}>
        <GraduationCap size={16} /> {pending ? "در حال ذخیره..." : mode === "create" ? "ایجاد کلاس" : "ذخیرهٔ تغییرات"}
      </button>
    </div>
  </form>;
}
