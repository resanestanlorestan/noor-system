import Link from "next/link";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ArrowLeft, BarChart3, BellRing, DatabaseBackup, FilePlus2, Route, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/db";
import { activists, applications, provinces, counties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";
import { can } from "@/lib/permissions";
import { faDate, faNumber } from "@/lib/format";
import { monthTimeline } from "@/lib/report-data";
import { readBackupMarker, formatBytes } from "@/lib/backup-status";
import { computeCaseSteps, loadCaseStepFacts } from "@/lib/case-steps";
import { CaseStepsBar } from "@/components/case-progress";
import { CaseTable } from "@/components/case-table";

export default async function DashboardPage() {
  // الحاقیهٔ ۲.۱۰.۴ — داشبورد فقط پرونده‌های فعال را می‌شمارد
  const user = await requireUser(); const scope = and(scopeCondition(user), isNull(applications.deletedAt));
  const createAllowed = await can(user, "cases.create");
  const reminderAllowed = await can(user, "reminders.send");
  const backupStatus = user.effectiveRole === "super_admin" ? await readBackupMarker() : null;
  const localDate = sql<string>`(${applications.createdAt} at time zone 'Asia/Tehran')::date`;
  const [overdueCount, recent, daily] = await Promise.all([
    db.select({ total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(and(scope, inArray(applications.status, ["pending", "specialist_review"]), sql`${applications.updatedAt} < now() - interval '14 days'`)),
    db.select({ id: applications.id, firstName: activists.firstName, lastName: activists.lastName, nationalIdLast4: activists.nationalIdLast4, status: applications.status, createdAt: applications.createdAt, province: provinces.name, county: counties.name }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).leftJoin(provinces, eq(activists.provinceId, provinces.id)).leftJoin(counties, eq(activists.countyId, counties.id)).where(scope).orderBy(desc(applications.createdAt)).limit(5),
    db.select({ date: localDate, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(scope).groupBy(localDate),
  ]);
  const overdue = overdueCount[0]?.total || 0;
  const timeline = monthTimeline(daily);
  const trendMax = Math.max(...timeline.map((point) => point.total), 1);
  const createHref = user.effectiveRole === "activist" && recent[0] ? `/cases/${recent[0].id}` : "/cases/new";
  // الحاقیهٔ ۲.۱۰.۰: نوار پیشرفت مراحل ثبت، بالای داشبوردِ فعال قرآنی
  let activistStrip: React.ReactNode = null;
  if (user.effectiveRole === "activist" && recent[0]) {
    const [own] = await db.select({ application: applications, activist: activists }).from(applications).innerJoin(activists, eq(activists.id, applications.activistId)).where(eq(activists.userId, user.id)).limit(1);
    if (own && ["draft", "completing", "needs_correction"].includes(own.application.status)) {
      const plan = computeCaseSteps(await loadCaseStepFacts(own.activist, own.application.status, own.application.id));
      if (plan.steps.some((step) => step.status !== "completed")) activistStrip = <CaseStepsBar steps={plan.steps} caseId={own.application.id} completedCount={plan.completedCount} totalCount={plan.totalCount} variant="compact" />;
    }
  }
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>داشبورد</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> نمای کلی سامانه</div><h1>{user.effectiveRole === "activist" ? "داشبورد من" : "داشبورد مدیریتی"}</h1><p>به سامانه جامع فعالان قرآنی خوش آمدید</p></div>{createAllowed && <Link className="primary-button" href={createHref}><FilePlus2 size={17} /> {user.effectiveRole === "activist" && recent.length ? "مشاهده پرونده من" : "ثبت پرونده جدید"}</Link>}</div>
    {user.effectiveRole === "activist" && recent.length === 0 && <div className="ws-notice">ثبت‌نام اولیه انجام شده است؛ برای شروع، پرونده الکترونیکی خود را ایجاد کنید یا اگر پیش‌تر توسط مدیر ثبت شده، <Link href="/cases/claim">آن را به حساب خود متصل کنید</Link>.</div>}
    {activistStrip}
    <section className="ws-hero"><div className="ws-hero-art" /><div className="ws-hero-shade" /><div className="ws-hero-content"><span><Sparkles size={14} /> همراه جامعه قرآنی</span><h2>{user.fullName}، خوش آمدید</h2><p>در کنار هم، برای شناسایی و همراهی بهتر با فعالان قرآنی.<br />پرونده‌ها و اقدامات خود را از اینجا پیگیری کنید.</p><Link href="/cases">مشاهده پرونده‌ها <ArrowLeft size={16} /></Link></div><div className="ws-hero-caption">همراهی برای آینده‌ای روشن</div></section>
    {reminderAllowed && overdue > 0 && <div className="ws-notice"><BellRing size={18} /> <strong>{faNumber(overdue)} پرونده بیش از ۱۴ روز بدون بررسی مانده است.</strong> <Link href="/reminders" className="ws-text-link">ارسال یادآور پیامکی به مسئولان <ArrowLeft size={14} /></Link></div>}
    <section className="ws-panel dashboard-trend"><div className="ws-panel-head"><div><span>نمودار روند</span><h2>روند ثبت‌نام شش ماه شمسی</h2><p>پرونده‌های ثبت‌شده در شش ماه منتهی به ماه جاری</p></div><BarChart3 size={20} /></div><div className="trend-chart">{timeline.map((point) => <div key={point.name}><strong>{faNumber(point.total)}</strong><span><i style={{ height: `${Math.max(3, (point.total / trendMax) * 100)}%` }} /></span><small>{point.name.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}</small></div>)}</div></section>
    <div className="ws-dashboard-grid"><section className="ws-panel recent-panel"><div className="ws-panel-head"><div><span>دسترسی سریع</span><h2>آخرین پرونده‌ها</h2><p>آخرین اطلاعات ثبت‌شده در محدوده شما</p></div><Link href="/cases">مشاهده همه <ArrowLeft size={15} /></Link></div><CaseTable rows={recent} empty="برای شروع، اولین پرونده را ثبت کنید." /></section>
      <aside className="ws-dashboard-side"><div className="ws-panel overview-panel"><div className="ws-panel-head"><div><span>گردش کار</span><h2>وضعیت پرونده‌ها</h2><p>تایم‌لاین هشت‌مرحله‌ای هر پرونده</p></div><Route size={20} /></div><p className="table-footnote">از ثبت‌نام اولیه و تکمیل مدارک تا ارسال، بررسی تخصصی و نتیجهٔ نهایی — با تاریخ ورود به هر مرحله.</p><Link href="/case-status" className="secondary-button"><Route size={16} /> مشاهده وضعیت پرونده‌ها <ArrowLeft size={14} /></Link></div>{backupStatus !== null || user.effectiveRole === "super_admin" ? <div className="ws-info-note backup-panel"><DatabaseBackup size={20} /><div><strong>آخرین پشتیبان موفق</strong>{backupStatus ? <p>{faDate(backupStatus.at, true)} — {formatBytes(backupStatus.sizeBytes)}<br /><span dir="ltr" className="table-subtle">{backupStatus.file}</span></p> : <p>هنوز پشتیبانی ثبت نشده است؛ <code dir="ltr">scripts/backup-production.sh</code> را با کرون cPanel روزانه اجرا کنید (مستندات: docs/BACKUP-RESTORE.md).</p>}</div></div> : <></>}<div className="ws-info-note"><ShieldCheck size={20} /><div><strong>حریم خصوصی و کنترل دسترسی</strong><p>دسترسی به پرونده‌ها بر اساس نقش و محدوده جغرافیایی کنترل می‌شود و اقدامات حساس در رویدادهای سامانه ثبت می‌شوند.</p></div></div></aside></div>
  </>;
}
