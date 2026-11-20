import Link from "next/link";
import { ArrowLeft, BookOpenText, CheckCircle2, CircleAlert, FileCheck2, ShieldCheck, UsersRound } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { getContent } from "@/lib/site-content";
import { getSiteSettings } from "@/lib/site-settings";
import { ThemeToggle } from "@/components/theme-toggle";

type Mode = "login" | "register" | "setup";

// الحاقیهٔ ۲.۱۴.۰ — بازگشت /register به «فقط ایجاد حساب کاربری»: کارت باریک با
// فرم ساده (نام، نام خانوادگی، موبایل، گذرواژه). حالت wide فرم کامل ثبت‌نام
// یک‌مرحله‌ای حذف شد؛ تکمیل پرونده از مسیر ویزارد مرحله‌ای /cases/new انجام
// می‌شود و همهٔ قابلیت‌ها همان‌جا حفظ شده‌اند. سربرگ، پانوشت و ستون معرفی ثابت.
// الحاقیهٔ ۲.۱۸.۴ — همهٔ متن‌های نمایشی این پوسته از CMS می‌آیند (پیش‌فرض = متن کد)
export async function AuthShell({ mode, showSetup = false, resetDone = false, idleLogout = false }: {
  mode: Mode; showSetup?: boolean; resetDone?: boolean; idleLogout?: boolean;
}) {
  const c = await getContent();
  const st = await getSiteSettings();
  const t = c.text;
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span className="ws-brand-logo-box">{st.logoUrl ? <img src={st.logoUrl} alt={t("shell.brand.title")} className="ws-logo-img" /> : <BookOpenText size={23} />}</span><div><strong>{t("shell.brand.title")}</strong><small>{t("shell.brand.subtitle")}</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> {t("auth.story.badge")}</div><h1>{t("auth.story.heading1")}<br /><em>{t("auth.story.heading2")}</em></h1><p>{t("auth.story.body")}</p><div className="auth-features"><div><span><UsersRound size={19} /></span><div><strong>{t("auth.feature1.title")}</strong><small>{t("auth.feature1.sub")}</small></div></div><div><span><FileCheck2 size={19} /></span><div><strong>{t("auth.feature2.title")}</strong><small>{t("auth.feature2.sub")}</small></div></div><div><span><ShieldCheck size={19} /></span><div><strong>{t("auth.feature3.title")}</strong><small>{t("auth.feature3.sub")}</small></div></div></div></div>
        <div className="auth-story-footer">{t("auth.story.footer")}</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card"><div className="auth-card-top"><span className="auth-card-icon">{st.logoUrl ? <img src={st.logoUrl} alt={t("shell.brand.title")} className="auth-logo-img" /> : <BookOpenText size={22} />}</span></div><div className="auth-heading"><div className="ws-eyebrow"><span /> {mode === "login" ? t("auth.login.eyebrow") : mode === "register" ? t("auth.register.eyebrow") : t("auth.setup.eyebrow")}</div><h2>{mode === "login" ? t("auth.login.title") : mode === "register" ? t("auth.register.title") : t("auth.setup.title")}</h2><p>{mode === "login" ? t("auth.login.body") : mode === "register" ? t("auth.register.body") : t("auth.setup.body")}</p></div>
        {mode === "setup" && <div className="setup-note"><ShieldCheck size={18} /><span>کد تصادفی در فایل <b dir="ltr">.private-app/bootstrap-code</b> روی سرور ایجاد شده است. این کد را منتشر نکنید.</span></div>}
        {resetDone && mode === "login" && <div className="form-success" role="status"><CheckCircle2 size={14} /> {t("auth.reset_done")}</div>}
        {idleLogout && mode === "login" && <div className="form-success" role="status"><CircleAlert size={14} /> {t("auth.login.idle_notice")}</div>}
        <AuthForm mode={mode} />
        {mode === "login" && <div className="auth-vertical-actions"><Link href="/register" className="outline-button">{t("auth.login.register_cta")}<ArrowLeft size={16} /></Link></div>}
        {mode !== "register" && <div className="auth-switch">{mode === "login" ? <>{t("auth.login.forgot_prompt")} <Link href="/forgot-password">{t("auth.login.forgot_cta")}</Link></> : <>{t("auth.register.have_account")} <Link href="/login">{t("auth.login.title")}</Link></>}</div>}
        {mode === "register" && <div className="auth-switch">{t("auth.register.have_account")} <Link href="/login">{t("auth.login.title")}</Link></div>}
        {showSetup && mode === "login" && <div className="first-setup"><span>{t("auth.login.first_setup")}</span><Link href="/setup">{t("auth.login.setup_cta")} <ArrowLeft size={14} /></Link></div>}
      </div><p className="auth-bottom-note"><ShieldCheck size={14} /> {t("auth.bottom_note")}</p></section>
    </div><footer className="auth-footer"><span>{t("auth.footer.left")}</span><span>{t("auth.footer.credit")}</span></footer>
  </main>;
}
