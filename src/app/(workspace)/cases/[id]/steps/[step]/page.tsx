import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Download, FileText, Pencil, Send, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, activistWritings, activityRecords, correctionRequests, counties, documentRequests, documents, educationRecords, educationalCourses, formDefinitions, provinces, specialties, workHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { can } from "@/lib/permissions";
import { faDate, faNumber, isoToJalali } from "@/lib/format";
import { activityRecordKindLabels, courseFieldOptions, documentTypeLabels, educationTypeLabels, statusLabels, writingTypeLabels } from "@/lib/constants";
import { collectReadinessIssues, computeCaseSteps, loadCaseStepFacts, readinessFlagSections, DOC_REQUESTS_LABEL } from "@/lib/case-steps";
import { CaseStepsBar } from "@/components/case-progress";
import { IdentityStepForm, LocationStepForm, SpecialtiesStepForm } from "@/components/case-steps-forms";
import { CaseStepDynamicForm } from "@/components/case-step-form";
import { DynamicAnswersView } from "@/components/dynamic-fields";
import { OrganizationForm } from "@/components/management-forms";
import { ConfirmButton, DocumentUpload, PhotoRemove, PhotoUpload } from "@/components/case-controls";
import { ReadinessBanner } from "@/components/readiness-banner";
import { FlagFocus } from "@/components/flag-focus";
import { checkReadinessAction, submitCaseAction } from "@/app/actions/cases";
import { loadAnswersForCase } from "@/app/actions/forms";
import { type FormAnswers, type FormConfig } from "@/lib/form-config";

const faDigitsLocal = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

const EDITABLE_STATUSES = ["draft", "completing", "needs_correction"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];
const fa = new Intl.NumberFormat("fa-IR");

