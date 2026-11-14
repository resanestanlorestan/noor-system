import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Download, FileText, Pencil, Send, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, counties, documentRequests, documents, educationRecords, provinces, specialties, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { can } from "@/lib/permissions";
import { faDate, faNumber, isoToJalali } from "@/lib/format";
import { documentTypeLabels, educationTypeLabels, statusLabels, writingTypeLabels } from "@/lib/constants";
import { CASE_STEPS, computeCaseSteps, loadCaseStepFacts } from "@/lib/case-steps";
import { CaseStepsBar } from "@/components/case-progress";
import { IdentityStepForm, LocationStepForm, SpecialtiesStepForm } from "@/components/case-steps-forms";
import { ConfirmButton, DocumentUpload, PhotoRemove, PhotoUpload } from "@/components/case-controls";
import { prepareCaseAction, submitCaseAction } from "@/app/actions/cases";

const EDITABLE_STATUSES = ["draft", "completing", "needs_correction"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];
const fa = new Intl.NumberFormat("fa-IR");

// الحاقیهٔ ۲.۱۰.۰ — صفحات مراحل ویزارد ثبت اطلاعات. ورود به هر مرحله در سرور
// کنترل می‌شود: مراحل قفل با ریدایرکت اجباری به مرحلهٔ جاری بسته می‌شوند؛
// تغییر دستی URL یا ورود مستقیم با لینک راهی به عبور از زنجیره ندارد.
export default async function CaseStepPage({ params, searchParams }: { params: Promise<{ id: string; step: string }>; searchParams: Promise<{ locked?: string }> }) {
  const user = await requireUser();
  const { id, step: stepParam } = await params;
  const query = await searchParams;
  const row = await getCaseForUser(user, id);
  if (!row) notFound();
  if (!EDITABLE_STATUSES.includes(row.application.status as EditableStatus) || !(await can(user, "cases.edit"))) redirect(`/cases/${id}`);
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const plan = computeCaseSteps(facts);
  const activeStep = plan.activeIndex + 1;
  const stepNumber = Number.parseInt(stepParam, 10);
  if (!stepNumber || stepNumber < 1 || stepNumber > CASE_STEPS.length) redirect(`/cases/${id}/steps/${activeStep}`);
  const requested = plan.steps[stepNumber - 1];
  if (requested.status === "locked") redirect(`/cases/${id}/steps/${activeStep}?locked=1`);

  const { application: app, activist: person } = row;
  const nonActivistEditor = user.effectiveRole !== "activist";
  const head = <><div className="ws-breadcrumb"><Link href="/cases">پرونده‌ها</Link><span> / </span><Link href={`/cases/${id}`}>جزئیات پرونده</Link><span> / </span><b>مرحلهٔ {fa.format(stepNumber)}</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> ویزارد ثبت اطلاعات</div><h1>{requested.title}</h1><p>{stepNumber === CASE_STEPS.length ? "بازبینی نهایی اطلاعات، کنترل آمادگی و ارسال برای بررسی." : `${requested.hint}؛ پس از ذخیرهٔ موفق، مرحلهٔ بعدی خودکار باز می‌شود.`}</p></div><Link href={`/cases/${id}`} className="secondary-button"><ArrowRight size={16} /> بازگشت به پرونده</Link></div>
    {query.locked === "1" && <div className="ws-notice" role="alert">ورود به مرحلهٔ قفل‌شده ممکن نیست؛ ابتدا مراحل قبل را کامل و ذخیره کنید. به مرحلهٔ جاری هدایت شدید.</div>}
    <CaseStepsBar steps={plan.steps} caseId={id} completedCount={plan.completedCount} totalCount={plan.totalCount} /></>;

  if (requested.key === "identity") {
    return <>{head}<section className="ws-panel form-panel"><IdentityStepForm caseId={id} hasNationalId={Boolean(person.nationalIdHash)} needsChangeReason={nonActivistEditor} defaults={{ firstName: person.firstName, lastName: person.lastName, fatherName: person.fatherName || "", idCardNumber: person.idCardNumber || "", idIssuePlace: person.idIssuePlace || "", birthDate: isoToJalali(person.birthDate), gender: person.gender || "", phone: person.phone || "", alternatePhone: person.alternatePhone || "", contactEmail: person.email || "" }} /></section></>;
  }

  if (requested.key === "location") {
    const allProvinces = await db.select().from(provinces).orderBy(provinces.name);
    const allCounties = await db.select().from(counties).orderBy(counties.name);
    const limited = user.effectiveRole !== "super_admin" && user.effectiveRole !== "activist";
    return <>{head}<section className="ws-panel form-panel"><LocationStepForm caseId={id} provinces={limited ? allProvinces.filter((item) => item.id === user.provinceId) : allProvinces} counties={limited && user.countyId ? allCounties.filter((item) => item.id === user.countyId) : allCounties} activityProvinces={allProvinces} activityCounties={allCounties} needsChangeReason={nonActivistEditor} defaults={{ provinceId: person.provinceId, countyId: person.countyId, city: person.city || "", postalCode: person.postalCode || "", address: person.address || "", activityProvinceId: person.activityProvinceId, activityCountyId: person.activityCountyId, activityPlace: person.activityPlace || "", organization: person.organization || "" }} /></section></>;
  }

  if (requested.key === "specialties") {
    const [allSpecialties, selected, detailRows, writingRows, education, workRows] = await Promise.all([
      db.select().from(specialties).orderBy(specialties.id),
      db.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, person.id)),
      db.select({ specialtyId: activistSpecialtyDetails.specialtyId, code: specialties.code, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialtyDetails).innerJoin(specialties, eq(activistSpecialtyDetails.specialtyId, specialties.id)).where(eq(activistSpecialtyDetails.activistId, person.id)),
      db.select().from(activistWritings).where(eq(activistWritings.activistId, person.id)).orderBy(activistWritings.createdAt),
      db.select().from(educationRecords).where(eq(educationRecords.activistId, person.id)),
      db.select().from(workHistory).where(eq(workHistory.activistId, person.id)),
    ]);
    return <>{head}<section className="ws-panel form-panel"><SpecialtiesStepForm caseId={id} specialties={allSpecialties} needsChangeReason={nonActivistEditor} defaults={{ specialtyIds: selected.map((item) => item.id), specialtyDetails: detailRows.map((item) => ({ specialtyId: item.specialtyId, code: item.code, detailValue: item.detailValue, detailOptions: item.detailOptions })), writings: writingRows.map((item) => ({ id: item.id, workTypeLabel: writingTypeLabels[item.workType], title: item.title, topic: item.topic })), education: education.map((item) => ({ id: item.id, typeLabel: educationTypeLabels[item.type], level: item.level, field: item.field, centerName: item.centerName, certificate: item.certificate })), workHistory: workRows.map((item) => ({ id: item.id, title: item.title, employer: item.employer, position: item.position, startDate: item.startDate, endDate: item.endDate, description: item.description })), job: person.job || "", notes: person.notes || "" }} /></section></>;
  }

  if (requested.key === "documents") {
    const [docRows, docRequestRows] = await Promise.all([
      db.select().from(documents).where(eq(documents.applicationId, id)).orderBy(desc(documents.createdAt)),
      db.select({ request: documentRequests }).from(documentRequests).where(eq(documentRequests.applicationId, id)).orderBy(desc(documentRequests.createdAt)),
    ]);
    const evidenceDocs = docRows.filter((doc) => doc.kind === "evidence");
    const openRequests = docRequestRows.filter((item) => item.request.status === "open").map(({ request }) => ({ id: request.id, title: request.title }));
    const complete = requested.status === "completed";
    return <>{head}<section className="ws-panel form-panel doc-step-panel">
      {requested.missing.length ? <div className="form-error" role="alert">برای تکمیل این مرحله: {requested.missing.join("، ")}</div> : <div className="form-success" role="status"><CheckCircle2 size={16} /> این مرحله کامل شده است{stepNumber < CASE_STEPS.length && <> — <Link href={`/cases/${id}/steps/${stepNumber + 1}`}>ادامه به مرحلهٔ بعدی ←</Link></>}</div>}
      <div className="form-section">
        <div className="form-section-head"><h2>تصویر پرسنلی</h2><p>الحاقیهٔ ۲.۹.۳: ارسال پرونده بدون تصویر پرسنلی ممکن نیست؛ تصویر باید PNG یا JPEG و حداکثر ۵۰۰ کیلوبایت باشد.</p></div>
        <div className="identity-photo-tools">
          {person.photoDocumentId ? <div className="profile-photo-box has-photo"><img src={`/api/documents/${person.photoDocumentId}`} alt="تصویر پرسنلی ثبت‌شده" width={76} height={76} /><div><strong>تصویر پرسنلی ثبت شده است</strong><p>برای تعویض، تصویر تازه بارگذاری کنید یا تصویر فعلی را حذف کنید.</p></div></div> : <div className="profile-photo-box missing" role="alert"><div><strong>تصویر پرسنلی هنوز بارگذاری نشده است</strong><p>ارسال پرونده بدون تصویر پرسنلی ممکن نیست.</p></div></div>}
          <PhotoUpload caseId={id} hasPhoto={Boolean(person.photoDocumentId)} />
          {person.photoDocumentId ? <PhotoRemove caseId={id} /> : null}
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-head"><h2>مدارک پشتیبان</h2><p>حداقل یک مدرک پشتیبان (تصویر کارت ملی، مدارک تحصیلی یا گواهی‌ها) بارگذاری کنید؛ هر مدرک می‌تواند به سوابق پرونده هم متصل شود.</p></div>
        {evidenceDocs.length ? <div className="document-list">{evidenceDocs.map((doc) => <div key={doc.id}><span className="file-icon"><FileText size={18} /></span><div><strong>{doc.title}</strong><small>{doc.docType && doc.docType in documentTypeLabels ? `${documentTypeLabels[doc.docType as keyof typeof documentTypeLabels]} · ` : ""}{doc.docNumber ? `شماره ${doc.docNumber} · ` : ""}{doc.originalName} · {faNumber(Math.ceil(doc.size / 1024))} کیلوبایت · {faDate(doc.createdAt, true)}</small></div><a href={`/api/documents/${doc.id}`}><Download size={16} /> دریافت</a></div>)}</div> : <div className="inline-empty">هنوز مدرکی بارگذاری نشده است.</div>}
        <DocumentUpload caseId={id} openRequests={openRequests} />
      </div>
      {complete && <div className="doc-step-next"><Link className="primary-button" href={`/cases/${id}/steps/${CASE_STEPS.length}`}><CheckCircle2 size={16} /> ادامه به بازبینی و ارسال</Link></div>}
    </section></>;
  }

  // مرحلهٔ آخر — بازبینی و ارسال
  const [provinceRow, countyRow, specTitles, evidenceRows] = await Promise.all([
    person.provinceId ? db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, person.provinceId)).limit(1) : Promise.resolve([]),
    person.countyId ? db.select({ name: counties.name }).from(counties).where(eq(counties.id, person.countyId)).limit(1) : Promise.resolve([]),
    db.select({ title: specialties.title }).from(activistSpecialties).innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id)).where(eq(activistSpecialties.activistId, person.id)),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, id), eq(documents.kind, "evidence"))),
  ]);
  const identityRows: Array<[string, string]> = [
    ["نام و نام خانوادگی", `${person.firstName} ${person.lastName}`],
    ["نام پدر", person.fatherName || "—"],
    ["کد ملی", person.nationalIdLast4 ? `••••••${person.nationalIdLast4}` : "—"],
    ["شماره شناسنامه", person.idCardNumber || "—"],
    ["تاریخ تولد", person.birthDate ? isoToJalali(person.birthDate).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : "—"],
    ["جنسیت", person.gender === "male" ? "مرد" : person.gender === "female" ? "زن" : "—"],
    ["شماره همراه", person.phone || "—"],
    ["شماره جایگزین", person.alternatePhone || "—"],
  ];
  const locationRows: Array<[string, string]> = [
    ["استان و شهرستان", [provinceRow[0]?.name, countyRow[0]?.name].filter(Boolean).join("، ") || "—"],
    ["شهر", person.city || "—"],
    ["نشانی", person.address || "—"],
    ["محل فعالیت", person.activityPlace || person.organization || "—"],
  ];
  return <>{head}<section className="ws-panel form-panel review-panel">
    {app.status === "ready" ? <div className="form-success" role="status"><CheckCircle2 size={16} /> اطلاعات کنترل شده و پرونده آماده ارسال است.</div> : requested.missing.length ? <div className="form-error" role="alert">موارد ناقص برای ارسال: {requested.missing.join("، ")}</div> : null}
    <div className="review-grid">
      <div className="review-block"><div className="review-block-head"><div><span>مرحلهٔ ۱</span><h3>اطلاعات هویتی و تماس</h3></div><Link className="secondary-button" href={`/cases/${id}/steps/1`}><Pencil size={14} /> ویرایش</Link></div>
        <dl>{identityRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
      <div className="review-block"><div className="review-block-head"><div><span>مرحلهٔ ۲</span><h3>سکونت و محل فعالیت</h3></div><Link className="secondary-button" href={`/cases/${id}/steps/2`}><Pencil size={14} /> ویرایش</Link></div>
        <dl>{locationRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-text">{value}</dd></div>)}</dl></div>
      <div className="review-block"><div className="review-block-head"><div><span>مرحلهٔ ۳</span><h3>تخصص‌ها، تحصیلات و سوابق</h3></div><Link className="secondary-button" href={`/cases/${id}/steps/3`}><Pencil size={14} /> ویرایش</Link></div>
        <dl>
          <div><dt>تخصص‌ها</dt><dd>{specTitles.length ? specTitles.map((item) => item.title).join("، ") : "—"}</dd></div>
          <div><dt>شغل</dt><dd>{person.job || "—"}</dd></div>
        </dl></div>
      <div className="review-block"><div className="review-block-head"><div><span>مرحلهٔ ۴</span><h3>مدارک و تصویر پرسنلی</h3></div><Link className="secondary-button" href={`/cases/${id}/steps/4`}><Pencil size={14} /> ویرایش</Link></div>
        <dl>
          <div><dt>تصویر پرسنلی</dt><dd>{person.photoDocumentId ? "بارگذاری شده" : "بارگذاری نشده"}</dd></div>
          <div><dt>مدارک پشتیبان</dt><dd>{fa.format(evidenceRows.length)} مدرک</dd></div>
        </dl></div>
    </div>
    <div className="review-actions">
      {app.status !== "ready" ? <form action={prepareCaseAction}><input type="hidden" name="caseId" value={id} /><button className="primary-button" disabled={requested.missing.length > 0}><ShieldCheck size={16} /> بررسی آمادگی ارسال</button></form> : <form action={submitCaseAction}><input type="hidden" name="caseId" value={id} /><ConfirmButton className="primary-button" name="submit" value="yes" confirmText="پرونده برای بررسی ارسال شود؟"><Send size={16} /> ارسال برای بررسی</ConfirmButton></form>}
      <p className="side-description">وضعیت فعلی پرونده: <strong>{statusLabels[app.status]}</strong>{app.status === "pending" ? " — پرونده ارسال شده و در انتظار بررسی است." : app.status === "ready" ? " — پس از ارسال، وضعیت به «در انتظار بررسی» تغییر می‌کند." : ""}</p>
    </div>
  </section></>;
}
