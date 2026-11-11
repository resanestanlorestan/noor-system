import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, educationRecords, educationalCourses, specialties, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { missingRequired } from "@/lib/data";
import { statusLabels, statusColors, educationTypeLabels, genderLabels } from "@/lib/constants";
import { isoToJalali } from "@/lib/format";
import { prepareCaseAction, submitCaseAction, returnToCompletingAction } from "@/app/actions/cases";
import { WorkHistorySection } from "@/components/forms/work-history-section";
import { CoursesSection } from "@/components/forms/courses-section";
import { EducationRowsSection } from "@/components/forms/education-rows";

export default async function CaseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ message?: string }> }) {
  const { id } = await params;
  const { message } = await searchParams;
  const user = await requireUser();
  const row = await getCaseForUser(user, id);
  if (!row) notFound();

  const editable = ["draft", "completing", "needs_correction"].includes(row.application.status);
  const [specs, eduRows, workRows, courseRows] = await Promise.all([
    db.select({ title: specialties.title }).from(activistSpecialties).innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id)).where(eq(activistSpecialties.activistId, row.activist.id)),
    db.select().from(educationRecords).where(eq(educationRecords.activistId, row.activist.id)),
    db.select().from(workHistory).where(eq(workHistory.activistId, row.activist.id)),
    db.select().from(educationalCourses).where(eq(educationalCourses.activistId, row.activist.id)),
  ]);
  const missingNow = await missingRequired(row.activist, specs.length, 1);

  return (
    <div className="space-y-4" dir="rtl">
      {message && <div className="alert-success">{decodeURIComponent(message)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">پرونده {row.activist.firstName} {row.activist.lastName}</h1>
        <span className={`badge ${statusColors[row.application.status]}`}>{statusLabels[row.application.status]}</span>
      </div>

      {missingNow.length > 0 && editable && (
        <div className="alert-warn">برای ارسال باید تکمیل شود: {missingNow.join("، ")}</div>
      )}

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">اطلاعات هویتی</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-slate-500">نام و نام خانوادگی</dt><dd>{row.activist.firstName} {row.activist.lastName}</dd></div>
          <div><dt className="text-slate-500">نام پدر</dt><dd>{row.activist.fatherName ?? "—"}</dd></div>
          <div><dt className="text-slate-500">کد ملی</dt><dd>{row.activist.nationalIdLast4 ? `****${row.activist.nationalIdLast4}` : "—"}</dd></div>
          <div><dt className="text-slate-500">تاریخ تولد</dt><dd>{row.activist.birthDate ? isoToJalali(row.activist.birthDate) : "—"}</dd></div>
          <div><dt className="text-slate-500">جنسیت</dt><dd>{genderLabels[row.activist.gender ?? ""] ?? "—"}</dd></div>
          <div><dt className="text-slate-500">شماره همراه</dt><dd>{row.activist.phone ?? "—"}</dd></div>
          <div><dt className="text-slate-500">شغل</dt><dd>{row.activist.job ?? "—"}</dd></div>
          <div><dt className="text-slate-500">سازمان</dt><dd>{row.activist.organization ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">تخصص‌های قرآنی</h2>
        <div className="flex flex-wrap gap-2">
          {specs.length === 0 && <span className="text-sm text-slate-500">انتخاب نشده است.</span>}
          {specs.map((s) => <span key={s.title} className="badge bg-slate-100 text-slate-700">{s.title}</span>)}
        </div>
      </section>

      <EducationRowsSection activistId={row.activist.id} caseId={row.application.id} rows={eduRows.map((r) => ({ id: r.id, type: r.type, level: r.level, field: r.field, centerName: r.centerName, certificate: r.certificate }))} editable={editable} />

      <WorkHistorySection activistId={row.activist.id} caseId={row.application.id} rows={workRows.map((r) => ({ id: r.id, title: r.title, employer: r.employer, position: r.position, startDate: r.startDate, endDate: r.endDate, description: r.description }))} editable={editable} />

      <CoursesSection activistId={row.activist.id} caseId={row.application.id} rows={courseRows.map((r) => ({ id: r.id, title: r.title, provider: r.provider, completedDate: r.completedDate, hours: r.hours }))} editable={editable} />

      <div className="flex flex-wrap gap-3">
        {editable && (
          <form action={prepareCaseAction}>
            <input type="hidden" name="caseId" value={id} />
            <button type="submit" className="btn-ghost">آماده‌سازی ارسال</button>
          </form>
        )}
        {row.application.status === "ready" && (
          <form action={submitCaseAction}>
            <input type="hidden" name="caseId" value={id} />
            <button type="submit" className="btn-primary">ارسال برای بررسی</button>
          </form>
        )}
        {row.application.status === "ready" && (
          <form action={returnToCompletingAction}>
            <input type="hidden" name="caseId" value={id} />
            <button type="submit" className="btn-ghost">بازگشت به تکمیل</button>
          </form>
        )}
        <Link href="/cases" className="btn-ghost">بازگشت به فهرست</Link>
      </div>
    </div>
  );
}
