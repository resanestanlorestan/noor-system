"use client";
import { useActionState, useState } from "react";
import { Download, ImageIcon, LoaderCircle, Trash2, Upload } from "lucide-react";
import { removePhotoAction, uploadDocumentAction, uploadPhotoAction } from "@/app/actions/cases";
import { documentTypeLabels } from "@/lib/constants";
import { initialActionState } from "@/lib/action-state";

export function DocumentUpload({ caseId, openRequests = [] }: { caseId: string; openRequests?: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(uploadDocumentAction.bind(null, caseId), initialActionState);
  const [title, setTitle] = useState(""); const [requestId, setRequestId] = useState("");
  return <form action={action} className="upload-form">
    {openRequests.length > 0 && <label>مرتبط با کدام مدرک درخواستی؟ (اختیاری)<select name="documentRequestId" value={requestId} onChange={(event) => { setRequestId(event.target.value); const picked = openRequests.find((item) => item.id === event.target.value); if (picked) setTitle(picked.title); }}><option value="">هیچ‌کدام</option>{openRequests.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    <label>نوع مدرک<select name="docType" defaultValue=""><option value="">انتخاب کنید</option>{Object.entries(documentTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>عنوان مدرک<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="مثلاً گواهی تخصصی" required /></label>
    <label>شماره مدرک<input name="docNumber" maxLength={60} placeholder="در صورت وجود، اختیاری" /></label>
    <label>انتخاب فایل<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /></label>
    <small>PDF، PNG یا JPEG؛ حداکثر ۵ مگابایت. فایل‌ها به‌صورت عمومی منتشر نمی‌شوند.</small>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="secondary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} بارگذاری مدرک</button>
  </form>;
}

export function PhotoUpload({ caseId, hasPhoto }: { caseId: string; hasPhoto: boolean }) {
  const [state, action, pending] = useActionState(uploadPhotoAction.bind(null, caseId), initialActionState);
  return <form action={action} className="upload-form photo-upload-form">
    {hasPhoto && <small>تصویر جدید جایگزین تصویر فعلی می‌شود.</small>}
    <label>انتخاب تصویر پرسنلی<input name="file" type="file" accept="image/png,image/jpeg" required /></label>
    <small>PNG یا JPEG؛ حداکثر ۵ مگابایت. تصویر فقط برای کاربران مجاز این پرونده نمایش داده می‌شود.</small>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="secondary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <ImageIcon size={16} />} بارگذاری تصویر پرسنلی</button>
  </form>;
}

export function PhotoRemove({ caseId }: { caseId: string }) {
  return <form action={removePhotoAction} className="photo-remove-form"><input type="hidden" name="caseId" value={caseId} /><button className="small-action" type="submit"><Trash2 size={14} /> حذف تصویر</button></form>;
}
export function ConfirmButton({ name, value, children, className, confirmText }: { name: string; value: string; children: React.ReactNode; className: string; confirmText: string }) {
  return <button name={name} value={value} className={className} onClick={(event) => { if (!window.confirm(confirmText)) event.preventDefault(); }}>{children}</button>;
}
export function DownloadIcon() { return <Download size={16} />; }
