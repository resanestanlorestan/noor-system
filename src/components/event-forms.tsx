"use client";
import { useActionState, useState } from "react";
import { CalendarDays, LoaderCircle, Plus } from "lucide-react";
import { initialActionState, type ActionState } from "@/lib/action-state";

type Province = { id: number; name: string };
type County = { id: number; name: string; provinceId: number };

/** Tehran-local value for <input type="datetime-local"> from a Date. */
export function tehranLocalInput(value: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value).replace(" ", "T");
}

/** Generic client wrapper: renders server-rendered children inside a form bound
 *  to a server action with useActionState, surfacing the returned error. */
export function ActionForm({ action, children, className }: { action: (state: ActionState, data: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return <form action={formAction} className={className}>{children}{state?.error && <div className="form-error" role="alert">{state.error}</div>}</form>;
}

export function EventCreateForm({ action, provinces, counties, geo }: { action: (state: ActionState, data: FormData) => Promise<ActionState>; provinces: Province[]; counties: County[]; geo: "national" | "province" | "county" }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [province, setProvince] = useState("");
  // Computed once at mount: <input type="datetime-local"> defaults to two days ahead, on the hour, Tehran-local.
  const [defaultStart] = useState(() => {
    const base = new Date(Date.now() + 2 * 86400000);
    base.setMinutes(0, 0, 0);
    return tehranLocalInput(base);
  });
  return <form action={formAction} className="management-form">
    <div className="form-grid">
      <label className="full-field">عنوان رویداد<input name="title" required minLength={3} maxLength={160} placeholder="مثلاً هم‌اندیشی فعالان قرآنی استان" /></label>
      <label>نوع رویداد<select name="kind" defaultValue="meeting">{(["meeting", "workshop", "competition", "ceremony", "course"] as const).map((kind) => <option value={kind} key={kind}>{({ meeting: "جلسه هم‌اندیشی", workshop: "کارگاه آموزشی", competition: "مسابقه قرآنی", ceremony: "مراسم و افتخارآفرینی", course: "دوره آموزشی" })[kind]}</option>)}</select></label>
      <label>شروع<input type="datetime-local" name="startsAt" required defaultValue={defaultStart} /></label>
      <label>پایان (اختیاری)<input type="datetime-local" name="endsAt" /></label>
      <label>محل برگزاری<input name="location" maxLength={160} placeholder="مثلاً سالن اجلاس اداره کل" /></label>
      <label>ظرفیت (اختیاری)<input type="number" name="capacity" min={2} max={10000} placeholder="مثلاً ۸۰" /></label>
      <label>یادآور پیامکی<select name="reminderHours" defaultValue="48">{[24, 48, 72, 168].map((hours) => <option value={hours} key={hours}>{hours === 168 ? "یک هفته قبل" : `${new Intl.NumberFormat("fa-IR").format(hours)} ساعت قبل`}</option>)}</select></label>
      {geo === "national" && <>
        <label>استان (خالی = کشوری)<select name="provinceId" value={province} onChange={(event) => setProvince(event.target.value)}><option value="">سراسری (کشوری)</option>{provinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>شهرستان<select name="countyId" disabled={!province}><option value="">همه شهرستان‌های استان</option>{counties.filter((item) => String(item.provinceId) === province).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </>}
      {geo === "province" && <label className="full-field"><small className="table-subtle">رویداد در سطح استان شما ثبت می‌شود (برای همه شهرستان‌ها).</small></label>}
      {geo === "county" && <label className="full-field"><small className="table-subtle">رویداد در سطح شهرستان شما ثبت می‌شود.</small></label>}
      <label className="full-field">توضیحات<textarea name="description" rows={2} maxLength={1000} placeholder="توضیح کوتاه برنامه" /></label>
    </div>
    {state?.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <CalendarDays size={16} />} ثبت رویداد</button>
  </form>;
}

export function InviteHint({ count }: { count: number }) {
  return count ? <small className="table-subtle">{new Intl.NumberFormat("fa-IR").format(count)} فعال در محدوده شما قابل دعوت است.</small> : <small className="table-subtle">فعال قابل دعوتی در محدوده شما باقی نمانده است.</small>;
}

export const PlusIcon = Plus;
