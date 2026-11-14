import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { activists, applications, counties, provinces, specialties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData, isManager } from "@/lib/data";
import { can } from "@/lib/permissions";
import { CASE_STEPS } from "@/lib/case-steps";
import { CaseStepsBar } from "@/components/case-progress";
import { IdentityStepForm } from "@/components/case-steps-forms";

// الحاقیهٔ ۲.۱۰.۰ — ثبت پرونده جدید فقط از مسیر ویزارد مرحله‌ای آغاز می‌شود.
export default async function NewCasePage() {
  const user = await requireUser(); if (!(await can(user, "cases.create"))) redirect("/cases");
  if (user.effectiveRole === "activist") { const [own] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(eq(activists.userId, user.id), isNull(applications.deletedAt))).limit(1); if (own) redirect(`/cases/${own.id}`); }
  await ensureReferenceData();
  const sourceOptions = user.effectiveRole === "activist" ? [] : isManager(user)
    ? [{ value: "manager", label: "ثبت توسط مدیر" }, { value: "expert", label: "ثبت توسط کارشناس" }, { value: "paper", label: "ورود از فرم کاغذی" }]
    : [{ value: "expert", label: "ثبت توسط کارشناس" }, { value: "paper", label: "ورود از فرم کاغذی" }];
  const steps = CASE_STEPS.map((step, index) => ({ key: step.key, index, title: step.title, hint: step.hint, status: index === 0 ? "incomplete" as const : "locked" as const, missing: [] }));
  return <><div className="ws-breadcrumb"><Link href="/cases">پرونده‌ها</Link><span> / </span><b>ثبت پرونده جدید</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پرونده الکترونیکی</div><h1>ثبت پرونده جدید</h1><p>ثبت اطلاعات مرحله‌به‌مرحله و اجباری است؛ تا مرحلهٔ جاری کامل و ذخیره نشود، مرحلهٔ بعدی قفل می‌ماند.</p></div><Link href="/cases" className="secondary-button"><ArrowRight size={16} /> بازگشت به فهرست</Link></div><CaseStepsBar steps={steps} caseId="new" completedCount={0} totalCount={CASE_STEPS.length} entryHref="/cases/new" /><section className="ws-panel form-panel"><IdentityStepForm sourceOptions={sourceOptions} /></section></>;
}
