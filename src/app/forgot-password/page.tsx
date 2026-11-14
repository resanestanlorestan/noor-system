import type { Metadata } from "next";
import { BookOpenText, KeyRound } from "lucide-react";
import Link from "next/link";
import { MobileForgotForm } from "@/components/password-forms";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "بازیابی گذرواژه — سامانه جامع فعالان قرآنی" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> بازیابی امن حساب</div><h1>گذرواژه‌تان را فراموش کرده‌اید؟<br /><em>نگران نباشید</em></h1><p>با وارد کردن شماره موبایل حساب، کد شش‌رقمی برایتان پیامک می‌شود؛ با همان کد گذرواژه جدید را تنظیم کنید. کد فقط ۱۰ دقیقه اعتبار دارد.</p></div>
        <div className="auth-story-footer">سامانه جامع فعالان قرآنی <span>•</span> بازیابی گذرواژه</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card"><div className="auth-card-top"><span className="auth-card-icon"><KeyRound size={22} /></span><span className="auth-tag">بازیابی گذرواژه</span></div><div className="auth-heading"><div className="ws-eyebrow"><span /> بازیابی دسترسی</div><h2>بازیابی گذرواژه با پیامک</h2><p>شماره موبایل حساب خود را وارد کنید تا کد بازیابی برایتان ارسال شود.</p></div>
        <MobileForgotForm />
      </div><p className="auth-bottom-note"><KeyRound size={14} /> کد بازیابی یک‌بارمصرف است و پس از استفاده باطل می‌شود.</p></section>
    </div><footer className="auth-footer"><span>سامانه جامع فعالان قرآنی</span><span>طراحی شده توسط پویا فرهادی</span></footer>
  </main>;
}
