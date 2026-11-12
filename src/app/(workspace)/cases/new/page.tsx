import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { activists, applications, counties, provinces, specialties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData, isManager } from "@/lib/data";
import { can } from "@/lib/permissions";
import { ProfileForm } from "@/components/profile-form";
export default async function NewCasePage() {
  const user = await requireUser(); if (!(await can(user, "cases.create"))) redirect("/cases");
  if (user.role === "activist") { const [own] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(eq(activists.userId, user.id)).limit(1); if (own) redirect(`/cases/${own.id}`); }
  await ensureReferenceData();
  const [allProvinces, allCounties, allSpecialties] = await Promise.all([db.select().from(provinces).orderBy(provinces.name), db.select().from(counties).orderBy(counties.name), db.select().from(specialties).orderBy(specialties.id)]);
  const limited = user.effectiveRole !== "super_admin" && user.effectiveRole !== "activist";
  const sourceOptions = user.effectiveRole === "activist" ? [] : isManager(user)
    ? [{ value: "manager", label: "ثبت توسط مدیر" }, { value: "expert", label: "ثبت توسط کارشناس" }, { value: "paper", label: "ورود از فرم کاغذی" }]
    : [{ value: "expert", label: "ثبت توسط کارشناس" }, { value: "paper", label: "ورود از فرم کاغذی" }];
  return <><div className="ws-breadcrumb"><Link href="/cases">پرونده‌ها</Link><span> / </span><b>ثبت پرونده جدید</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پرونده الکترونیکی</div><h1>ثبت پرونده جدید</h1><p>اطلاعات را مرحله‌به‌مرحله تکمیل و به صورت پیش‌نویس ذخیره کنید.</p></div><Link href="/cases" className="secondary-button"><ArrowRight size={16} /> بازگشت به فهرست</Link></div><section className="ws-panel form-panel"><ProfileForm provinces={limited ? allProvinces.filter((p) => p.id === user.provinceId) : allProvinces} counties={limited && user.countyId ? allCounties.filter((c) => c.id === user.countyId) : allCounties} activityProvinces={allProvinces} activityCounties={allCounties} specialties={allSpecialties} sourceOptions={sourceOptions} defaults={{ provinceId: limited ? user.provinceId : null, countyId: limited ? user.countyId : null, source: sourceOptions[0]?.value }} /></section></>;
}
