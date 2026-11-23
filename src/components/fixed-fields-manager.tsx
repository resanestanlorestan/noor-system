"use client";
// الحاقیهٔ ۲.۲۶.۰ — مدیریت فیلدهای ثابت هر مرحلهٔ پایه در داشبورد مراحل.
// تک‌تک فیلدهای ثابت (عنوان بخش‌ها، فیلدهای فرم، الزام‌های ترکیبی و کنش‌های
// مرحلهٔ بازبینی) از همین‌جا ویرایش می‌شوند: عنوان، متن راهنما، برداشتن یا
// افزودن الزام و مخفی‌سازی بدون حذف داده. بازنشانی هر فیلد به پیش‌فرض با
// اکشن سرور و ممیزی ثبت می‌شود. هم‌گام‌سازی با key در صفحهٔ والد.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, LoaderCircle, Pencil, RotateCcw, X } from "lucide-react";
import { resetFieldOverrideAction, saveFieldOverrideAction, type FixedFieldView } from "@/app/actions/case-steps-admin";
import { initialActionState } from "@/lib/action-state";

const roleLabel: Record<FixedFieldView["role"], string> = { section: "عنوان بخش", field: "فیلد فرم", requirement: "الزام مرحله" };

export function FixedFieldsManager({ stepCode, stepTitle, fields }: { stepCode: string; stepTitle: string; fields: FixedFieldView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (formData: FormData) => {
    const key = `${formData.get("stepCode")}.${formData.get("fieldKey")}`;
    setPendingKey(key);
    setMessage(null);
    try {
      const result = await saveFieldOverrideAction(initialActionState, formData);
      if (result?.success) { setMessage({ ok: true, text: result.success }); setEditing(null); router.refresh(); }
      else if (result?.error) setMessage({ ok: false, text: result.error });
    } finally {
      setPendingKey(null);
    }
  };
  return <section className="ws-panel detail-section">
    <div className="detail-section-head"><div><span>مرحلهٔ پایهٔ سامانه</span><h2>فیلدهای ثابت «{stepTitle}»</h2><p>تک‌تک فیلدهای ثابت این مرحله از همین‌جا ویرایش می‌شوند: عنوان و نام هر فیلد، متن راهنما، الزامی یا اختیاری‌کردن و مخفی‌سازی موقت (بدون حذف اطلاعات ثبت‌شده). هیچ فیلدی قفل نیست؛ فقط ستون‌های دادهٔ پرونده دست‌نخورده می‌مانند تا سوابق قبلی سالم بمانند و هر تغییر بلافاصله در فرم ثبت پرونده اعمال شود.</p></div><EyeOff size={19} /></div>
    <ul className="county-list fixed-field-list">
      {fields.map((item) => <li key={item.key} className={item.hidden ? "fixed-field-hidden" : ""}>
        <div className="fixed-field-info">
          <strong>{item.label}{item.role !== "section" && item.required ? <i className="req-mark"> *</i> : null}{item.hidden ? " — مخفی از فرم" : ""}</strong>
          <small>{roleLabel[item.role]}{item.help ? ` · ${item.help}` : ""}{item.overridden ? " · ویرایش‌شده" : ""}</small>
        </div>
        <span className="builder-field-tools">
          <button type="button" title="ویرایش این فیلد" onClick={() => { setEditing(editing === item.key ? null : item.key); setMessage(null); }}><Pencil size={14} /></button>
          {item.overridden && <form action={resetFieldOverrideAction} className="inline-form">
            <input type="hidden" name="stepCode" value={stepCode} />
            <input type="hidden" name="fieldKey" value={item.key.split(".").slice(1).join(".")} />
            <button type="submit" className="row-remove" title="بازنشانی به پیش‌فرض سامانه" onClick={(event) => { if (!window.confirm(`فیلد «${item.label}» به پیش‌فرض سامانه بازگردانده شود؟\n\nعنوان، راهنما، الزام و وضعیت نمایش به حالت اولیه برمی‌گردد؛ هیچ داده‌ای حذف نمی‌شود.`)) event.preventDefault(); }}><RotateCcw size={14} /></button>
          </form>}
        </span>
        {editing === item.key && <form action={save} className="specialties-edit-form fixed-field-edit">
          <input type="hidden" name="stepCode" value={stepCode} />
          <input type="hidden" name="fieldKey" value={item.key.split(".").slice(1).join(".")} />
          <label>عنوان فیلد<input name="label" defaultValue={item.label} maxLength={200} required /></label>
          {item.role !== "section" && <label>متن راهنما (زیر فیلد)<input name="help" defaultValue={item.help || ""} maxLength={500} placeholder="اختیاری" /></label>}
          {item.canToggleRequired && <label className="fixed-field-check"><input type="checkbox" name="required" value="yes" defaultChecked={item.required} /> این فیلد الزامی است (اختیاری‌کردن: تیک را بردارید)</label>}
          {item.canHide && <label className="fixed-field-check"><input type="checkbox" name="hidden" value="yes" defaultChecked={item.hidden} /> مخفی از فرم ثبت پرونده (اطلاعات قبلی حفظ می‌شود)</label>}
          <button className="primary-button" disabled={pendingKey === item.key}>{pendingKey === item.key ? <LoaderCircle className="spin" size={15} /> : "ذخیرهٔ فیلد"}</button>
          <button type="button" onClick={() => setEditing(null)} title="بستن"><X size={15} /></button>
        </form>}
      </li>)}
    </ul>
    {message && <div className={message.ok ? "form-success" : "form-error"} role={message.ok ? "status" : "alert"}>{message.text}</div>}
  </section>;
}
