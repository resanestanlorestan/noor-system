"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, verifyMobileAction } from "@/app/actions/auth";
import { emptyState, type ActionState } from "@/lib/action-state";

export default function RegisterPage() {
  const [registerState, registerFormAction, registerPending] = useActionState<ActionState, FormData>(registerAction, emptyState);
  const [verifyState, verifyFormAction, verifyPending] = useActionState<ActionState, FormData>(verifyMobileAction, emptyState);
  const userId = registerState.existingCaseId;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-1 text-2xl font-bold">ثبت‌نام فعال قرآنی</h1>
        <p className="mb-6 text-sm text-slate-500">ثبت‌نام با شماره همراه انجام می‌شود و پس از تأیید کد پیامکی فعال می‌گردد.</p>

        {!userId && (
          <form action={registerFormAction} className="space-y-4">
            {registerState.error && <div className="alert-error">{registerState.error}</div>}
            <div>
              <label className="label" htmlFor="firstName">نام <span className="req-star">*</span></label>
              <input id="firstName" name="firstName" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="lastName">نام خانوادگی <span className="req-star">*</span></label>
              <input id="lastName" name="lastName" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="mobile">شماره همراه <span className="req-star">*</span></label>
              <input id="mobile" name="mobile" className="input" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required />
            </div>
            <div>
              <label className="label" htmlFor="email">ایمیل (اختیاری)</label>
              <input id="email" name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="password">رمز عبور <span className="req-star">*</span></label>
              <input id="password" name="password" type="password" className="input" required />
              <p className="mt-1 text-xs text-slate-500">حداقل ۸ نویسه، شامل حرف بزرگ، حرف کوچک و رقم.</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm">تکرار رمز عبور <span className="req-star">*</span></label>
              <input id="confirm" name="confirm" type="password" className="input" required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={registerPending}>
              {registerPending ? "در حال ثبت..." : "ثبت‌نام"}
            </button>
            <p className="text-center text-sm">
              حساب دارید؟ <Link href="/login" className="text-indigo-600 hover:underline">وارد شوید</Link>
            </p>
          </form>
        )}

        {userId && (
          <form action={verifyFormAction} className="space-y-4">
            {verifyState.error && <div className="alert-error">{verifyState.error}</div>}
            {registerState.success && <div className="alert-success">{registerState.success}</div>}
            <input type="hidden" name="userId" value={userId} />
            <div>
              <label className="label" htmlFor="code">کد فعال‌سازی پیامک‌شده <span className="req-star">*</span></label>
              <input id="code" name="code" className="input text-center text-lg tracking-widest" inputMode="numeric" maxLength={6} required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={verifyPending}>
              {verifyPending ? "در حال بررسی..." : "تأیید و ورود"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
