import Link from "next/link";
import { ArrowLeft, Gauge, ListChecks, Route } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { CASE_STAGES, listCaseStatus, stageDateLabel, stageVisitLabel, type CaseTimeline } from "@/lib/case-status";
import { faNumber } from "@/lib/format";
import { StatusBadge } from "@/components/case-table";

function StageTrack({ timeline, compact }: { timeline: CaseTimeline; compact?: boolean }) {
  return (
    <ol className={`cs-track ${compact ? "compact" : ""}`} aria-label={`تایم‌لاین هشت‌مرحله‌ای پرونده ${timeline.activistName}`}>
      {CASE_STAGES.map((stage, index) => {
        const visit = timeline.stages[stage.key];
        const state = visit.isCurrent ? "current" : visit.reached ? "done" : "todo";
        const tone = stage.key === "final" && timeline.outcome === "rejected" ? "rejected" : "";
        return (
          <li key={stage.key} className={`cs-stage ${state} ${tone}`} title={stageVisitLabel(stage.label, visit)}>
            <span className="cs-dot"><i /></span>
            <small className="cs-step">{faNumber(index + 1)}</small>
            <strong className="cs-label">{stage.label}</strong>
            <small className="cs-date">{stageDateLabel(visit.reachedAt)}</small>
          </li>
        );
      })}
    </ol>
  );
}

export default async function CaseStatusPage() {
  const user = await requireUser();
  const { timelines, totals, total, truncated } = await listCaseStatus(user);
  const isActivist = user.effectiveRole === "activist";
  const maxTotal = Math.max(...CASE_STAGES.map((stage) => totals[stage.key]), 1);

  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>وضعیت پرونده‌ها</b></div>
    <div className="ws-page-head">
      <div>
        <div className="ws-eyebrow"><span /> پیگیری گردش کار</div>
        <h1>وضعیت پرونده‌ها</h1>
        <p>{isActivist
          ? "مسیر هشت‌مرحله‌ای پرونده شما — از ثبت‌نام اولیه تا نتیجهٔ نهایی — با تاریخ هر مرحله"
          : `نمای هشت‌مرحله‌ای گردش کار ${faNumber(total)} پرونده در محدودهٔ دسترسی شما؛ از ثبت‌نام اولیه تا نتیجهٔ نهایی`}</p>
      </div>
      <Link className="secondary-button" href="/cases"><ListChecks size={16} /> بانک پرونده‌ها</Link>
    </div>

    <section className="ws-panel">
      <div className="ws-panel-head">
        <div>
          <span>نمای کلی مراحل</span>
          <h2>پرونده‌ها در هر مرحله از گردش کار</h2>
          <p>شمارش روی کل پرونده‌های محدودهٔ مجاز شما؛ مرحلهٔ «نتیجهٔ نهایی» شامل تأییدشده و ردشده است.</p>
        </div>
        <span className="panel-outline-icon"><Gauge size={18} /></span>
      </div>
      <div className="cs-overview">
        {CASE_STAGES.map((stage, index) => (
          <div className="cs-overview-item" key={stage.key} style={{ ["--stage-color" as string]: stage.color }}>
            <span className="cs-overview-dot" />
            <div>
              <small>{faNumber(index + 1)}. {stage.label}</small>
              <strong>{faNumber(totals[stage.key])} <em>پرونده</em></strong>
              <div className="cs-bar"><i style={{ width: `${Math.max(totals[stage.key] ? 6 : 0, (totals[stage.key] / maxTotal) * 100)}%` }} /></div>
              <p>{stage.hint}</p>
            </div>
          </div>
        ))}
      </div>
      {isActivist && timelines.length === 0 && <div className="empty-state"><span><Route size={22} /></span><strong>هنوز پرونده‌ای برای شما ثبت نشده است</strong><p>پس از ایجاد پرونده الکترونیکی، مسیر هشت‌مرحله‌ای آن با تاریخ هر مرحله اینجا نمایش داده می‌شود.</p><Link className="secondary-button" href="/cases/new">ثبت پرونده جدید <ArrowLeft size={15} /></Link></div>}
    </section>

    {timelines.length > 0 && <section className="ws-panel ws-list-panel">
      <div className="ws-panel-head">
        <div>
          <span>{truncated ? `${faNumber(total)} پرونده در محدودهٔ شما — نمایش آخرین ${faNumber(timelines.length)} مورد` : `تایم‌لاین ${faNumber(total)} پرونده`}</span>
          <h2>تایم‌لاین هشت‌مرحله‌ای پرونده‌ها</h2>
          <p>پرونده‌های پیش‌رفته‌تر بالاتر نمایش داده می‌شوند؛ مرحلهٔ جاری هر پرونده با حلقهٔ رنگی مشخص است و تاریخ ورود به هر مرحله زیر آن می‌آید.</p>
        </div>
        <span className="panel-outline-icon"><Route size={18} /></span>
      </div>
      <div className="cs-cases">
        {timelines.map((timeline) => (
          <article className="cs-case" key={timeline.caseId}>
            <header className="cs-case-head">
              <Link className="table-link" href={`/cases/${timeline.caseId}`}>{timeline.activistName}</Link>
              <StatusBadge status={timeline.status} />
              <small className="table-subtle">{[timeline.province, timeline.county].filter(Boolean).join(" / ") || "—"}{isActivist ? "" : ` · ${faNumber(timeline.waitingDays)} روز در این مرحله`}</small>
            </header>
            <StageTrack timeline={timeline} compact={!isActivist} />
          </article>
        ))}
      </div>
    </section>}
  </>;
}
