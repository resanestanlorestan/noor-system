"use client";
import { useActionState, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { loginAction, registerAction, setupAction, verifyMfaLoginAction } from "@/app/actions/auth";
import { initialActionState } from "@/lib/action-state";
import { PASSWORD_POLICY_HINT } from "@/lib/validation";

type Mode = "login" | "register" | "setup";
function MfaChallengeForm({ mfaToken, onBack }: { mfaToken: string; onBack: () => void }) {
  const [state, action, pending] = useActionState(verifyMfaLoginAction, { mfaToken });
  return <form action={action} className="auth-form">
    <input type="hidden" name="mfaToken" value={state.mfaToken || mfaToken} />
    <label>کد تأیید دومرحله‌ای<div className="input-icon"><ShieldCheck size={18} /><input dir="ltr" name="code" autoComplete="one-time-code" inputMode="numeric" placeholder="۶ رقمی یا کد بازیابی" required maxLength={13} autoFocus /></div><small>کد اپلیکیشن احراز هویت یا یکی از کدهای بازیابی را وارد کنید.</small></label>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button auth-submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin" /> در حال بررسی...</> : <>تأیید و ورود<ArrowLeft size={18} /></>}</button>
    <button type="button" className="text-link mfa-back" onClick={onBack}>بازگشت به ورود</button>
  </form>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : mode === "register" ? registerAction : setupAction, initialActionState);
  const [showPassword, setShowPassword] = useState(false);
  const [dismissedMfaToken, setDismissedMfaToken] = useState<string | null>(null);
  const activeMfaToken = mode === "login" && state.mfaToken && state.mfaToken !== dismissedMfaToken ? state.mfaToken : null;
  if (activeMfaToken) return <MfaChallengeForm mfaToken={activeMfaToken} onBack={() => setDismissedMfaToken(activeMfaToken)} />;
  return <form action={action} className="auth-form">
    {mode !== "login" && <div className="auth-name-row">
      <label>نام<div className="input-icon"><UserRound size={18} /><input name="firstName" autoComplete="given-name" placeholder="نام" required maxLength={80} /></div></label>
      <label>نام خانوادگی<div className="input-icon"><UserRound size={18} /><input name="lastName" autoComplete="family-name" placeholder="نام خانوادگی" required maxLength={100} /></div></label>
    </div>}
    {mode === "login"
      ? <label>شماره موبایل یا ایمیل<div className="input-icon"><UserRound size={18} /><input dir="ltr" name="identifier" autoComplete="username" placeholder="09123456789 یا example@email.com" required maxLength={254} /></div><small>ورود با شماره موبایل یا ایمیل حساب ممکن است.</small></label>
      : <label>شماره موبایل<div className="input-icon"><Smartphone size={18} /><input dir="ltr" name="mobile" type="tel" autoComplete="tel" inputMode="tel" placeholder="09123456789" required maxLength={20} /></div><small>{mode === "register" ? "کد تأیید فعال‌سازی حساب به این شماره پیامک می‌شود و ورود بعدی نیز با همین شماره است." : "ورود بعدی مدیر با همین شماره انجام می‌شود."}</small></label>}
    {mode !== "login" && <label>ایمیل (اختیاری)<div className="input-icon"><Mail size={18} /><input dir="ltr" name="email" type="email" autoComplete="email" placeholder="example@email.com — اختیاری" maxLength={254} /></div><small>بسیاری از کاربران ایمیل ندارند؛ ثبت آن اختیاری است و فقط برای اطلاع‌رسانی ایمیلی استفاده می‌شود.</small></label>}
    <label>گذرواژه<div className="input-icon"><LockKeyhole size={18} /><input dir="ltr" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "گذرواژه خود را وارد کنید" : "حداقل ۸ نویسه با حروف بزرگ، کوچک و عدد"} required maxLength={128} /><button type="button" className="reveal-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "پنهان کردن گذرواژه" : "نمایش گذرواژه"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== "login" && <small>{PASSWORD_POLICY_HINT}</small>}</label>
    {mode !== "login" && <label>تکرار گذرواژه<div className="input-icon"><LockKeyhole size={18} /><input dir="ltr" name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="گذرواژه را دوباره وارد کنید" required maxLength={128} /></div></label>}
    {mode === "setup" && <label>کد راه‌اندازی محلی<div className="input-icon"><LockKeyhole size={18} /><input dir="ltr" name="code" type="password" autoComplete="off" placeholder="کد موجود در فایل خصوصی" required maxLength={128} /></div></label>}
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button auth-submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin" /> در حال پردازش...</> : <>{mode === "login" ? "ورود به سامانه" : mode === "register" ? "ایجاد حساب کاربری" : "ایجاد مدیر اولیه"}<ArrowLeft size={18} /></>}</button>
  </form>;
}
