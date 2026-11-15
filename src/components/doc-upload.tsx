"use client";
// الحاقیهٔ ۲.۱۴.۰ — بارگذار درون‌بخشی مدارک، مشترک میان فرم‌های پرونده:
// فایل مستقیماً به /api/register/upload بار می‌شود و کلید موقت آن در
// payload همان مرحله (stagedDocs) ارسال و در اکشن به سند پرونده متصل می‌گردد.
// از فرم قبلی ثبت‌نام یک‌مرحله‌ای منتقل شده است — بدون تغییر رفتار.
import { useRef, useState } from "react";
import { FileUp, LoaderCircle, X } from "lucide-react";

export type DocSlot = { key: string; name: string; mime: string; size: number };

/** بارگذاری یک فایل به بخش مشخص؛ خروجی: کلید موقت سند روی سرور. */
async function uploadOne(file: File, section: string): Promise<DocSlot> {
  const body = new FormData();
  body.set("file", file);
  body.set("section", section);
  const response = await fetch("/api/register/upload", { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(String(payload?.error || "بارگذاری فایل انجام نشد."));
  return { key: payload.key, name: payload.name, mime: payload.mime, size: payload.size };
}

/** بخش بارگذاری مدرک داخل همان بخش اطلاعات؛ یک یا چند فایل PDF/تصویر. */
export function SectionUpload({ section, slots, onChange, label, hint, multiple = false, maxBytes }: {
  section: string;
  slots: DocSlot[];
  onChange: (next: DocSlot[]) => void;
  label: string;
  hint?: string;
  multiple?: boolean;
  maxBytes?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      const next: DocSlot[] = [...slots];
      for (const file of Array.from(files).slice(0, multiple ? 5 : 1)) {
        if (maxBytes && file.size > maxBytes) throw new Error("حجم فایل بیش از حد مجاز است.");
        next.push(await uploadOne(file, section));
        if (!multiple) break;
      }
      onChange(next);
    } catch (cause) { setError(String((cause as Error).message || "بارگذاری انجام نشد.")); }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  return <div className="upload-block">
    <div className="upload-block-head">
      <label className="upload-pick">{busy ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />} {label}
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple={multiple} className="upload-input" onChange={(event) => handleFiles(event.target.files)} />
      </label>
      <small>{hint || "PDF یا تصویر؛ حداکثر ۵ مگابایت"}</small>
    </div>
    {error && <small className="upload-error">{error}</small>}
    {slots.length > 0 && <div className="upload-list">{slots.map((slot) => <span key={slot.key} className="upload-chip"><FileUp size={12} /> {slot.name}<button type="button" className="upload-remove" onClick={() => onChange(slots.filter((item) => item.key !== slot.key))} aria-label="حذف فایل"><X size={12} /></button></span>)}</div>}
  </div>;
}
