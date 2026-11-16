"use client";

// الحاقیهٔ ۲.۱۶.۰ — فرم‌های کلاینت «اطلاع‌رسانی پیامکی مدیران»: افزودن/ویرایش
// مدیر، فعال/غیرفعال‌سازی و حذف با تأیید، کلید ارسال خودکار و ارسال آزمایشی.

import { useActionState, useState } from "react";
import { LoaderCircle, PencilLine, Plus, Save, Send, Trash2 } from "lucide-react";
import { addManagerRecipientAction, deleteManagerRecipientAction, saveManagerSmsSettingsAction, sendManagerTestSmsAction, toggleManagerRecipientSmsAction, updateManagerRecipientAction } from "@/app/actions/manager-sms";
import { initialActionState } from "@/lib/action-state";

export function AddRecipientForm() {
  const [state, action, pending] = useActionState(addManagerRecipientAction, initialActionState);
  return <form action={action} className="management-form"><div className="form-grid">
    <label>نام و نام خانوادگی<input name="fullName" required maxLength={120} placeholder="مثلاً زهرا موسوی" /></label>
    <label>سمت مدیریتی<input name="position" maxLength={120} placeholder="اختیاری؛ مثلاً معاون اجرایی" /></label>
    <label>شمارهٔ موبایل<input name="phone" required maxLength={20} dir="ltr" placeholder="09123456789" /><small>پیامک‌های خودکار فقط به شماره‌های معتبر و فعال ارسال می‌شود.</small></label>
  </div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} افزودن مدیر</button></form>;
}

type Recipient = { id: string; fullName: string; position: string; phone: string; source: "auto" | "manual" };

export function EditRecipient({ recipient }: { recipient: Recipient }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateManagerRecipientAction, initialActionState);
  if (!open) return <button className="table-link" onClick={(event) => { event.preventDefault(); setOpen(true); }}><PencilLine size={13} /> ویرایش</button>;
  return <form action={action} className="management-form" style={{ minWidth: "min(100%, 420px)" }}>
    <input type="hidden" name="recipientId" value={recipient.id} />
    <div className="form-grid">
      <label>نام و نام خانوادگی<input name="fullName" defaultValue={recipient.fullName} required maxLength={120} /></label>
      <label>سمت مدیریتی<input name="position" defaultValue={recipient.position} maxLength={120} /></label>
      <label>شمارهٔ موبایل<input name="phone" defaultValue={recipient.phone} required maxLength={20} dir="ltr" /></label>
    </div>
    {recipient.source === "auto" && <small className="table-subtle">این ردیف از سامانهٔ کاربران همگام می‌شود؛ نام، سمت و شماره با همگام‌سازی بعدی از حساب کاربری او به‌روز می‌شود.</small>}
    {state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <div className="sms-actions-row">
      <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} ذخیره</button>
      <button type="button" className="table-link" onClick={() => setOpen(false)}>انصراف</button>
    </div>
  </form>;
}

export function ToggleRecipient({ id, enabled, name }: { id: string; enabled: boolean; name: string }) {
  return <form action={toggleManagerRecipientSmsAction}><input type="hidden" name="recipientId" value={id} />
    <button className="table-link" onClick={(event) => { if (!window.confirm(enabled ? `دریافت پیامک برای «${name}» غیرفعال شود؟` : `دریافت پیامک برای «${name}» فعال شود؟`)) event.preventDefault(); }}>{enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>;
}

export function DeleteRecipient({ id, name, source }: { id: string; name: string; source: "auto" | "manual" }) {
  const message = source === "auto"
    ? `مدیر «${name}» از فهرست دریافت‌کنندگان کنار گذاشته شود؟\nاین مدیر از سامانهٔ کاربران همگام می‌شود؛ با حذف، در همگام‌سازی‌های بعدی دوباره اضافه نمی‌شود و پیامکی دریافت نمی‌کند.\nبرای بازگشت، از بخش «مدیران کنارگذاشته» دکمهٔ «بازگردانی» را بزنید.`
    : `مدیر «${name}» و سابقهٔ پیامک‌هایش برای همیشه حذف شود؟\nاین ردیف ثبت دستی است و با همگام‌سازی دوباره ساخته نمی‌شود.`;
  return <form action={deleteManagerRecipientAction}><input type="hidden" name="recipientId" value={id} />
    <button className="table-link danger" onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}><Trash2 size={13} /> حذف</button></form>;
}

export function AutoSettingsForm({ autoCaseCreated }: { autoCaseCreated: boolean }) {
  const [state, action, pending] = useActionState(saveManagerSmsSettingsAction, initialActionState);
  return <form action={action} className="management-form">
    <label className="full-field checkbox-field"><input type="checkbox" name="autoCaseCreated" value="1" defaultChecked={autoCaseCreated} /><span>ارسال خودکار پیامک «ثبت پروندهٔ جدید» هنگام ثبت هر پرونده برای همهٔ مدیران فعال</span></label>
    <small>پیامک فقط برای مدیرانی می‌رود که در فهرست بالا وضعیت دریافتِ فعال دارند؛ برای هر پرونده به هر مدیر فقط یک پیامک ارسال می‌شود و ارسال تکراری همان پرونده خودکار مسدود است.</small>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} ذخیرهٔ تنظیمات</button>
  </form>;
}

export function ManagerTestSmsForm() {
  const [state, action, pending] = useActionState(sendManagerTestSmsAction, initialActionState);
  return <form action={action} className="management-form"><div className="form-grid">
    <label>شمارهٔ گیرندهٔ پیامک آزمایشی<input name="phone" required maxLength={20} dir="ltr" placeholder="09123456789" /><small>متن قالب «اطلاع‌رسانی ثبت پرونده به مدیران» با دادهٔ نمونه فرستاده می‌شود.</small></label>
  </div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} ارسال آزمایشی</button></form>;
}
