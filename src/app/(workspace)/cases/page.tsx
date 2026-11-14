import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowDownToLine, ArrowLeft, FilePlus2, Filter, Search } from "lucide-react";
import { db } from "@/db";
import { activists, applications, counties, provinces, specialties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData, isManager } from "@/lib/data";
import { can } from "@/lib/permissions";
import { faNumber } from "@/lib/format";
import { sourceLabels, statusLabels } from "@/lib/constants";
import { caseFilterQuery, listFilterableExperts, parseCaseFilters, searchCases, sortLabels, type CaseSearchInput } from "@/lib/case-search";
import { computeCaseSteps, loadCaseStepFacts } from "@/lib/case-steps";
import { CaseStepsBar } from "@/components/case-progress";
import { CaseTable } from "@/components/case-table";
import { FlashNotice } from "@/components/flash-notice";
import { popFlash } from "@/lib/flash";

export default async function CasesPage({ searchParams }: { searchParams: Promise<CaseSearchInput & { page?: string; m?: string }> }) {
  const user = await requireUser(); const params = await searchParams; await ensureReferenceData();
  // الحاقیهٔ ۲.۱۰.۳ — پیام نتیجهٔ اکشن‌ها با توکن فلش یک‌بارمصرف می‌آید، نه در URL.
  const flash = popFlash(params.m);
  const parsed = parseCaseFilters(params); const page = Math.max(1, Math.min(100000, Number.parseInt(params.page || "1", 10) || 1));
  const { rows, total } = parsed.error ? { rows: [], total: 0 } : await searchCases(user, parsed.filters, page);
  const pages = Math.max(1, Math.ceil(total / 10));
  const query = caseFilterQuery(parsed.filters); const pageLink = (n: number) => { const p = new URLSearchParams(query); p.set("page", String(n)); return `/cases?${p}`; };
  const showProvince = user.effectiveRole === "super_admin";
  const showCounty = user.effectiveRole === "super_admin" || user.effectiveRole === "province_admin";
  const manager = isManager(user);
  const [allSpecialties, allProvinces, allCounties, experts] = await Promise.all([
    db.select().from(specialties).orderBy(specialties.id),
    showProvince ? db.select().from(provinces).orderBy(provinces.name) : Promise.resolve([]),
    showCounty ? (user.effectiveRole === "province_admin" && user.provinceId ? db.select().from(counties).where(eq(counties.provinceId, user.provinceId)).orderBy(counties.name) : db.select().from(counties).orderBy(counties.name)) : Promise.resolve([]),
    listFilterableExperts(user),
  ]);
  const f = parsed.filters;
  const hasFilters = !!(f.q || f.status || f.provinceId || f.countyId || f.specialtyId || f.expertId || f.source || f.institution || f.from || f.to || f.deleted);
  const caseAdmin = user.effectiveRole === "super_admin";
  // الحاقیهٔ ۲.۱۰.۰: نوار پیشرفت ثبت اطلاعات برای پروندهٔ خودِ فعال قرآنی
  let activistStrip: React.ReactNode = null;
  if (user.effectiveRole === "activist" && rows.length) {
    const [own] = await db.select({ application: applications, activist: activists }).from(applications).innerJoin(activists, eq(activists.id, applications.activistId)).where(eq(activists.userId, user.id)).limit(1);
    if (own && ["draft", "completing", "needs_correction"].includes(own.application.status)) {
      const plan = computeCaseSteps(await loadCaseStepFacts(own.activist, own.application.status, own.application.id));
      if (plan.steps.some((step) => step.status !== "completed")) activistStrip = <CaseStepsBar steps={plan.steps} caseId={own.application.id} completedCount={plan.completedCount} totalCount={plan.totalCount} variant="compact" />;
    }
  }
  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>{user.effectiveRole === "activist" ? "پرونده من" : "بانک پرونده‌ها"}</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پرونده‌های الکترونیکی</div><h1>{user.effectiveRole === "activist" ? "پرونده من" : "بانک پرونده‌ها"}</h1><p>مشاهده و پیگیری پرونده‌ها در محدوده دسترسی شما</p></div>{(await can(user, "cases.create")) && !(user.effectiveRole === "activist" && rows.length) && <div className="head-actions"><Link className="primary-button" href="/cases/new"><FilePlus2 size={17} /> ثبت پرونده جدید</Link>{user.effectiveRole === "activist" && <Link className="secondary-button" href="/cases/claim">اتصال پرونده ثبت‌شده</Link>}</div>}</div>
    {flash && <FlashNotice message={flash} />}
    {activistStrip}
    <section className="ws-panel ws-list-panel">
      <div className="ws-panel-head"><div><span>مدیریت و پیگیری</span><h2>فهرست پرونده‌ها</h2><p>{faNumber(total)} پرونده در نتایج</p></div>{manager && !parsed.error && <a className="secondary-button" href={`/api/cases/export?${query}`}><ArrowDownToLine size={15} /> خروجی Excel</a>}{!manager && <span className="panel-outline-icon"><Filter size={18} /></span>}</div>
      <form className="case-filters" action="/cases">
        <div className="filter-search"><Search size={17} /><input name="q" defaultValue={f.q} placeholder="نام، کد ملی یا شماره تماس" aria-label="جست‌وجوی پرونده" /></div>
        <select name="status" defaultValue={f.status || ""} aria-label="وضعیت پرونده"><option value="">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        {showProvince && <select name="provinceId" defaultValue={f.provinceId || ""} aria-label="استان"><option value="">همه استان‌ها</option>{allProvinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {showCounty && <select name="countyId" defaultValue={f.countyId || ""} aria-label="شهرستان"><option value="">همه شهرستان‌ها</option>{allCounties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <select name="specialtyId" defaultValue={f.specialtyId || ""} aria-label="تخصص"><option value="">همه تخصص‌ها</option>{allSpecialties.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        {manager && <select name="expertId" defaultValue={f.expertId || ""} aria-label="کارشناس مسئول"><option value="">همه کارشناسان</option>{experts.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>}
        {manager && <select name="source" defaultValue={f.source || ""} aria-label="منبع ثبت"><option value="">همه منابع</option>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
        {manager && <input name="institution" defaultValue={f.institution} maxLength={120} placeholder="نام مؤسسه" aria-label="مؤسسه" />}
        <input name="from" defaultValue={f.from} placeholder="از تاریخ ۱۴۰۳/۰۱/۰۱" aria-label="از تاریخ" inputMode="numeric" />
        <input name="to" defaultValue={f.to} placeholder="تا تاریخ" aria-label="تا تاریخ" inputMode="numeric" />
        <select name="sort" defaultValue={f.sort} aria-label="مرتب‌سازی">{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        {caseAdmin && <label className="filter-check"><input type="checkbox" name="deleted" value="1" defaultChecked={f.deleted} /> حذف‌شده‌ها</label>}
        <button className="secondary-button">اعمال فیلتر</button>{hasFilters && <Link href="/cases" className="clear-filter">پاک کردن</Link>}
      </form>
      {parsed.error && <div className="form-error report-filter-error" role="alert">{parsed.error}</div>}
      <CaseTable rows={rows} empty={f.deleted ? "پروندهٔ حذف‌شده‌ای در نتایج نیست." : "با تغییر فیلترها یا ثبت پرونده جدید دوباره بررسی کنید."} admin={caseAdmin} />
      <div className="ws-pagination"><span>صفحه {faNumber(page)} از {faNumber(pages)}</span><div>{page > 1 && <Link href={pageLink(page - 1)}>صفحه قبل</Link>}{page < pages && <Link href={pageLink(page + 1)}>صفحه بعد <ArrowLeft size={14} /></Link>}</div></div>
    </section>
  </>;
}