// الحاقیهٔ ۲.۱۰.۰ — صفحات مراحل ویزارد ثبت اطلاعات. ورود به هر مرحله در سرور
// کنترل می‌شود: مراحل قفل با ریدایرکت اجباری به مرحلهٔ جاری بسته می‌شوند؛
// تغییر دستی URL یا ورود مستقیم با لینک راهی به عبور از زنجیره ندارد.
export default async function CaseStepPage({ params, searchParams }: { params: Promise<{ id: string; step: string }>; searchParams: Promise<{ locked?: string; check?: string }> }) {
  const user = await requireUser();
  const { id, step: stepParam } = await params;
  const query = await searchParams;
  // الحاقیهٔ ۲.۱۹.۳ — ?check=1 یعنی رسیدن از «بررسی آمادگی ارسال»: بنر راهنما
  // رندر، بخش‌های ناقص هایلایت و با FlagFocus اسکرول نرم به اولین مورد انجام می‌شود.
  const checkMode = query.check === "1";
  const row = await getCaseForUser(user, id);
  if (!row) notFound();
  if (!EDITABLE_STATUSES.includes(row.application.status as EditableStatus) || !(await can(user, "cases.edit"))) redirect(`/cases/${id}`);
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const plan = computeCaseSteps(facts);
  const activeStep = plan.activeIndex + 1;
  const stepNumber = Number.parseInt(stepParam, 10);
  if (!stepNumber || stepNumber < 1 || stepNumber > plan.totalCount) redirect(`/cases/${id}/steps/${activeStep}`);
  const requested = plan.steps[stepNumber - 1];
  if (requested.status === "locked") redirect(`/cases/${id}/steps/${activeStep}?locked=1`);

  // الحاقیهٔ ۲.۲۵.۰ — فرم پویای هر مرحله: فیلدهای سفارشی مراحل پایه و کل محتوای
  // مراحل سفارشی، به‌همراه پاسخ‌های ذخیره‌شدهٔ همین پرونده (نسخه‌بندی‌شده).
  const stepDefIds = plan.steps.map((step) => step.definitionId).filter((value): value is number => Boolean(value));
  const stepDefRows = stepDefIds.length ? await db.select({ id: formDefinitions.id, entityId: formDefinitions.entityId, version: formDefinitions.version, publishedConfig: formDefinitions.publishedConfig }).from(formDefinitions).where(and(eq(formDefinitions.entityType, "case_step"), inArray(formDefinitions.entityId, stepDefIds), eq(formDefinitions.status, "published"))) : [];
  const stepAnswerRows = stepDefRows.length ? await loadAnswersForCase(id, stepDefRows.map((item) => item.id)) : new Map();
  const stepForms = new Map(stepDefRows.filter((item) => item.publishedConfig).map((item) => [item.entityId, { definitionId: item.id, config: item.publishedConfig as FormConfig, saved: (stepAnswerRows.get(item.id)?.answers || {}) as FormAnswers }]));
  /** فیلدهای تکمیلیِ سفارشی یک مرحلهٔ پایه (زیر فرم اصلی همان مرحله) */
  const extrasFor = (definitionId?: number) => {
    const form = definitionId ? stepForms.get(definitionId) : undefined;
    if (!form) return null;
    return <CaseStepDynamicForm caseId={id} definitionId={definitionId!} title={requested.title} config={form.config} saved={form.saved} complete={requested.missing.length === 0} variant="extra" />;
  };

  const { application: app, activist: person } = row;
  const nonActivistEditor = user.effectiveRole !== "activist";
  const head = <><div className="ws-breadcrumb"><Link href="/cases">پرونده‌ها</Link><span> / </span><Link href={`/cases/${id}`}>جزئیات پرونده</Link><span> / </span><b>مرحلهٔ {fa.format(stepNumber)}</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> ویزارد ثبت اطلاعات</div><h1>{requested.title}</h1><p>{stepNumber === plan.totalCount ? "بازبینی نهایی اطلاعات، کنترل آمادگی و ارسال برای بررسی." : `${requested.hint}؛ پس از ذخیرهٔ موفق، مرحلهٔ بعدی خودکار باز می‌شود.`}</p></div><Link href={`/cases/${id}`} className="secondary-button"><ArrowRight size={16} /> بازگشت به پرونده</Link></div>
    {query.locked === "1" && <div className="ws-notice" role="alert">ورود به مرحلهٔ قفل‌شده ممکن نیست؛ ابتدا مراحل قبل را کامل و ذخیره کنید. به مرحلهٔ جاری هدایت شدید.</div>}
    <CaseStepsBar steps={plan.steps} caseId={id} completedCount={plan.completedCount} totalCount={plan.totalCount} /></>;

  // الحاقیهٔ ۲.۲۵.۰ — مرحلهٔ سفارشی: کل محتوای مرحله، فرم پویای تعریف‌شده است
  if (requested.kind === "custom") {
    const form = stepForms.get(requested.definitionId || 0);
    return <>{head}{form
      ? <CaseStepDynamicForm caseId={id} definitionId={requested.definitionId!} title={requested.title} description={requested.hint} config={form.config} saved={form.saved} complete={requested.status === "completed"} />
      : <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>مرحلهٔ سفارشی</span><h2>{requested.title}</h2><p>برای این مرحله هنوز فیلدی منتشر نشده است؛ از بخش «مدیریت مراحل ثبت پرونده» فیلدها را تعریف و منتشر کنید. تا آن زمان این مرحله به‌صورت خودکار کامل محسوب می‌شود.</p></div><CheckCircle2 size={19} /></div>
        {stepNumber < plan.totalCount && <Link className="primary-button" href={`/cases/${id}/steps/${stepNumber + 1}`}>ادامه به مرحلهٔ بعدی ←</Link>}</section>}</>;
  }

  if (requested.key === "identity") {
    // الحاقیهٔ ۲.۱۴.۱ — مقطع و مدرک تحصیلات ثبت‌شده برای پیش‌پرکردن کارت‌های گام هویتی
    const eduRows = await db.select({ type: educationRecords.type, level: educationRecords.level, field: educationRecords.field, universityType: educationRecords.universityType, centerName: educationRecords.centerName, documentId: educationRecords.documentId }).from(educationRecords).where(eq(educationRecords.activistId, person.id));
    const eduDocIds = eduRows.map((item) => item.documentId).filter((value): value is string => Boolean(value));
    const eduDocs = eduDocIds.length ? await db.select({ id: documents.id, name: documents.originalName }).from(documents).where(inArray(documents.id, eduDocIds)) : [];
    const docName = (id: string | null) => id ? eduDocs.find((item) => item.id === id)?.name ?? null : null;
    const universityEdu = eduRows.find((item) => item.type === "university");
    const seminaryEdu = eduRows.find((item) => item.type === "seminary");
    return <>{head}<section className="ws-panel form-panel">{checkMode && <ReadinessBanner stepNumber={stepNumber} items={requested.missing} />}{checkMode && requested.missing.length ? <FlagFocus /> : null}<IdentityStepForm caseId={id} hasNationalId={Boolean(person.nationalIdHash)} needsChangeReason={nonActivistEditor} flagSections={checkMode ? readinessFlagSections(requested) : []} defaults={{ firstName: person.firstName, lastName: person.lastName, fatherName: person.fatherName || "", idCardNumber: person.idCardNumber || "", idIssuePlace: person.idIssuePlace || "", birthDate: isoToJalali(person.birthDate), gender: person.gender || "", phone: person.phone || "", alternatePhone: person.alternatePhone || "", contactEmail: person.email || "", universityLevel: universityEdu?.level || "", universityField: universityEdu?.field || "", universityType: universityEdu?.universityType || "", universityCenterName: universityEdu?.centerName || "", seminaryLevel: seminaryEdu?.level || "", universityDocName: docName(universityEdu?.documentId ?? null) ?? undefined, seminaryDocName: docName(seminaryEdu?.documentId ?? null) ?? undefined }} /></section>{extrasFor(requested.definitionId)}</>;
  }

  if (requested.key === "location") {
    const allProvinces = await db.select().from(provinces).orderBy(provinces.name);
    const allCounties = await db.select().from(counties).orderBy(counties.name);
    const limited = user.effectiveRole !== "super_admin" && user.effectiveRole !== "activist";
    // الحاقیهٔ ۲.۲۲.۰ — انتقال «افزودن سازمان جدید» از تنظیمات به همین مرحله؛
    // همان اکشن و همان گارد مجوز settings.references با فرم تنظیمات، با فهرست‌های
    // هم‌دامنهٔ همین مرحله؛ فهرست و حذف سازمان‌ها همچنان در /settings است.
    const canRefs = await can(user, "settings.references");
    const stepProvinces = limited ? allProvinces.filter((item) => item.id === user.provinceId) : allProvinces;
    const stepCounties = limited && user.countyId ? allCounties.filter((item) => item.id === user.countyId) : allCounties;
    return <>{head}<section className="ws-panel form-panel">{checkMode && <ReadinessBanner stepNumber={stepNumber} items={requested.missing} />}{checkMode && requested.missing.length ? <FlagFocus /> : null}<LocationStepForm caseId={id} provinces={stepProvinces} counties={stepCounties} activityProvinces={allProvinces} activityCounties={allCounties} needsChangeReason={nonActivistEditor} flagSections={checkMode ? readinessFlagSections(requested) : []} defaults={{ provinceId: person.provinceId, countyId: person.countyId, city: person.city || "", postalCode: person.postalCode || "", address: person.address || "", activityProvinceId: person.activityProvinceId, activityCountyId: person.activityCountyId, activityPlace: person.activityPlace || "", organization: person.organization || "" }} /></section>{canRefs && <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>فهرست سازمان‌ها</span><h2>افزودن سازمان جدید</h2><p>سازمان تازه در فهرست عمومی ذخیره می‌شود و برای «همکاری سازمانی» پرونده‌ها قابل انتخاب خواهد بود.</p></div></div><OrganizationForm provinces={stepProvinces} counties={stepCounties} /></section>}{extrasFor(requested.definitionId)}</>;
  }

  if (requested.key === "specialties") {
    const [allSpecialties, selected, detailRows, writingRows, workRows, courseRows, activityRows] = await Promise.all([
      db.select().from(specialties).orderBy(specialties.id),
      db.select({ id: activistSpecialties.specialtyId }).from(activistSpecialties).where(eq(activistSpecialties.activistId, person.id)),
      db.select({ specialtyId: activistSpecialtyDetails.specialtyId, code: specialties.code, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions, juzParts: activistSpecialtyDetails.juzParts }).from(activistSpecialtyDetails).innerJoin(specialties, eq(activistSpecialtyDetails.specialtyId, specialties.id)).where(eq(activistSpecialtyDetails.activistId, person.id)),
      db.select().from(activistWritings).where(eq(activistWritings.activistId, person.id)).orderBy(activistWritings.createdAt),
      db.select().from(workHistory).where(eq(workHistory.activistId, person.id)),
      // الحاقیهٔ ۲.۱۴.۰ — دوره‌ها و سوابق فعالیت ثبت‌شده برای نمایش در فهرست موجود
      db.select().from(educationalCourses).where(eq(educationalCourses.activistId, person.id)).orderBy(educationalCourses.createdAt),
      db.select().from(activityRecords).where(eq(activityRecords.activistId, person.id)).orderBy(activityRecords.createdAt),
    ]);
    // الحاقیهٔ ۲.۲۳.۰ — فرم‌های پویای منتشرشده برای تخصص‌های «انتخاب‌شدهٔ» این پرونده
    // به همراه پاسخ‌های ذخیره‌شده؛ فرم غیرفعال‌شده در ویرایش نمایش داده نمی‌شود ولی
    // پاسخ‌های تاریخی آن در جدول form_answers دست‌نخورده می‌مانند.
    const selectedIds = selected.map((item) => item.id);
    const dynDefRows = selectedIds.length ? await db.select({ id: formDefinitions.id, entityId: formDefinitions.entityId, version: formDefinitions.version, publishedConfig: formDefinitions.publishedConfig }).from(formDefinitions).where(and(eq(formDefinitions.entityType, "specialty"), inArray(formDefinitions.entityId, selectedIds), eq(formDefinitions.status, "published"))) : [];
    const dynAnswerRows = dynDefRows.length ? await loadAnswersForCase(id, dynDefRows.map((item) => item.id)) : new Map();
    const dynForms = dynDefRows.filter((item) => item.publishedConfig).map((item) => {
      const saved = dynAnswerRows.get(item.id);
      return { specialtyId: item.entityId, version: item.version, config: item.publishedConfig as FormConfig, saved: (saved?.answers || {}) as FormAnswers, title: allSpecialties.find((sp) => sp.id === item.entityId)?.title || "" };
    });
    return <>{head}<section className="ws-panel form-panel">{checkMode && <ReadinessBanner stepNumber={stepNumber} items={requested.missing} />}{checkMode && requested.missing.length ? <FlagFocus /> : null}<SpecialtiesStepForm caseId={id} specialties={allSpecialties} needsChangeReason={nonActivistEditor} dynForms={dynForms} flagSections={checkMode ? readinessFlagSections(requested) : []} defaults={{ specialtyIds: selected.map((item) => item.id), specialtyDetails: detailRows.map((item) => ({ specialtyId: item.specialtyId, code: item.code, detailValue: item.detailValue, detailOptions: item.detailOptions, juzParts: item.juzParts })), writings: writingRows.map((item) => ({ id: item.id, workTypeLabel: writingTypeLabels[item.workType], title: item.title, topic: item.topic })), workHistory: workRows.map((item) => ({ id: item.id, title: item.title, employer: item.employer, position: item.position, startDate: item.startDate, endDate: item.endDate, description: item.description })), courses: courseRows.map((item) => ({ id: item.id, title: item.title, provider: item.provider, fieldLabel: item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field as keyof typeof courseFieldOptions] : null, completedDateLabel: item.completedDate ? faDigitsLocal(isoToJalali(item.completedDate)) : null, hours: item.hours })), activities: activityRows.map((item) => ({ id: item.id, kindLabel: activityRecordKindLabels[item.kind], title: item.title, organization: item.organization, position: item.position, fieldLabel: item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field as keyof typeof courseFieldOptions] : null, periodLabel: [item.startDate ? "از " + faDigitsLocal(isoToJalali(item.startDate)) : "", item.endDate ? "تا " + faDigitsLocal(isoToJalali(item.endDate)) : ""].filter(Boolean).join(" ") || null, description: item.description })), job: person.job || "", notes: person.notes || "" }} /></section>{extrasFor(requested.definitionId)}</>;
  }

  if (requested.key === "documents") {
    const [docRows, docRequestRows] = await Promise.all([
      db.select().from(documents).where(eq(documents.applicationId, id)).orderBy(desc(documents.createdAt)),
      db.select({ request: documentRequests }).from(documentRequests).where(eq(documentRequests.applicationId, id)).orderBy(desc(documentRequests.createdAt)),
    ]);
    const evidenceDocs = docRows.filter((doc) => doc.kind === "evidence");
    const openRequests = docRequestRows.filter((item) => item.request.status === "open").map(({ request }) => ({ id: request.id, title: request.title }));
    const complete = requested.status === "completed";
    // الحاقیهٔ ۲.۱۹.۳ — بنر و پرچم بررسی آمادگی: درخواست‌های مدرک باز هم
    // به‌عنوان مورد ناقص این مرحله گزارش و بخش بارگذاری هایلایت می‌شود.
    const checkItems = [...requested.missing, ...(openRequests.length ? [DOC_REQUESTS_LABEL] : [])];
    const checkFlags = checkMode ? readinessFlagSections({ missing: checkItems }) : [];
    return <>{head}<section className="ws-panel form-panel doc-step-panel">
      {checkMode && <ReadinessBanner stepNumber={stepNumber} items={checkItems} />}
      {checkMode && checkItems.length ? <FlagFocus /> : null}
      {requested.missing.length ? <div className="form-error" role="alert">برای تکمیل این مرحله: {requested.missing.join("، ")}</div> : <div className="form-success" role="status"><CheckCircle2 size={16} /> این مرحله کامل شده است{stepNumber < plan.totalCount && <> — <Link href={`/cases/${id}/steps/${stepNumber + 1}`}>ادامه به مرحلهٔ بعدی ←</Link></>}</div>}
      <div className={"form-section" + (checkFlags.includes("sec-photo") ? " section-flagged" : "")} data-section="sec-photo">
        <div className="form-section-head"><h2>تصویر پرسنلی</h2><p>الحاقیهٔ ۲.۹.۳: ارسال پرونده بدون تصویر پرسنلی ممکن نیست؛ تصویر باید PNG یا JPEG و حداکثر ۵۰۰ کیلوبایت باشد.</p></div>
        <div className="identity-photo-tools">
          {person.photoDocumentId ? <div className="profile-photo-box has-photo"><img src={`/api/documents/${person.photoDocumentId}`} alt="تصویر پرسنلی ثبت‌شده" width={76} height={76} /><div><strong>تصویر پرسنلی ثبت شده است</strong><p>برای تعویض، تصویر تازه بارگذاری کنید یا تصویر فعلی را حذف کنید.</p></div></div> : <div className="profile-photo-box missing" role="alert"><div><strong>تصویر پرسنلی هنوز بارگذاری نشده است</strong><p>ارسال پرونده بدون تصویر پرسنلی ممکن نیست.</p></div></div>}
          <PhotoUpload caseId={id} hasPhoto={Boolean(person.photoDocumentId)} />
          {person.photoDocumentId ? <PhotoRemove caseId={id} /> : null}
        </div>
      </div>
      <div className={"form-section" + (checkFlags.includes("sec-evidence") ? " section-flagged" : "")} data-section="sec-evidence">
        <div className="form-section-head"><h2>مدارک پشتیبان</h2><p>حداقل یک مدرک پشتیبان (تصویر کارت ملی، مدارک تحصیلی یا گواهی‌ها) بارگذاری کنید؛ هر مدرک می‌تواند به سوابق پرونده هم متصل شود.</p></div>
        {evidenceDocs.length ? <div className="document-list">{evidenceDocs.map((doc) => <div key={doc.id}><span className="file-icon"><FileText size={18} /></span><div><strong>{doc.title}</strong><small>{doc.docType && doc.docType in documentTypeLabels ? `${documentTypeLabels[doc.docType as keyof typeof documentTypeLabels]} · ` : ""}{doc.docNumber ? `شماره ${doc.docNumber} · ` : ""}{doc.originalName} · {faNumber(Math.ceil(doc.size / 1024))} کیلوبایت · {faDate(doc.createdAt, true)}</small></div><a href={`/api/documents/${doc.id}`}><Download size={16} /> دریافت</a></div>)}</div> : <div className="inline-empty">هنوز مدرکی بارگذاری نشده است.</div>}
        <DocumentUpload caseId={id} openRequests={openRequests} />
      </div>
      {complete && <div className="doc-step-next"><Link className="primary-button" href={`/cases/${id}/steps/${plan.totalCount}`}><CheckCircle2 size={16} /> ادامه به بازبینی و ارسال</Link></div>}
    </section>{extrasFor(requested.definitionId)}</>;
  }

  // مرحلهٔ آخر — بازبینی و ارسال
  const [provinceRow, countyRow, specTitles, evidenceRows, correctionRows, docRequestRows] = await Promise.all([
    person.provinceId ? db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, person.provinceId)).limit(1) : Promise.resolve([]),
    person.countyId ? db.select({ name: counties.name }).from(counties).where(eq(counties.id, person.countyId)).limit(1) : Promise.resolve([]),
    db.select({ title: specialties.title }).from(activistSpecialties).innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id)).where(eq(activistSpecialties.activistId, person.id)),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, id), eq(documents.kind, "evidence"))),
    db.select({ status: correctionRequests.status }).from(correctionRequests).where(eq(correctionRequests.applicationId, id)),
    db.select({ status: documentRequests.status }).from(documentRequests).where(eq(documentRequests.applicationId, id)),
  ]);
  // الحاقیهٔ ۲.۱۹.۳ — گزارش ساخت‌یافتهٔ آمادگی: هر مورد ناقص زیر مرحلهٔ خودش،
  // با پرش مستقیم به همان مرحله؛ کاربر برای یافتن ایرادها مراحل را دستی
  // مرور نمی‌کند. گاردهای باز (اصلاح/مدارک درخواستی) همان‌هایی هستند که
  // advanceCase در تراکنش کنترل می‌کند.
  const readinessIssues = collectReadinessIssues(facts, {
    openCorrection: correctionRows.some((item) => item.status === "open"),
    openDocRequests: docRequestRows.filter((item) => item.status === "open").length,
  });
  const readinessTotal = readinessIssues.reduce((total, issue) => total + issue.items.length, 0);
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
    {app.status === "ready" ? <div className="form-success" role="status"><CheckCircle2 size={16} /> اطلاعات کنترل شده و پرونده آماده ارسال است.</div>
      : readinessIssues.length ? <div className="readiness-summary" role="alert">
        <strong><ShieldCheck size={15} /> بررسی هوشمند آمادگی — {fa.format(readinessTotal)} مورد نیازمند اصلاح در {fa.format(readinessIssues.length)} مرحله</strong>
        <ul>{readinessIssues.map((issue) => <li key={issue.step}>
          <span className="readiness-issue-step">مرحلهٔ {fa.format(issue.step)} · {issue.stepTitle}</span>
          <em>{issue.items.map((item) => item.label).join("، ")}</em>
          <Link className="secondary-button" href={issue.step < plan.totalCount ? `/cases/${id}/steps/${issue.step}?check=1` : `/cases/${id}`}>{issue.step < plan.totalCount ? "رفتن به مرحله و اصلاح ←" : "رفتن به پرونده ←"}</Link>
        </li>)}</ul>
        <small>نیازی به مرور دستی مراحل نیست؛ با هر کلیک روی «بررسی آمادگی ارسال» همهٔ مراحل از دادهٔ واقعی کنترل می‌شوند و به اولین مرحلهٔ مشکل‌دار هدایت می‌شوید. پس از اصلاح و ذخیرهٔ هر مرحله، دوباره همین دکمه را بزنید.</small>
      </div>
      : <div className="form-success" role="status"><CheckCircle2 size={16} /> همهٔ مراحل تکمیل است؛ با زدن «بررسی آمادگی ارسال» کنترل نهایی انجام و پرونده آمادهٔ ارسال می‌شود.</div>}
    <div className="review-grid">
      {/* الحاقیهٔ ۲.۲۵.۰ — بلوک‌های بازبینی از ترتیب فعال مراحل ساخته می‌شوند:
          مراحل پایه خلاصهٔ خودشان را دارند و مراحل سفارشی پاسخ‌های ذخیره‌شده را. */}
      {plan.steps.filter((step) => step.key !== "review").map((step) => {
        const form = step.definitionId ? stepForms.get(step.definitionId) : undefined;
        const block = step.key === "identity" ? <dl>{identityRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          : step.key === "location" ? <dl>{locationRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-text">{value}</dd></div>)}</dl>
            : step.key === "specialties" ? <dl>
              <div><dt>تخصص‌ها</dt><dd>{specTitles.length ? specTitles.map((item) => item.title).join("، ") : "—"}</dd></div>
              <div><dt>شغل</dt><dd>{person.job || "—"}</dd></div>
            </dl>
              : step.key === "documents" ? <dl>
                <div><dt>تصویر پرسنلی</dt><dd>{person.photoDocumentId ? "بارگذاری شده" : "بارگذاری نشده"}</dd></div>
                <div><dt>مدارک پشتیبان</dt><dd>{fa.format(evidenceRows.length)} مدرک</dd></div>
              </dl>
                : form ? <DynamicAnswersView config={form.config} answers={form.saved} />
                  : <p className="inline-empty">برای این مرحله پاسخی ثبت نشده است.</p>;
        return <div className="review-block" key={step.key}><div className="review-block-head"><div><span>مرحلهٔ {fa.format(step.index + 1)}{step.kind === "custom" ? " · سفارشی" : ""}</span><h3>{step.title}</h3></div><Link className="secondary-button" href={`/cases/${id}/steps/${step.index + 1}`}><Pencil size={14} /> ویرایش</Link></div>
          {block}</div>;
      })}
    </div>
    <div className="review-actions">
      {app.status !== "ready" ? <form action={checkReadinessAction}><input type="hidden" name="caseId" value={id} /><button className="primary-button"><ShieldCheck size={16} /> بررسی آمادگی ارسال</button></form> : <form action={submitCaseAction}><input type="hidden" name="caseId" value={id} /><ConfirmButton className="primary-button" name="submit" value="yes" confirmText="پرونده برای بررسی ارسال شود؟"><Send size={16} /> ارسال برای بررسی</ConfirmButton></form>}
      <p className="side-description">وضعیت فعلی پرونده: <strong>{statusLabels[app.status]}</strong>{app.status === "pending" ? " — پرونده ارسال شده و در انتظار بررسی است." : app.status === "ready" ? " — پس از ارسال، وضعیت به «در انتظار بررسی» تغییر می‌کند." : ""}</p>
    </div>
  </section></>;
}
