"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { LoaderCircle, LockKeyhole, Mail, MailCheck, MailWarning } from "lucide-react";
import { changeEmailAction, changePasswordAction } from "@/app/actions/account";
import { resendVerificationAction } from "@/app/actions/email-verification";
import { initialActionState } from "@/lib/action-state";

export function AccountForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialActionState);
  return <form action={action} className="management-form"><div className="form-grid"><label>گذرواژه فعلی<input name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} /></label><label>گذرواژه جدید<input name="newPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} /><small>حداقل ۱۲ نویسه و متفاوت از گذرواژه فعلی</small></label><label>تکرار گذرواژه جدید<input name="confirmation" type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} /></label></div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />} تغییر گذرواژه</button></form>;
}

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(changeEmailAction, initialActionState);
  const [newEmail, setNewEmail] = useState("");
  return <form action={action} className="management-form"><div className="form-grid"><label>ایمیل فعلی<input value={currentEmail} readOnly dir="ltr" /></label><label>ایمیل جدید<input name="newEmail" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} type="email" dir="ltr" required maxLength={254} placeholder="example@email.com" /></label><label>گذرواژه فعلی<input name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} /></label></div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}{state.devLink && <div className="setup-note dev-link-note"><Mail size={16} /><span><b>حالت محلی (بدون SMTP):</b> پیام واقعی ارسال نشد و پیوند تأیید اینجاست. <Link href={state.devLink} dir="ltr">تأیید ایمیل جدید</Link></span></div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Mail size={16} />} تغییر ایمیل</button></form>;
}

export function ResendVerification({ devLink }: { devLink: string | null }) {
  const [state, action, pending] = useActionState(resendVerificationAction, initialActionState);
  return <div className="verify-banner" role="status">
    <MailWarning size={19} />
    <div>
      <strong>ایمیل حساب شما تأیید نشده است.</strong>
      برای تکمیل امنیت حساب، پیوند تأیید ارسال‌شده به ایمیل خود را باز کنید. {devLink && <span>در حالت محلی (بدون SMTP) پیوند تأیید اینجاست: <Link href={devLink} dir="ltr">تأیید ایمیل</Link></span>}
      <form action={action}>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}{state.devLink && <div className="setup-note dev-link-note"><Mail size={15} /><span>پیوند جدید: <Link href={state.devLink} dir="ltr">تأیید ایمیل</Link></span></div>}<button className="secondary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : <MailCheck size={15} />} ارسال مجدد پیوند تأیید</button></form>
    </div>
  </div>;
}
