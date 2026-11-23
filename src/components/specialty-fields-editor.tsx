"use client";
// الحاقیهٔ ۲.۲۸.۰ — ویرایشگر پویای «فیلد جزئیات» هر تخصص در پنل مدیریت
// تخصص‌های قرآنی (/forms). نوع فیلد، عنوان، راهنما، سقف انتخاب و تک‌تک
// گزینه‌ها (برچسب، مخفی‌سازی، افزودن، حذف، ترتیب) — همه بدون کدنویسی و با
// ذخیرهٔ سمت سرور (saveSpecialtyDetailAction) و بازنشانی به پیش‌فرض کد
// (resetSpecialtyDetailAction). کلیدهای گزینه پایدار می‌مانند؛ گزینهٔ جدید
// کلید تازهٔ opt_ می‌گیرد و گزینهٔ مخفی‌شده فقط از فرم تازه حذف می‌شود.
//
// الحاقیهٔ ۲.۲۸.۱ — ویرایش پیاپی گزینه‌ها بدون بازگشت به فرم‌ساز: کادر برچسب
// هر گزینه کادر مرئی دارد، هر ردیف دکمهٔ ویرایش (پرش و فوکوس) و «ذخیره و
// بعدی» دارد و پس از ذخیرهٔ موفق کادر گزینهٔ بعدی خودکار فوکوس می‌شود.
// کلید پنل دیگر با هر ذخیره عوض نمی‌شود (فقط تغییر تخصص یا بازنشانی) تا
// فوکوس، اسکرول و حالت ویرایش در میانهٔ کار از بین نرود.
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, LoaderCircle, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { resetSpecialtyDetailAction, saveSpecialtyDetailAction } from "@/app/actions/forms";
import { initialActionState } from "@/lib/action-state";
import { specialtyDetailKindLabels, type SpecialtyDetailMeta } from "@/lib/constants";
import { newOptionKey } from "@/lib/form-config";

type EditorOption = { key: string; label: string; hidden?: boolean };

