import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { BookOpenText, CheckCircle2, Smartphone } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { maskMobile, resolvePendingVerificationToken } from "@/lib/mobile-verification";
import { MobileVerifyForm } from "@/components/mobile-verify-form";

export const metadata: Metadata = { title: "تأیید شماره موبایل — سامانه جامع فعالان قرآنی" };
export const dynamic = "force-dynamic";

export default async function VerifyMobilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await resolvePendingVerificationToken(token);
  const [user] = userId
    ? await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1)
    : [];
  const pending = !!user?.phone;
  return <main className="auth-page">
    <header className="auth-top"><Link href="/login" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><ThemeToggle /></header>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-art" /><div className="auth-story-overlay" />
        <div className="auth-story-inner"><div className="auth-story-badge"><span /> آخرین گام ثبت‌نام</div><h1>حساب شما ساخته شد؛<br /><em>فقط تأیید موبایل مانده</em></h1><p>برای فعال‌سازی حساب، کد ۶ رقمی پیامک‌شده به شماره موبایل خود را وارد کنید. فعالان تأییدشده به فضای یکپارچه ثبت و پیگیری پرونده وارد می‌شوند.</p><div className="auth-features"><div><span><Smartphone size={19} /></span><div><strong>تأیید با پیامک</strong><small>کد ۶ رقمی تا ۱۰ دقیقه اعتبار دارد</small></div></div><div><span><CheckCircle2 size={19} /></span><div><strong>فعال‌سازی فوری</strong><small>پس از تأیید، مستقیم به داشبورد می‌روید</small></div></div></div></div>
        <div className="auth-story-footer">سامانه جامع فعالان قرآنی <span>•</span> تأیید شماره موبایل</div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div className="auth-card-top"><span className="auth-card-icon"><Smartphone size={22} /></span><span className="auth-tag">تأیید موبایل</span></div>
        <div className="auth-heading"><div className="ws-eyebrow"><span /> ایجاد حساب فعال قرآنی</div><h2>{pending ? "کد تأیید را وارد کنید" : "نشست تأیید معتبر نیست"}</h2><p>{pending ? <>کد ۶ رقمی به شماره <b dir="ltr">{maskMobile(user!.phone!)}</b> پیامک شد.</> : "پیوند تأیید منقضی یا نامعتبر است؛ برای دریافت کد جدید دوباره وارد شوید یا ثبت‌نام کنید."}</p></div>
        {pending
          ? <MobileVerifyForm token={token} maskedMobile={maskMobile(user!.phone!)} />
          : <div className="auth-form"><div className="auth-switch"><Link href="/login">ورود به سامانه</Link> · <Link href="/register">ثبت‌نام دوباره</Link></div></div>}
      </div><p className="auth-bottom-note"><CheckCircle2 size={14} /> فعال‌سازی حساب تنها پس از تأیید شماره موبایل انجام می‌شود.</p></section>
    </div><footer className="auth-footer"><span>سامانه جامع فعالان قرآنی</span><span>طراحی شده توسط پویا فرهادی</span></footer>
  </main>;
}
