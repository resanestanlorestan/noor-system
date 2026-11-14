import type { Metadata } from "next";
import { BookOpenText, CheckCircle2, MailX } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { applyEmailVerification } from "@/app/actions/email-verification";

export const metadata: Metadata = { title: "تأیید ایمیل — سامانه جامع فعالان قرآنی" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await applyEmailVerification(token);
  const ok = result.ok;
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> تأیید ایمیل</div><h1>{ok ? "ایمیل حساب تأیید شد" : "تأیید انجام نشد"}</h1><p>{ok ? "نشانی ایمیل حساب شما با موفقیت تأیید شد؛ می‌توانید به سامانه وارد شوید." : "پیوند تأیید نامعتبر یا منقضی است. از صفحه حساب کاربری می‌توانید پیوند جدید درخواست کنید."}</p></div>
        <div className="auth-story-footer">سامانه جامع فعالان قرآنی <span>•</span> تأیید ایمیل</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div className="auth-card-top"><span className="auth-card-icon">{ok ? <CheckCircle2 size={22} /> : <MailX size={22} />}</span><span className="auth-tag">تأیید ایمیل</span></div>
        <div className="auth-heading"><div className="ws-eyebrow"><span /> نتیجه تأیید</div><h2>{ok ? "تأیید با موفقیت انجام شد" : "پیوند معتبر نیست"}</h2><p>{ok ? "از این پس نشانی ایمیل حساب شما تأییدشده است." : "ممکن است پیوند قبلاً استفاده شده یا بیش از ۲۴ ساعت از آن گذشته باشد."}</p></div>
        <div className="auth-form">{ok && result.changedTo && <div className="form-success" role="status">ایمیل حساب به <b dir="ltr">{result.changedTo}</b> تغییر کرد و تأیید شد.</div>}
          <div className="auth-switch">{ok ? <Link href="/login">ورود به سامانه</Link> : <Link href="/account">رفتن به حساب کاربری</Link>}</div>
        </div>
      </div><p className="auth-bottom-note"><CheckCircle2 size={14} /> رویداد تأیید در رویدادهای حساس سامانه ثبت می‌شود.</p></section>
    </div><footer className="auth-footer"><span>سامانه جامع فعالان قرآنی</span><span>طراحی شده توسط پویا فرهادی</span></footer>
  </main>;
}