export function SpecialtyFieldsEditor({ code, title, meta }: { code: string; title: string; meta: SpecialtyDetailMeta }) {
  const [state, action, pending] = useActionState(saveSpecialtyDetailAction, initialActionState);
  const [resetState, resetAction, resetPending] = useActionState(async (_state: Awaited<ReturnType<typeof resetSpecialtyDetailAction>>, data: FormData) => resetSpecialtyDetailAction(data), initialActionState);
  const [kind, setKind] = useState<SpecialtyDetailMeta["kind"]>(meta.kind);
  const [label, setLabel] = useState(meta.label || "");
  const [hint, setHint] = useState(meta.hint || "");
  const [maxOptions, setMaxOptions] = useState(meta.maxOptions ? String(meta.maxOptions) : "");
  const [options, setOptions] = useState<EditorOption[]>(() => meta.options.map((option) => ({ ...option })));
  // الحاقیهٔ ۲.۲۸.۱ — ویرایش پیاپی: مرجع کادر برچسب هر گزینه + شمارهٔ گزینهٔ
  // بعدی برای پرش خودکار پس از ذخیرهٔ موفق («ذخیره و بعدی»)
  const labelRefs = useRef(new Map<string, HTMLInputElement>());
  const advanceIndexRef = useRef<number | null>(null);
  const lastStateRef = useRef(state);
  // بازنشانی به پیش‌فرض سامانه: پنل با کلید تازه مونت می‌شود تا از متای تازهٔ
  // سرور همگام شود؛ مقایسه با رندر قبلی (الگوی رسمی ری‌اکت برای تنظیم حالت
  // وابسته به پراپ، بدون اثر جانبی)
  const [lastResetState, setLastResetState] = useState(resetState);
  const [resetNonce, setResetNonce] = useState(0);
  if (resetState !== lastResetState) {
    setLastResetState(resetState);
    if (resetState.success) setResetNonce((n) => n + 1);
  }
  const focusOption = useCallback((optionKey: string) => {
    const el = labelRefs.current.get(optionKey);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);
  // پس از ذخیرهٔ موفق با «ذخیره و بعدی»: پرش مستقیم به کادر گزینهٔ بعدی؛
  // در خطا پرش لغو می‌شود تا کاربر همان ردیف را اصلاح کند.
  useEffect(() => {
    if (state === lastStateRef.current) return;
    lastStateRef.current = state;
    const target = advanceIndexRef.current;
    advanceIndexRef.current = null;
    if (!state.success || target === null) return;
    const next = options[target];
    if (next) focusOption(next.key);
  }, [state, options, focusOption]);
  const hasOptions = kind === "juz" || kind === "level" || kind === "checklist";
  const move = (index: number, delta: number) => setOptions((current) => {
    const next = [...current]; const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const addOption = () => setOptions((current) => [...current, { key: newOptionKey(), label: "" }]);
  const updateOption = (index: number, patch: Partial<EditorOption>) => setOptions((current) => current.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  const removeOption = (index: number) => setOptions((current) => current.filter((_, i) => i !== index));
  return <section className="ws-panel detail-section" key={`${code}:${resetNonce}`}>
    <div className="detail-section-head"><div><span>فیلد جزئیات تخصص</span><h2>تنظیمات جزئیات «{title}»</h2><p>نوع فیلد، عنوان، راهنما، سقف انتخاب و همهٔ گزینه‌ها را از همین‌جا ویرایش کنید؛ تغییرات بلافاصله در ویزارد ثبت پرونده، صفحهٔ جزئیات، رزومه و خروجی اکسل اعمال می‌شود. کلیدهای ذخیره‌سازی پایدار می‌مانند و دادهٔ پرونده‌های قبلی بدون هیچ تغییری می‌ماند؛ گزینهٔ مخفی‌شده فقط از فرم تازه حذف می‌شود و در نمایش سوابق قدیمی همچنان معتبر است.</p></div>{meta.overridden ? <span className="spec-overridden-badge">ویرایش‌شده</span> : null}</div>
    <form action={action} className="management-form spec-fields-form">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="options" value={JSON.stringify(options)} />
      <div className="form-grid">
        <label>نوع فیلد جزئیات<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as SpecialtyDetailMeta["kind"])}>{Object.entries(specialtyDetailKindLabels).map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}</select></label>
        <label>عنوان فیلد<input name="label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={200} placeholder="مثلاً میزان حفظ / حوزه‌های فعالیت" /></label>
        <label className="full-field">متن راهنمای زیر فیلد<input name="hint" value={hint} onChange={(event) => setHint(event.target.value)} maxLength={500} placeholder="اختیاری" /></label>
        {kind === "checklist" && <label>سقف انتخاب گزینه‌ها<input name="maxOptions" value={maxOptions} onChange={(event) => setMaxOptions(event.target.value)} inputMode="numeric" maxLength={2} placeholder="خالی = بدون سقف" /></label>}
      </div>
      {hasOptions && <div className="spec-fields-options">
        <div className="detail-section-head"><div><span>گزینه‌های فیلد</span><h3>فهرست گزینه‌ها</h3><p>{kind === "juz" ? "برچسب‌های میزان حفظ — کلید هر گزینه (۱ تا ۳۰ و complete) پایدار می‌ماند." : kind === "level" ? "برچسب‌های سطح — کلیدها پایدار می‌مانند." : "برای ویرایش هر گزینه، روی آیکون مداد بزنید یا مستقیم در کادر «برچسب» بنویسید؛ با «ذخیره و بعدی» همهٔ تغییرات ذخیره و کادر گزینهٔ بعدی برای ویرایش باز می‌شود. ترتیب نمایش با فلش‌ها عوض می‌شود."}</p></div></div>
        <div className="county-list">
          {options.map((option, index) => <div className="spec-option-row" key={option.key}>
            <span className="spec-option-index">{index + 1}</span>
            <div className="spec-option-tools">
              <button type="button" title="بالا" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button>
              <button type="button" title="پایین" onClick={() => move(index, 1)} disabled={index === options.length - 1}><ArrowDown size={13} /></button>
              <button type="button" title="ویرایش برچسب این گزینه" onClick={() => focusOption(option.key)}><Pencil size={13} /></button>
              <button type="button" title={option.hidden ? "نمایش در فرم" : "مخفی‌سازی از فرم"} className={option.hidden ? "secondary-button" : "row-remove"} onClick={() => updateOption(index, { hidden: !option.hidden })}><EyeOff size={13} /></button>
              <button type="button" title="حذف کامل گزینه" className="row-remove" onClick={() => { if (window.confirm(`گزینهٔ «${option.label || option.key}» از تنظیمات حذف شود؟ داده‌های قدیمی با این گزینه همچنان نمایش داده می‌شوند.`)) removeOption(index); }}><Trash2 size={13} /></button>
            </div>
            <label className="spec-option-label">برچسب<input ref={(el) => { if (el) labelRefs.current.set(option.key, el); }} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} maxLength={100} placeholder="برچسب فارسی گزینه" /></label>
            <code dir="ltr" className="spec-option-key">{option.key}{option.hidden ? " · مخفی" : ""}</code>
            <button type="submit" className="spec-option-save" title="ذخیرهٔ همهٔ تنظیمات فیلد و رفتن به گزینهٔ بعدی" disabled={pending} onClick={() => { advanceIndexRef.current = index < options.length - 1 ? index + 1 : null; }}>{index < options.length - 1 ? "ذخیره و بعدی" : "ذخیره"}</button>
          </div>)}
        </div>
        <button type="button" className="secondary-button" onClick={addOption}><Plus size={15} /> افزودن گزینهٔ تازه</button>
        <small className="spec-fields-note">حذف کامل گزینه فقط از تنظیمات پاک می‌کند؛ برای نگه‌داشتن دادهٔ قدیمی و بستن انتخاب جدید، همان گزینه را «مخفی» کنید.</small>
      </div>}
      {state.error && <div className="form-error" role="alert">{state.error}</div>}
      {state.success && <div className="form-success" role="status">{state.success}</div>}
      <div className="spec-fields-actions">
        <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : null} ذخیرهٔ تنظیمات فیلد</button>
        <button type="button" className="secondary-button" onClick={() => { setKind(meta.kind); setLabel(meta.label || ""); setHint(meta.hint || ""); setMaxOptions(meta.maxOptions ? String(meta.maxOptions) : ""); setOptions(meta.options.map((option) => ({ ...option }))); }}><X size={15} /> بازگردانی فرم به آخرین ذخیره</button>
      </div>
    </form>
    {meta.overridden && <form action={resetAction} className="inline-form spec-reset-form">
      <input type="hidden" name="code" value={code} />
      <button className="row-remove" disabled={resetPending} onClick={(event) => { if (!window.confirm("تنظیم ذخیره‌شدهٔ این تخصص حذف و به پیش‌فرض سامانه بازگردانده شود؟ دادهٔ پرونده‌ها دست‌نخورده می‌ماند.")) event.preventDefault(); }}><RotateCcw size={14} /> بازنشانی به پیش‌فرض سامانه</button>
      {resetState.error && <div className="form-error" role="alert">{resetState.error}</div>}
      {resetState.success && <div className="form-success" role="status">{resetState.success}</div>}
    </form>}
  </section>;
}
