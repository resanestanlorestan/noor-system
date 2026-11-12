import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/constants";
import { mfaRequiredForRole } from "@/lib/mfa";
import { AccountForm, EmailForm, ResendVerification } from "@/components/account-form";
import { MfaDisabledPanel, MfaEnabledPanel } from "@/components/mfa-form";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await requireUser();
  const required = mfaRequiredForRole(user.role);
  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>حساب کاربری</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> امنیت حساب</div><h1>حساب کاربری</h1><p>{user.fullName} · {roleLabels[user.role]}</p></div></div>
    {user.email && !user.emailVerifiedAt && <ResendVerification devLink={null} />}
    <div className="settings-grid">
      <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>حفاظت از حساب</span><h2>تغییر گذرواژه</h2><p>پس از تغییر، سایر نشست‌ها باطل می‌شوند.</p></div><LockKeyhole size={19} /></div><AccountForm /></section>
      {user.email && <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>اطلاعات ورود {user.emailVerifiedAt ? "· تأییدشده" : "· تأییدنشده"}</span><h2>تغییر ایمیل</h2><p>تغییر ایمیل پس از تأیید ایمیل جدید اعمال می‌شود.</p></div><Mail size={19} /></div><EmailForm currentEmail={user.email} /></section>}
      <section className="ws-panel detail-section mfa-panel"><div className="detail-section-head"><div><span>{required ? "الزامی برای نقش شما" : "لایه امنیتی اضافی"}</span><h2>احراز هویت دومرحله‌ای</h2><p>با یک اپلیکیشن احراز هویت مانند Google Authenticator کار می‌کند؛ نیازی به سرویس بیرونی نیست.</p></div><ShieldCheck size={19} /></div>{user.mfaEnabled ? <MfaEnabledPanel /> : <MfaDisabledPanel required={required} />}</section>
    </div>
  </>;
}
