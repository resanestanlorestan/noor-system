"use client";

/* تقویم شمسی استاندارد سامانه (نسخهٔ ۲.۱۱.۰)
 * همهٔ فیلدهای تاریخ سامانه از این کامپوننت استفاده می‌کنند؛ انتخاب تاریخ فقط
 * با کلیک روی روزِ تقویم انجام می‌شود و نمایش همیشه با نام ماه‌ها، روزهای هفته
 * و ارقام فارسی است. مبنای محاسبات، تبدیل واقعی تقویم جلالی با کتابخانهٔ
 * jalaali-js است — نه تقویم میلادی و نه تبدیل ظاهری.
 * - JalaliDateInput: مقدار فرم = متن شمسی «jy/mm/jd» با ارقام لاتین؛ همهٔ
 *   parserهای سرور (jalaliToIso) همین قالب را می‌پذیرند و تغییری لازم ندارند.
 * - JalaliDateTimeInput (رویدادها): مقدار فرم = «YYYY-MM-DDTHH:mm» به وقت
 *   تهران؛ همان قالبی که parseStart اکشن رویدادها می‌پذیرد.
 * پنجرهٔ تقویم با پورتال و position:fixed رندر می‌شود تا داخل پنل‌های دارای
 * overflow:hidden (مانند فرم‌های مرحله‌ای) بریده نشود. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAY_INITIALS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const JALALI_YEAR_MIN = 1300;
export const JALALI_YEAR_MAX = 1450;
const POP_WIDTH = 278;

const pad2 = (value: number) => String(value).padStart(2, "0");
const faDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

export type JalaliDate = { jy: number; jm: number; jd: number };

/** پذیرش هم‌زمان متن شمسی «1403/05/12» (با ارقام فارسی یا لاتین) و تاریخ ISO
 *  میلادی «2024-08-02» (قالب ذخیره‌شده در پایگاه داده) و بازگرداندن تاریخ جلالی. */
export function parseJalaliOrIso(raw: string | null | undefined): JalaliDate | null {
  if (!raw) return null;
  const latin = raw.trim().replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  let match = latin.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const [jy, jm, jd] = match.slice(1).map(Number);
    if (jy < 1200 || jy > 1500) return null; // هم‌راستا با محدودهٔ jalaliToIso سمت سرور
    return isValidJalaaliDate(jy, jm, jd) ? { jy, jm, jd } : null;
  }
  match = latin.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const [gy, gm, gd] = match.slice(1).map(Number);
    const probe = new Date(gy, gm - 1, gd);
    if (Number.isNaN(probe.getTime()) || probe.getFullYear() !== gy || probe.getMonth() !== gm - 1 || probe.getDate() !== gd) return null;
    return toJalaali(gy, gm, gd);
  }
  return null;
}

/** متن شمسی استاندارد فرم با ارقام لاتین (همان قالبی که jalaliToIso می‌پذیرد). */
export function jalaliText(date: JalaliDate) { return `${date.jy}/${pad2(date.jm)}/${pad2(date.jd)}`; }

