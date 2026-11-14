"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Smartphone } from "lucide-react";
import { requestMobileResetAction, resetPasswordAction, resetWithMobileAction } from "@/app/actions/password";
import { initialActionState } from "@/lib/action-state";
import { PASSWORD_POLICY_HINT } from "@/lib/validation";

export function MobileForgotForm() {
  const [reqState, reqAction, reqPending] = useActionState(requestMobileResetAction, initialActionState);
  const [resetState, resetAction, resetPending] = useActionState(resetWithMobileAction, initialActionState);
  const [visible, setVisible] = useState(false);
  const mobile = reqState.mobile || "";
  if (!mobile) return <form action={reqAction} className="auth-form">
    <label>شماره موبایل حساب<div className="input-icon"><Smartphone size={18} /><input dir="ltr" name="mobile" type="tel" autoComplete="tel" inputMode="tel" placeholder="09123456789" required maxLength={20} /></div><small>کد بازیابی شش‌رقمی به همین شماره پیامک می‌شود.</small></label>
    {reqState.error && <div className="form-error" role="alert">{reqState.error}</div>}
    {reqState.success && <div className="form-success" role="status">{reqState.success}</div>}
    {reqState.devCode && <div className="setup-note dev-link-note"><CheckCircle2 size={18} /><span><b>حالت محلی (بدون پنل پیامک):</b> پیام واقعی ارسال نشد و کد بازیابی برای آزمایش این است: <b dir="ltr">{reqState.devCode}</b></span></div>}
    <button className="primary-button auth-submit" disabled={reqPending}>{reqPending ? <><LoaderCircle size={18} className="spin" /> در حال ارسال...</> : <>ارسال کد بازیابی<ArrowLeft size={18} /></>}</button>
    <div className="auth-switch"><Link href="/login">بازگشت به ورود</Link></div>
  </form>;
  return <form action={resetAction} className="auth-form">
    <input type="hidden" name="mobile" value={mobile} />
    <label>کد پیامک‌شده<div className="input-icon"><KeyRound size={18} /><input dir="ltr" name="code" autoComplete="one-time-code" inputMode="numeric" placeholder="۶ رقمی" required maxLength={6} autoFocus /></div><small>کد به شماره <b dir="ltr">{mobile}</b> ارسال شد؛ ۱۰ دقیقه اعتبار دارد.</small></label>
    <label>گذرواژه جدید<div className="input-icon"><KeyRound size={18} /><input dir="ltr" {...{ name: "password" }} type={visible ? "text" : "password"} autoComplete="new-password" placeholder="حداقل ۸ نویسه با حروف بزرگ، کوچک و عدد" required maxLength={128} /><button type="button" className="reveal-password" onClick={() => setVisible(!visible)} aria-label={visible ? "پنهان کردن گذرواژه" : "نمایش گذرواژه"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small>{PASSWORD_POLICY_HINT}</small></label>
    <label>تکرار گذرواژه جدید<div className="input-icon"><KeyRound size={18} /><input dir="ltr" name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" placeholder="گذرواژه را دوباره وارد کنید" required maxLength={128} /></div></label>
    {resetState.error && <div className="form-error" role="alert">{resetState.error}</div>}
    <button className="primary-button auth-submit" disabled={resetPending}>{resetPending ? <><LoaderCircle size={18} className="spin" /> در حال ثبت...</> : <>ثبت گذرواژه جدید<ArrowLeft size={18} /></>}</button>
    <div className="auth-switch">کد را دریافت نکردید؟ <Link href="/forgot-password">ارسال دوباره کد</Link> · <Link href="/login">بازگشت به ورود</Link></div>
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialActionState);
  const valid = /^[a-f0-9]{64}$/.test(token);
  if (!valid) return <div className="auth-form"><div className="form-error" role="alert">پیوند بازیابی معتبر نیست. از صفحه بازیابی گذرواژه درخواست جدید ثبت کنید.</div><div className="auth-switch"><Link href="/forgot-password">درخواست کد پیامکی</Link></div></div>;
  return <form action={action} className="auth-form">
    <input type="hidden" name="token" value={token} />
    <label>گذرواژه جدید<div className="input-icon"><KeyRound size={18} /><PasswordInput name="password" autoComplete="new-password" placeholder="حداقل ۸ نویسه با حروف بزرگ، کوچک و عدد" required maxLength={128} /></div><small>{PASSWORD_POLICY_HINT}</small></label>
    <label>تکرار گذرواژه جدید<div className="input-icon"><KeyRound size={18} /><PasswordInput name="confirmation" autoComplete="new-password" placeholder="گذرواژه را دوباره وارد کنید" required maxLength={128} /></div></label>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button auth-submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin" /> در حال ثبت...</> : <>ثبت گذرواژه جدید<ArrowLeft size={18} /></>}</button>
  </form>;
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return <><input dir="ltr" {...props} type={visible ? "text" : "password"} /><button type="button" className="reveal-password" onClick={() => setVisible(!visible)} aria-label={visible ? "پنهان کردن گذرواژه" : "نمایش گذرواژه"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></>;
}
