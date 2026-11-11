"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions/auth";
import { emptyState, type ActionState } from "@/lib/action-state";

export default function ForgotPage() {
  const [requestState, requestFormAction, requestPending] = useActionState<ActionState, FormData>(requestPasswordResetAction, emptyState);
  const [resetState, resetFormAction, resetPending] = useActionState<ActionState, FormData>(resetPasswordAction, emptyState);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md space-y-8 p-8">
        <section>
          <h1 className="mb-1 text-2xl font-bold">بازیابی رمز عبور</h1>
          <p className="mb-4 text-sm text-slate-500">شماره همراه حساب را وارد کنید تا کد بازیابی ۶ رقمی پیامک شود.</p>
          <form action={requestFormAction} className="space-y-4">
            {requestState.error && <div className="alert-error">{requestState.error}</div>}
            {requestState.success && <div className="alert-success">{requestState.success}</div>}
            <div>
              <label className="label" htmlFor="mobile">شماره همراه <span className="req-star">*</span></label>
              <input id="mobile" name="mobile" className="input" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={requestPending}>
              {requestPending ? "در حال ارسال..." : "ارسال کد بازیابی"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">تعیین رمز جدید</h2>
          <form action={resetFormAction} className="space-y-4">
            {resetState.error && <div className="alert-error">{resetState.error}</div>}
            {resetState.success && <div className="alert-success">{resetState.success}</div>}
            <div>
              <label className="label" htmlFor="r-mobile">شماره همراه <span className="req-star">*</span></label>
              <input id="r-mobile" name="mobile" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="r-code">کد بازیابی <span className="req-star">*</span></label>
              <input id="r-code" name="code" className="input text-center tracking-widest" inputMode="numeric" maxLength={6} required />
            </div>
            <div>
              <label className="label" htmlFor="r-password">رمز عبور جدید <span className="req-star">*</span></label>
              <input id="r-password" name="password" type="password" className="input" required />
              <p className="mt-1 text-xs text-slate-500">حداقل ۸ نویسه، شامل حرف بزرگ، حرف کوچک و رقم.</p>
            </div>
            <div>
              <label className="label" htmlFor="r-confirm">تکرار رمز جدید <span className="req-star">*</span></label>
              <input id="r-confirm" name="confirm" type="password" className="input" required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={resetPending}>
              {resetPending ? "در حال تغییر..." : "تغییر رمز عبور"}
            </button>
          </form>
        </section>

        <p className="text-center text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline">بازگشت به ورود</Link>
        </p>
      </div>
    </main>
  );
}
