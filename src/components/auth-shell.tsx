import Link from "next/link";
import { ArrowLeft, BookOpenText, CheckCircle2, FileCheck2, ShieldCheck, UsersRound } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { ThemeToggle } from "@/components/theme-toggle";

type Mode = "login" | "register" | "setup";
export function AuthShell({ mode, showSetup = false, resetDone = false }: { mode: Mode; showSetup?: boolean; resetDone?: boolean }) {
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> همراه جامعه قرآنی کشور</div><h1>برای ثبت امروز،<br /><em>برای آینده‌ای روشن‌تر</em></h1><p>مسیر یکپارچه شناسایی و همراهی با فعالان قرآنی؛ از ثبت اطلاعات تا بررسی و پیگیری پرونده.</p><div className="auth-features"><div><span><UsersRound size={19} /></span><div><strong>یک خانواده بزرگ قرآنی</strong><small>ثبت و تکمیل اطلاعات در یک فضای یکپارچه</small></div></div><div><span><FileCheck2 size={19} /></span><div><strong>پیگیری آسان پرونده‌ها</strong><small>مراحل بررسی شفاف و قابل پیگیری</small></div></div><div><span><ShieldCheck size={19} /></span><div><strong>حریم خصوصی در اولویت</strong><small>دسترسی به اطلاعات بر اساس نقش و محدوده</small></div></div></div></div>
        <div className="auth-story-footer">سامانه جامع فعالان قرآنی</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card"><div className="auth-card-top"><span className="auth-card-icon"><BookOpenText size={22} /></span></div><div className="auth-heading"><div className="ws-eyebrow"><span /> {mode === "login" ? "خوش آمدید" : mode === "register" ? "همراه ما شوید" : "پیکربندی اولیه"}</div><h2>{mode === "login" ? "ورود به سامانه" : mode === "register" ? "ایجاد حساب فعال قرآنی" : "ساخت مدیر اولیه"}</h2><p>{mode === "login" ? "برای ورود، اطلاعات حساب کاربری خود را وارد کنید." : mode === "register" ? "حساب شما پس از تأیید شماره موبایل فعال می‌شود؛ کد تأیید پیامک خواهد شد." : "این مرحله فقط یک‌بار و با کد محلی انجام می‌شود."}</p></div>
        {mode === "setup" && <div className="setup-note"><ShieldCheck size={18} /><span>کد تصادفی در فایل <b dir="ltr">.private-app/bootstrap-code</b> روی سرور ایجاد شده است. این کد را منتشر نکنید.</span></div>}
        {resetDone && mode === "login" && <div className="form-success" role="status"><CheckCircle2 size={14} /> گذرواژه با موفقیت بازنشانی شد؛ با گذرواژه جدید وارد شوید.</div>}
        <AuthForm mode={mode} />
        {mode === "login" && <div className="auth-vertical-actions"><Link href="/register" className="outline-button">ثبت‌نام فعال قرآنی<ArrowLeft size={16} /></Link></div>}
        <div className="auth-switch">{mode === "login" ? <>گذرواژه را فراموش کرده‌اید؟ <Link href="/forgot-password">بازیابی با پیامک</Link></> : <>پیش‌تر حساب ساخته‌اید؟ <Link href="/login">ورود به سامانه</Link></>}</div>
        {showSetup && mode === "login" && <div className="first-setup"><span>اولین ورود به سامانه؟</span><Link href="/setup">راه‌اندازی مدیر اولیه <ArrowLeft size={14} /></Link></div>}
      </div><p className="auth-bottom-note"><ShieldCheck size={14} /> دسترسی به اطلاعات بر اساس نقش و محدوده مجاز کنترل می‌شود.</p></section>
    </div><footer className="auth-footer"><span>سامانه جامع فعالان قرآنی</span><span>طراحی شده توسط پویا فرهادی</span></footer>
  </main>;
}
