"use client";

// الحاقیهٔ ۲.۱۸.۵ — مدیریت لوگوی سایت: انتخاب فایل (کامپیوتر/موبایل)، پیش‌نمایش
// لوگوی جدید قبل از ذخیره در همان اندازه‌هایی که در سایت دیده می‌شود، آپلود با
// اعتبارسنجی دوطرفه و حذف/بازگشت به پیش‌فرض — فارسی و RTL و هم‌سبک داشبورد.
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, ImageUp, Loader2, Trash2 } from "lucide-react";
import { removeLogoAction, uploadLogoAction } from "@/app/actions/cms";
import type { ActionState } from "@/lib/action-state";

const MAX_BYTES = 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
const faBytes = (n: number) => n >= 1024 ? `${new Intl.NumberFormat("fa-IR").format(Math.round(n / 1024))} کیلوبایت` : `${new Intl.NumberFormat("fa-IR").format(n)} بایت`;
const faTime = (iso: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function LogoManager({ logoUrl, logoMime, logoName, logoSize, logoUpdatedAt, logoWidth, logoHeight, updatedByName }: {
  logoUrl: string | null;
  logoMime: string | null;
  logoName: string | null;
  logoSize: number | null;
  logoUpdatedAt: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  updatedByName: string | null;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // آزادسازی object URL پیشین هنگام تغییر یا تخریب
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pick = (picked: File | null) => {
    setClientError(null);
    setPreviewDims(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!picked) { setFile(null); return; }
    const okType = /^image\/(png|jpeg|webp|svg\+xml)$/.test(picked.type) || /\.(png|jpe?g|webp|svg)$/i.test(picked.name);
    if (!okType) { setClientError("این فرمت پشتیبانی نمی‌شود؛ یک فایل PNG، JPG، WEBP یا SVG انتخاب کنید."); return; }
    if (picked.size > MAX_BYTES) { setClientError("حجم فایل بیش از سقف مجاز است؛ حداکثر ۱ مگابایت."); return; }
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  const submit = (fd: FormData) => {
    startUpload(async () => {
      const res = await uploadLogoAction({}, fd);
      setState(res);
      if (!res.error) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(null); setPreviewUrl(null); setPreviewDims(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const remove = (fd: FormData) => {
    startRemove(async () => {
      const res = await removeLogoAction({}, fd);
      setState(res);
    });
  };

  const error = clientError || state.error || null;
  const notice = error
    ? <p className="cms-notice error" role="alert"><CircleAlert size={13} /> {error}</p>
    : state.success
      ? <p className={`cms-notice ${state.warning ? "warn" : "ok"}`} role="status"><Check size={13} /> {state.success}</p>
      : null;

  return <div className="logo-manager">
    {notice}
    <div className="logo-grid">
      <section className="cms-group">
        <div className="cms-group-head"><div><h2>لوگوی فعلی سایت</h2><p>این تصویر اکنون در منوی سامانه، صفحات ورود و ثبت‌نام و آیکن مرورگر (favicon) نمایش داده می‌شود.</p></div></div>
        <div className="logo-current">
          <div className="logo-box">
            {logoUrl
              ? <img src={logoUrl} alt="لوگوی فعلی سایت" className="logo-img-preview" />
              : <div className="logo-default-note"><span className="ws-brand-logo-fallback">نور</span><small>آیکن پیش‌فرض برنامه</small></div>}
          </div>
          <div className="logo-meta">
            <span className={`cms-chip ${logoUrl ? "custom" : "default"}`}>{logoUrl ? "لوگوی سفارشی" : "پیش‌فرض برنامه"}</span>
            {logoName && <p><b>فایل:</b> {logoName}</p>}
            {logoSize != null && <p><b>حجم:</b> {faBytes(logoSize)}</p>}
            {logoWidth != null && logoHeight != null && <p><b>ابعاد:</b> <span dir="ltr">{logoWidth}×{logoHeight}</span></p>}
            {logoMime && <p><b>فرمت:</b> {logoMime.replace("image/", "").replace("svg+xml", "svg").toUpperCase()}</p>}
            {logoUpdatedAt && <p><b>آخرین تغییر:</b> {faTime(logoUpdatedAt)}{updatedByName ? ` — توسط ${updatedByName}` : ""}</p>}
          </div>
        </div>
        {logoUrl && <form action={remove}>
          <input type="hidden" name="remove" value="1" />
          <button type="submit" className="secondary-button danger" disabled={removing}>
            {removing ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} حذف لوگو و بازگشت به پیش‌فرض برنامه
          </button>
        </form>}
      </section>
      <section className="cms-group">
        <div className="cms-group-head"><div><h2>آپلود لوگوی جدید</h2><p>فایل را از کامپیوتر یا موبایل انتخاب کنید؛ پیش‌نمایش را ببینید و سپس ذخیره کنید. نسبت ابعاد لوگو در همهٔ اندازه‌ها با object-fit حفظ می‌شود و چیدمان سایت به‌هم نمی‌ریزد.</p></div></div>
        <form action={submit}>
          <input type="hidden" name="has-file" value="1" />
          <label className="logo-picker">
            <input ref={inputRef} type="file" name="file" accept={ACCEPT} onChange={(event) => pick(event.target.files?.[0] ?? null)} />
            <ImageUp size={20} />
            <strong>{file ? file.name : "انتخاب فایل لوگو"}</strong>
            <small>{file ? faBytes(file.size) : "PNG، JPG، WEBP یا SVG — حداکثر ۱ مگابایت"}</small>
          </label>
          {previewUrl && <div className="logo-new-preview">
            <div className="logo-preview-side">
              <small>همان‌طور که در منوی سامانه دیده می‌شود</small>
              <div className="ws-sidebar-brand mock-brand"><span className="ws-brand-logo-box"><img src={previewUrl} alt="پیش‌نمایش لوگوی جدید" className="ws-logo-img" onLoad={(event) => setPreviewDims({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></div>
            </div>
            <div className="logo-preview-side">
              <small>همان‌طور که در صفحهٔ ورود دیده می‌شود</small>
              <div className="auth-card-icon mock-card-icon"><img src={previewUrl} alt="" className="auth-logo-img" /></div>
            </div>
            {previewDims && <p className="cms-hint">ابعاد واقعی فایل: <span dir="ltr">{previewDims.w}×{previewDims.h}</span>{previewDims.w < 64 && " — برای وضوح بیشتر، لوگوی بزرگ‌تر از ۶۴ پیکسل توصیه می‌شود."}</p>}
          </div>}
          <div className="cms-savebar">
            <span>پس از ذخیره، لوگو به‌صورت خودکار در همهٔ بخش‌های سایت جایگزین می‌شود.</span>
            <button type="submit" className="primary-button" disabled={pending || !file}>
              {pending ? <Loader2 size={16} className="spin" /> : <Check size={16} />} ذخیره و انتشار لوگو
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>;
}
