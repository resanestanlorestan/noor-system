"use client";
import { useActionState, useState } from "react";
import Image from "next/image";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { confirmMfaSetupAction, disableMfaAction, startMfaSetupAction } from "@/app/actions/account";
import { initialActionState } from "@/lib/action-state";

export function MfaDisabledPanel({ required }: { required: boolean }) {
  const [started, setStarted] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [confirmState, confirmActionDispatch, confirmPending] = useActionState(confirmMfaSetupAction, initialActionState);

  const begin = async () => {
    setStarting(true); setStartError("");
    const result = await startMfaSetupAction();
    setStarting(false);
    if (result.error || !result.secret || !result.qrDataUrl) { setStartError(result.error || "راه‌اندازی انجام نشد."); return; }
    setStarted({ secret: result.secret, qrDataUrl: result.qrDataUrl });
  };

  if (confirmState.recoveryCodes) {
    return <div className="mfa-recovery-box">
      <div className="mfa-recovery-head"><CheckCircle2 size={19} /><strong>احراز هویت دومرحله‌ای فعال شد</strong></div>
      <p>این {confirmState.recoveryCodes.length === 8 ? "۸" : confirmState.recoveryCodes.length} کد بازیابی را در جایی امن و خارج از این سامانه ذخیره کنید. هر کد فقط یک‌بار قابل استفاده است و در صورت نبود دسترسی به اپلیکیشن احراز هویت، به‌جای کد شش‌رقمی قابل استفاده‌اند.</p>
      <div className="mfa-recovery-codes">{confirmState.recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
      <button className="secondary-button" onClick={() => window.location.reload()}>متوجه شدم</button>
    </div>;
  }

  if (started) {
    return <form action={confirmActionDispatch} className="management-form">
      <input type="hidden" name="secret" value={confirmState.secret || started.secret} />
      <p className="side-description">کد QR را با اپلیکیشن احراز هویت (مانند Google Authenticator) اسکن کنید، سپس کد شش‌رقمی نمایش‌داده‌شده را وارد کنید.</p>
      <div className="mfa-qr-box"><Image src={started.qrDataUrl} alt="کد QR احراز هویت دومرحله‌ای" width={180} height={180} unoptimized /></div>
      <label>کلید راه‌اندازی (در صورت نبود اسکنر)<input readOnly dir="ltr" value={started.secret} className="mfa-secret-text" /></label>
      <label>کد شش‌رقمی<input name="code" inputMode="numeric" dir="ltr" maxLength={6} required placeholder="۰۰۰۰۰۰" autoFocus /></label>
      {confirmState.error && <div className="form-error" role="alert">{confirmState.error}</div>}
      <button className="primary-button" disabled={confirmPending}>{confirmPending ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} تأیید و فعال‌سازی</button>
    </form>;
  }

  return <div className="management-form">
    <p className="side-description">{required ? "نقش شما ایجاب می‌کند احراز هویت دومرحله‌ای را فعال کنید تا از دسترسی غیرمجاز به حساب‌های مدیریتی جلوگیری شود." : "با فعال‌سازی احراز هویت دومرحله‌ای، علاوه بر گذرواژه، یک کد یک‌بارمصرف نیز برای ورود لازم خواهد بود."}</p>
    {startError && <div className="form-error" role="alert">{startError}</div>}
    <button className="primary-button" onClick={begin} disabled={starting}>{starting ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} شروع راه‌اندازی</button>
  </div>;
}

export function MfaEnabledPanel() {
  const [state, action, pending] = useActionState(disableMfaAction, initialActionState);
  return <form action={action} className="management-form">
    <div className="mfa-status-badge"><ShieldCheck size={16} /> احراز هویت دومرحله‌ای فعال است</div>
    <label>برای غیرفعال‌سازی، گذرواژه فعلی را وارد کنید<input name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required maxLength={128} /></label>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}
    <button className="danger-button" disabled={pending} onClick={(event) => { if (!window.confirm("احراز هویت دومرحله‌ای غیرفعال شود؟")) event.preventDefault(); }}>{pending ? <LoaderCircle className="spin" size={16} /> : <ShieldOff size={16} />} غیرفعال‌سازی</button>
  </form>;
}

export function MfaRecoveryHint() {
  return <p className="mfa-hint"><KeyRound size={14} /> اگر به اپلیکیشن احراز هویت دسترسی ندارید، می‌توانید یکی از کدهای بازیابی را وارد کنید.</p>;
}
