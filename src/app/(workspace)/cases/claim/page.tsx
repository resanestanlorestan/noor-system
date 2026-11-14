import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";
import { db } from "@/db";
import { activists } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ClaimCaseForm } from "@/components/claim-case-form";
export default async function ClaimCasePage() {
  const user = await requireUser();
  if (!(await can(user, "cases.claim"))) redirect("/cases");
  const [own] = await db.select({ id: activists.id }).from(activists).where(eq(activists.userId, user.id)).limit(1);
  if (own) redirect("/cases");
  return <><div className="ws-breadcrumb"><Link href="/cases">پرونده‌ها</Link><span> / </span><b>اتصال پرونده</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> اتصال پرونده موجود</div><h1>پرونده من قبلاً ثبت شده است؟</h1><p>اگر مدیر یا کارشناس پیش‌تر اطلاعات شما را ثبت کرده، با تطبیق مشخصات می‌توانید آن را به حساب خود متصل کنید.</p></div><Link className="secondary-button" href="/cases"><ArrowRight size={16} /> بازگشت</Link></div>
    <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>تأیید هویت</span><h2>اتصال پرونده</h2></div><Link2 size={19} /></div><ClaimCaseForm /></section>
  </>;
}
