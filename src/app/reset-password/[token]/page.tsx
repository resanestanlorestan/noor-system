import type { Metadata } from "next";
import { BookOpenText, KeyRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "تنظیم گذرواژه جدید — سامانه جامع فعالان قرآنی" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> گام پایانی</div><h1>گذرواژه جدید را انتخاب کنید<br /><em>و دوباره وارد شوید</em></h1><p>پس از ثبت گذرواژه جدید، همه نشست‌های فعال حساب باطل می‌شوند تا امنیت حساب حفظ بماند.</p></div>
        <div className="auth-story-footer">سامانه جامع فعالان قرآنی <span>•</span> بازیابی گذرواژه</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card"><div className="auth-card-top"><span className="auth-card-icon"><KeyRound size={22} /></span><span className="auth-tag">گذرواژه جدید</span></div><div className="auth-heading"><div className="ws-eyebrow"><span /> تنظیم گذرواژه</div><h2>تنظیم گذرواژه جدید</h2><p>گذرواژه‌ای با حداقل ۱۲ نویسه انتخاب کنید.</p></div>
        <ResetPasswordForm token={token} />
      </div><p className="auth-bottom-note"><KeyRound size={14} /> این پیوند یک‌بارمصرف است و ۳۰ دقیقه اعتبار دارد.</p></section>
    </div><footer className="auth-footer"><span>سامانه جامع فعالان قرآنی</span><span>طراحی شده توسط پویا فرهادی</span></footer>
  </main>;
}
