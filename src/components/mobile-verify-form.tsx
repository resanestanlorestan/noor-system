"use client";
import { useActionState, useState } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { resendRegistrationMobileAction, verifyRegistrationMobileAction } from "@/app/actions/mobile-verification";
import { initialActionState } from "@/lib/action-state";

/** Second step of public registration: confirm the SMS OTP sent to the mobile. */
export function MobileVerifyForm({ token, maskedMobile }: { token: string; maskedMobile: string }) {
  const [state, action, pending] = useActionState(verifyRegistrationMobileAction, { token });
  const [resendState, resendAction, resending] = useActionState(resendRegistrationMobileAction, { token });
  const [wait, setWait] = useState(0);
  // Countdown starts from the submit handler (not an effect) so setState is
  // never called synchronously inside an effect (react-hooks/set-state-in-effect).
  const startCooldown = () => {
    setWait(60);
    const timer = setInterval(() => setWait((value) => (value > 0 ? value - 1 : 0)), 1000);
    setTimeout(() => clearInterval(timer), 61_000);
  };
  return <>
    <form action={action} className="auth-form">
      <input type="hidden" name="token" value={token} />
      <label>کد تأیید پیامک‌شده به <span dir="ltr">{maskedMobile}</span><div className="input-icon"><ShieldCheck size={18} /><input dir="ltr" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9۰-۹]*" placeholder="------" required maxLength={6} autoFocus /></div><small>کد ۶ رقمی را وارد کنید؛ تا ۱۰ دقیقه اعتبار دارد.</small></label>
      {state.error && <div className="form-error" role="alert">{state.error}</div>}
      <button className="primary-button auth-submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin" /> در حال بررسی...</> : <>تأیید و فعال‌سازی حساب<ArrowLeft size={18} /></>}</button>
    </form>
    <form action={(formData) => { startCooldown(); resendAction(formData); }} className="auth-form">
      <input type="hidden" name="token" value={token} />
      {resendState.success && <div className="form-success" role="status"><CheckCircle2 size={14} /> {resendState.success}</div>}
      {resendState.error && <div className="form-error" role="alert">{resendState.error}</div>}
      <button type="submit" className="text-link" disabled={resending || wait > 0}>
        {resending ? <><LoaderCircle size={15} className="spin" /> در حال ارسال...</>
          : wait > 0 ? <><RotateCcw size={15} /> ارسال دوباره کد تا {wait.toLocaleString("fa-IR")} ثانیه دیگر</>
            : <><RotateCcw size={15} /> ارسال دوباره کد تأیید</>}
      </button>
    </form>
  </>;
}
