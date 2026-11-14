import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { counties, provinces, specialties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData } from "@/lib/data";
import { can } from "@/lib/permissions";
import { StaffForm } from "@/components/management-forms";
export default async function NewUserPage() {
 const user=await requireUser(); if (!(await can(user, "users.manage"))) redirect("/dashboard"); await ensureReferenceData();
 const [p,c,s]=await Promise.all([db.select().from(provinces).orderBy(provinces.name),db.select().from(counties).orderBy(counties.name),db.select().from(specialties).orderBy(specialties.id)]);
 return <><div className="ws-breadcrumb"><Link href="/users">کاربران</Link><span> / </span><b>ایجاد کاربر</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> نقش و دسترسی</div><h1>ایجاد کاربر سازمانی</h1><p>نقش و محدوده جغرافیایی حساب را مشخص کنید.</p></div><Link className="secondary-button" href="/users"><ArrowRight size={16} /> بازگشت</Link></div><section className="ws-panel detail-section"><StaffForm provinces={user.effectiveRole === "province_admin" ? p.filter((x)=>x.id===user.provinceId) : p} counties={c} specialties={s} role={user.effectiveRole} provinceId={user.provinceId} /></section></>;
}
