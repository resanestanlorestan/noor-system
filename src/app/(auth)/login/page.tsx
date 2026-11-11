"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { emptyState, type ActionState } from "@/lib/action-state";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, emptyState);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-1 text-2xl font-bold">ورود به سامانه نور</h1>
        <p className="mb-6 text-sm text-slate-500">با شماره همراه یا ایمیل و رمز عبور وارد شوید.</p>
        {state.error && <div className="alert-error mb-4">{state.error}</div>}
        <form action={formAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="identity">شماره همراه یا ایمیل <span className="req-star">*</span></label>
            <input id="identity" name="identity" className="input" required autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">رمز عبور <span className="req-star">*</span></label>
            <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
            <p className="mt-1 text-xs text-slate-500">رمز عبور باید حداقل ۸ نویسه و شامل حرف بزرگ، حرف کوچک و رقم باشد.</p>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "در حال ورود..." : "ورود"}
          </button>
        </form>
        <div className="mt-6 space-y-2 text-center text-sm">
          <Link href="/forgot" className="block text-indigo-600 hover:underline">فراموشی رمز عبور (بازیابی با پیامک)</Link>
          <Link href="/register" className="block text-indigo-600 hover:underline">ثبت‌نام فعال قرآنی جدید</Link>
        </div>
      </div>
    </main>
  );
}