const todayJalali = (): JalaliDate => { const now = new Date(); return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate()); };
const weekdayIndex = (date: JalaliDate) => { const g = toGregorian(date.jy, date.jm, date.jd); return (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7; };
const gregorianIso = (date: JalaliDate) => { const g = toGregorian(date.jy, date.jm, date.jd); return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`; };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** جای‌گذاری ثابت (fixed) پنجرهٔ تقویم کنار فیلد با پرهیز از لبه‌های صفحه. */
function usePopupPlacement(open: boolean, triggerRef: React.RefObject<HTMLElement | null>, popRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useIsoLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const trigger = triggerRef.current; const pop = popRef.current;
      if (!trigger || !pop) return;
      const rect = trigger.getBoundingClientRect();
      const popHeight = pop.offsetHeight || 352;
      const viewWidth = window.innerWidth; const viewHeight = window.innerHeight;
      const left = Math.min(Math.max(8, rect.right - POP_WIDTH), Math.max(8, viewWidth - POP_WIDTH - 8));
      const below = rect.bottom + popHeight + 12 < viewHeight;
      const top = below ? rect.bottom + 6 : Math.max(8, rect.top - popHeight - 6);
      setPos({ left, top: Math.min(top, Math.max(8, viewHeight - popHeight - 8)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, triggerRef, popRef]);
  return pos;
}

function useDismiss(open: boolean, wrapRef: React.RefObject<HTMLElement | null>, popRef: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open, wrapRef, popRef, onClose]);
}

/** بدنهٔ تقویم: هدر ماه/سال با جابه‌جایی آزاد بین ماه‌ها و سال‌ها، شبکهٔ روزها
 *  با شنبه‌شروع ایرانی و پانویس «امروز» (فقط جابه‌جایی دید، نه انتخاب). */
function CalendarBody({ view, onNavigate, selected, onSelect, showTime, hour, minute, onHour, onMinute }: {
  view: JalaliDate;
  onNavigate: (next: JalaliDate) => void;
  selected: JalaliDate | null;
  onSelect: (jd: number) => void;
  showTime?: boolean;
  hour?: string;
  minute?: string;
  onHour?: (value: string) => void;
  onMinute?: (value: string) => void;
}) {
  const today = todayJalali();
  const monthLength = jalaaliMonthLength(view.jy, view.jm);
  const leading = weekdayIndex({ jy: view.jy, jm: view.jm, jd: 1 });
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: monthLength }, (_, index) => index + 1)];
  const stepMonth = (delta: number) => {
    let jm = view.jm + delta; let jy = view.jy;
    if (jm < 1) { jm = 12; jy -= 1; } if (jm > 12) { jm = 1; jy += 1; }
    if (jy < JALALI_YEAR_MIN || jy > JALALI_YEAR_MAX) return;
    onNavigate({ jy, jm, jd: 1 });
  };
  return <>
    <div className="jalali-pop-head">
      <button type="button" className="jalali-nav" onClick={() => stepMonth(-1)} aria-label="ماه قبل"><ChevronRight size={15} /></button>
      <select aria-label="ماه شمسی" value={view.jm} onChange={(event) => onNavigate({ jy: view.jy, jm: Number(event.target.value), jd: 1 })}>
        {JALALI_MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
      </select>
      <select aria-label="سال شمسی" value={view.jy} onChange={(event) => onNavigate({ jy: Number(event.target.value), jm: view.jm, jd: 1 })}>
        {Array.from({ length: JALALI_YEAR_MAX - JALALI_YEAR_MIN + 1 }, (_, index) => JALALI_YEAR_MIN + index).map((year) => <option key={year} value={year}>{faDigits(year)}</option>)}
      </select>
      <button type="button" className="jalali-nav" onClick={() => stepMonth(1)} aria-label="ماه بعد"><ChevronLeft size={15} /></button>
    </div>
    <div className="jalali-weekdays" aria-hidden>{WEEKDAY_INITIALS.map((initial) => <span key={initial}>{initial}</span>)}</div>
    <div className="jalali-grid">
      {cells.map((jd, index) => jd === null
        ? <span className="jalali-empty-cell" key={`empty-${index}`} />
        : <button type="button" key={jd} className={`jalali-day${selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === jd ? " is-selected" : ""}${today.jy === view.jy && today.jm === view.jm && today.jd === jd ? " is-today" : ""}`} onClick={() => onSelect(jd)}>{faDigits(jd)}</button>)}
    </div>
    {showTime && <div className="jalali-time-row"><Clock3 size={14} /><span>ساعت</span>
      <select aria-label="ساعت" value={hour} onChange={(event) => onHour?.(event.target.value)}>
        {Array.from({ length: 24 }, (_, index) => pad2(index)).map((value) => <option key={value} value={value}>{faDigits(value)}</option>)}
      </select>
      <span>دقیقه</span>
      <select aria-label="دقیقه" value={minute} onChange={(event) => onMinute?.(event.target.value)}>
        {Array.from({ length: 60 }, (_, index) => pad2(index)).map((value) => <option key={value} value={value}>{faDigits(value)}</option>)}
      </select>
    </div>}
    <div className="jalali-foot">
      <span>امروز: {faDigits(jalaliText(today))}</span>
      <button type="button" className="jalali-today-btn" onClick={() => onNavigate({ ...today })}>رفتن به ماه جاری</button>
    </div>
  </>;
}

function useRequiredGuard(required: boolean | undefined, hasValue: boolean, setMissing: (missing: boolean) => void, focusRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!required) return;
    const form = focusRef.current?.closest("form");
    if (!form) return;
    const onSubmit = (event: Event) => {
      if (hasValue) return;
      event.preventDefault(); event.stopPropagation();
      setMissing(true);
      focusRef.current?.focus();
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [required, hasValue, setMissing, focusRef]);
}

function Trigger({ text, filled, missing, open, label, onClick, inputRef }: {
  text: string; filled: boolean; missing: boolean; open: boolean; label: string; onClick: () => void; inputRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return <button type="button" ref={inputRef} className={`jalali-trigger${filled ? " has-value" : ""}${missing ? " is-missing" : ""}`} onClick={onClick} aria-haspopup="dialog" aria-expanded={open} aria-label={label}>
    <CalendarDays size={15} />
    <span>{text}</span>
  </button>;
}

export function JalaliDateInput({ name, defaultValue, value, onChange, required, placeholder = "انتخاب تاریخ", ariaLabel, allowClear = true }: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (jalali: string) => void;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  allowClear?: boolean;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || "");
  const current = controlled ? value || "" : inner;
  const parsed = parseJalaliOrIso(current);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JalaliDate>(() => parsed || todayJalali());
  const [missing, setMissing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const placement = usePopupPlacement(open, triggerRef, popRef);
  useDismiss(open, wrapRef, popRef, () => setOpen(false));
  useRequiredGuard(required, Boolean(parsed), setMissing, triggerRef);

  const toggle = () => {
    if (!open) setView(parsed || todayJalali());
    setOpen((state) => !state);
  };
  const commit = (jalali: string) => {
    if (!controlled) setInner(jalali);
    onChange?.(jalali);
    setMissing(false);
    setOpen(false);
  };

  return <div className="jalali-field" ref={wrapRef}>
    {name !== undefined && <input type="hidden" name={name} value={current} />}
    <Trigger text={parsed ? faDigits(jalaliText(parsed)) : placeholder} filled={Boolean(parsed)} missing={missing} open={open} label={ariaLabel || "انتخاب تاریخ شمسی"} onClick={toggle} inputRef={triggerRef} />
    {missing && !parsed && <small className="jalali-hint">انتخاب تاریخ از تقویم شمسی الزامی است.</small>}
    {parsed && allowClear && <button type="button" className="jalali-clear" onClick={() => commit("")} aria-label="پاک کردن تاریخ"><X size={13} /></button>}
    {open && createPortal(
      <div className="jalali-pop" role="dialog" aria-label="تقویم شمسی" ref={popRef} style={{ left: placement?.left ?? -9999, top: placement?.top ?? -9999 }}>
        <CalendarBody view={view} onNavigate={setView} selected={parsed} onSelect={(jd) => commit(jalaliText({ jy: view.jy, jm: view.jm, jd }))} />
      </div>, document.body)}
  </div>;
}

export function JalaliDateTimeInput({ name, defaultValue, required, ariaLabel, allowClear = true, defaultTime = "08:00" }: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  ariaLabel?: string;
  allowClear?: boolean;
  defaultTime?: string;
}) {
  const [dateText, setDateText] = useState(() => {
    const parsed = parseJalaliOrIso(defaultValue || "");
    return parsed ? jalaliText(parsed) : "";
  });
  const [time, setTime] = useState(() => {
    const match = (defaultValue || "").match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : defaultTime;
  });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JalaliDate>(() => parseJalaliOrIso(dateText) || todayJalali());
  const [missing, setMissing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const placement = usePopupPlacement(open, triggerRef, popRef);
  useDismiss(open, wrapRef, popRef, () => setOpen(false));
  useRequiredGuard(required, Boolean(dateText), setMissing, triggerRef);

  const [hour, minute] = time.split(":");
  const selected = parseJalaliOrIso(dateText);
  const toggle = () => {
    if (!open) setView(selected || todayJalali());
    setOpen((state) => !state);
  };
  const commit = (jalali: string) => {
    setDateText(jalali);
    setMissing(false);
    setOpen(false);
  };
  const formValue = dateText ? `${gregorianIso(parseJalaliOrIso(dateText)!)}T${hour}:${minute}` : "";

  return <div className="jalali-field" ref={wrapRef}>
    <input type="hidden" name={name} value={formValue} />
    <Trigger text={selected ? `${faDigits(jalaliText(selected))} — ${faDigits(hour)}:${faDigits(minute)}` : "انتخاب تاریخ و ساعت"} filled={Boolean(selected)} missing={missing} open={open} label={ariaLabel || "انتخاب تاریخ و ساعت شمسی"} onClick={toggle} inputRef={triggerRef} />
    {missing && !selected && <small className="jalali-hint">انتخاب تاریخ از تقویم شمسی الزامی است.</small>}
    {selected && allowClear && <button type="button" className="jalali-clear" onClick={() => { setDateText(""); setMissing(false); }} aria-label="پاک کردن تاریخ و ساعت"><X size={13} /></button>}
    {open && createPortal(
      <div className="jalali-pop" role="dialog" aria-label="تقویم شمسی" ref={popRef} style={{ left: placement?.left ?? -9999, top: placement?.top ?? -9999 }}>
        <CalendarBody view={view} onNavigate={setView} selected={selected} showTime hour={hour} minute={minute}
          onHour={(value) => setTime(`${value}:${minute}`)}
          onMinute={(value) => setTime(`${hour}:${value}`)}
          onSelect={(jd) => { const text = jalaliText({ jy: view.jy, jm: view.jm, jd }); commit(text); }} />
      </div>, document.body)}
  </div>;
}
