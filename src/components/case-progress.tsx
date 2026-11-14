// الحاقیهٔ ۲.۱۰.۰ — نوار پیشرفت مراحل ثبت اطلاعات.
// Server Component؛ وضعیت مراحل از موتور سرور می‌آید و در همین نوار با چهار
// وضعیت (تکمیل‌شده، در حال تکمیل، تکمیل‌نشده، قفل‌شده) نمایش داده می‌شود.
// مراحل قفل‌شده پیوند ندارند؛ ورود به آن‌ها حتی با تغییر دستی URL در سرور
// رد می‌شود (صفحهٔ مرحله و اکشن‌های ذخیره هر دو گارد سروری دارند).

import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { caseStepStatusLabel, type CaseStepView } from "@/lib/case-steps";

const faNumber = (value: number) => new Intl.NumberFormat("fa-IR").format(value);

export function CaseStepsBar({ steps, caseId, completedCount, totalCount, variant = "full", entryHref }: { steps: CaseStepView[]; caseId: string; completedCount: number; totalCount: number; variant?: "full" | "compact"; entryHref?: string }) {
  const remaining = totalCount - completedCount;
  const active = steps.find((step) => step.status === "in_progress" || step.status === "incomplete");
  if (variant === "compact") {
    const percent = Math.round((completedCount / totalCount) * 100);
    return <div className="case-progress-compact" role="status">
      <div className="case-progress-compact-text">
        <strong>پیشرفت ثبت اطلاعات: {faNumber(completedCount)} از {faNumber(totalCount)} مرحله</strong>
        <span>{remaining ? `${faNumber(remaining)} مرحله باقی مانده${active ? ` — مرحلهٔ جاری: ${active.title}` : ""}` : "همهٔ مراحل تکمیل شده است"}</span>
      </div>
      <div className="case-progress-meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      {active && <Link className="secondary-button" href={`/cases/${caseId}/steps/${active.index + 1}`}>ادامهٔ ثبت</Link>}
      {!active && <Link className="secondary-button" href={`/cases/${caseId}`}>مشاهدهٔ پرونده</Link>}
    </div>;
  }
  return <section className="case-progress ws-panel" aria-label="نوار پیشرفت مراحل ثبت اطلاعات">
    <div className="case-progress-head">
      <div><span>ثبت اطلاعات پرونده</span><h2>مراحل ثبت، به‌ترتیب و اجباری</h2></div>
      <div className="case-progress-counts" role="status">
        <strong>{faNumber(completedCount)} از {faNumber(totalCount)} مرحله تکمیل شده</strong>
        <span>{remaining ? `${faNumber(remaining)} مرحله باقی مانده` : "همهٔ مراحل کامل شده است"}</span>
      </div>
    </div>
    <ol className="case-steps">
      {steps.map((step) => {
        const unlocked = step.status === "completed" || step.status === "in_progress" || step.status === "incomplete";
        const icon = step.status === "completed" ? <CheckCircle2 size={17} /> : step.status === "locked" ? <Lock size={15} /> : step.status === "in_progress" ? <CircleDot size={17} /> : <Circle size={17} />;
        const label = <><span className="case-step-icon">{icon}</span><span className="case-step-text"><small>مرحلهٔ {faNumber(step.index + 1)}</small><strong>{step.title}</strong><em className={`case-step-state state-${step.status}`}>{caseStepStatusLabel[step.status]}</em></span></>;
        return <li key={step.key} className={`case-step is-${step.status}`}>
          {unlocked ? <Link href={entryHref && step.index === 0 ? entryHref : `/cases/${caseId}/steps/${step.index + 1}`} aria-current={step.status === "in_progress" || step.status === "incomplete" ? "step" : undefined}>{label}</Link> : <div aria-disabled="true" title="این مرحله تا تکمیل مراحل قبل قفل است">{label}</div>}
        </li>;
      })}
    </ol>
    {active?.missing.length ? <p className="case-progress-missing">موارد ناقص مرحلهٔ جاری ({active.title}): {active.missing.join("، ")}</p> : null}
  </section>;
}
