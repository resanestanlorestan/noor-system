import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadDossier } from "@/lib/dossier";
import { faNumber } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

const dash = "—";
const faDigits = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const faLongDate = (date: Date) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(date);

function IdentityField({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="dossier-field"><small>{label}</small><strong>{value || dash}</strong></div>;
}

function SectionTable({ title, rows, headers }: { title: string; rows: React.ReactNode; headers: string[] }) {
  return <section className="dossier-section">
    <h2>{title}</h2>
    {rows ? <table className="dossier-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table> : <p className="dossier-empty">موردی ثبت نشده است.</p>}
  </section>;
}

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await loadDossier(user, id);
  if (!data) notFound();
  const person = data.person;
  const generatedAt = new Date();

  return <>
    <div className="ws-breadcrumb no-print"><Link href="/cases">پرونده‌ها</Link><span> / </span><Link href={`/cases/${id}`}>جزئیات پرونده</Link><span> / </span><b>دوزیه رسمی</b></div>
    <div className="ws-page-head no-print"><div><div className="ws-eyebrow"><span /> سند رسمی قابل چاپ</div><h1>دوزیه رسمی پرونده</h1><p>نسخه چاپی و PDF-شدنی خلاصه رسمی پرونده؛ همه داده‌ها از پرونده الکترونیکی و در محدوده دسترسی شما</p></div><div className="head-actions"><Link href={`/cases/${id}`} className="secondary-button"><ArrowRight size={16} /> بازگشت به پرونده</Link><PrintButton /></div></div>

    <article className="dossier-sheet" dir="rtl">
      <header className="dossier-header">
        <div className="dossier-brand"><strong>سامانه جامع فعالان قرآنی</strong><span>دوزیه رسمی پرونده قرآنی</span></div>
        <div className="dossier-meta">
          <span dir="ltr">شناسه پرونده: {data.caseId.slice(0, 8)}…</span>
          <span>تاریخ تهیه: {faLongDate(generatedAt)}</span>
        </div>
      </header>
      <div className="dossier-title-row">
        <h1>{person.firstName} {person.lastName}</h1>
        <span className="dossier-status">{data.statusLabel}</span>
        <span className="dossier-level" style={{ color: data.levelColor }}>امتیاز {faNumber(data.score)} · سطح {data.levelLabel}</span>
      </div>

      <section className="dossier-section">
        <h2>اطلاعات هویتی و تماس</h2>
        <div className="dossier-grid">
          <IdentityField label="نام و نام خانوادگی" value={`${person.firstName} ${person.lastName}`} />
          <IdentityField label="نام پدر" value={person.fatherName} />
          <IdentityField label="کد ملی (پوشانده‌شده)" value={person.nationalIdLast4 ? `••••••${person.nationalIdLast4}` : null} />
          <IdentityField label="شماره شناسنامه" value={person.idCardNumber} />
          <IdentityField label="محل صدور" value={person.idIssuePlace} />
          <IdentityField label="شغل" value={person.job} />
          <IdentityField label="تاریخ تولد (شمسی)" value={person.birthDate ? faDigits(String(person.birthDate)) : null} />
          <IdentityField label="جنسیت" value={person.gender === "male" ? "مرد" : person.gender === "female" ? "زن" : null} />
          <IdentityField label="شماره تماس" value={person.phone} />
          <IdentityField label="ایمیل" value={person.email} />
          <IdentityField label="محل سکونت" value={[data.provinceName, data.countyName, person.city].filter(Boolean).join("، ") || null} />
          <IdentityField label="نشانی" value={person.address} />
          <IdentityField label="محل فعالیت قرآنی" value={[data.activityProvinceName, data.activityCountyName, person.activityPlace].filter(Boolean).join("، ") || null} />
          <IdentityField label="مؤسسه / سازمان" value={person.organization} />
        </div>
        {person.notes && <p className="dossier-notes"><small>توضیحات تکمیلی:</small> {person.notes}</p>}
      </section>

      {data.specialtyTitles.length > 0 && <section className="dossier-section">
        <h2>حوزه‌های تخصصی</h2>
        <div className="dossier-tags">{data.specialtyTitles.map((title) => <span key={title}>{title}</span>)}</div>
        {data.specialtyDetailLines.length > 0 && <ul className="dossier-detail-list">{data.specialtyDetailLines.map((item) => <li key={item.id}><strong>{item.title}:</strong> {item.detail}</li>)}</ul>}
      </section>}

      <SectionTable title="آثار و تألیفات (کتاب / مقاله)" headers={["نام اثر", "نوع · موضوع"]} rows={
        data.writings.length
          ? data.writings.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td></tr>)
          : null
      } />

      <SectionTable title="سوابق تحصیلی (حوزوی / دانشگاهی)" headers={["نوع و مقطع", "رشته · مرکز · مدرک"]} rows={
        data.education.length
          ? data.education.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td></tr>)
          : null
      } />

      <SectionTable title="سوابق شغلی (سابقه اشتغال به کار)" headers={["عنوان", "کارفرما · سمت", "بازه"]} rows={
        data.workHistory.length
          ? data.workHistory.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td><td>{item.period}</td></tr>)
          : null
      } />

      <SectionTable title="سوابق فعالیت قرآنی" headers={["عنوان", "نوع", "سازمان / سمت", "بازه"]} rows={
        data.activities.length
          ? data.activities.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.kindLabel}</td><td>{item.extra || dash}</td><td>{item.period}</td></tr>)
          : null
      } />

      <SectionTable title="دوره‌های آموزشی" headers={["عنوان دوره", "برگزارکننده", "ساعت", "تاریخ گذراندن"]} rows={
        data.courses.length
          ? data.courses.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td><td>{item.kindLabel || dash}</td><td>{item.period}</td></tr>)
          : null
      } />

      <SectionTable title="گواهینامه‌ها، احکام و تقدیرنامه‌ها" headers={["عنوان", "صادرکننده", "تاریخ"]} rows={
        data.certificateRows.length
          ? data.certificateRows.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td><td>{item.period}</td></tr>)
          : null
      } />

      <SectionTable title="همکاری با سازمان‌ها" headers={["سازمان", "سمت", "بازه همکاری"]} rows={
        data.organizations.length
          ? data.organizations.map((item) => <tr key={item.id}><td>{item.main}</td><td>{item.extra || dash}</td><td>{item.period}</td></tr>)
          : null
      } />

      <SectionTable title="مدارک بارگذاری‌شده" headers={["عنوان مدرک", "نوع", "شماره مدرک"]} rows={
        data.documentList.length
          ? data.documentList.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.typeName || dash}</td><td>{item.docNumber || dash}</td></tr>)
          : null
      } />

      <section className="dossier-section">
        <h2>مسیر پرونده (تاریخچه وضعیت)</h2>
        {data.history.length ? <ul className="dossier-history">{data.history.map((item) => <li key={item.id}><strong>{item.text}</strong><span>{item.actor} · {item.at}</span>{item.note && <p>{item.note}</p>}</li>)}</ul> : <p className="dossier-empty">تاریخچه‌ای ثبت نشده است.</p>}
      </section>

      <footer className="dossier-footer">
        <span>تهیه‌شده توسط {user.fullName} از سامانه جامع فعالان قرآنی · {faLongDate(generatedAt)}</span>
        <span>این سند بر اساس داده‌های پرونده الکترونیکی در لحظه تهیه تولید شده است.</span>
      </footer>
    </article>
  </>;
}
