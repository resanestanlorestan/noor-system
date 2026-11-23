"use client";

// الحاقیهٔ ۲.۱۰.۰ — فرم‌های مرحله‌ای ویزارد ثبت اطلاعات.
// هر فرم فقط فیلدهای همان مرحله را به اکشن اختصاصی همان مرحله می‌فرستد؛
// سرور پس از ذخیرهٔ موفق به مرحلهٔ بعدی هدایت می‌کند و در خطا، همان مرحله
// با مقادیر حفظ‌شده نمایش داده می‌شود. الگوی کنترل‌شدهٔ فیلدها از فرم قبلی
// حفظ شده تا پس از هر پاسخ اکشن، مقادیر کاربر پاک نشود.

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { saveIdentityStepAction, saveLocationStepAction, saveSpecialtiesStepAction } from "@/app/actions/case-steps";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { isoToJalali } from "@/lib/format";
import { activityRecordKindLabels, cooperationTypeOptions, courseFieldOptions, educationLevelOptions, educationTypeLabels, hafizJuzOptions, memorizationCertTypeOptions, recitationLevelOptions, specialtyDetailSpec, UNIVERSITY_DEGREE_LEVELS, UNIVERSITY_FIELD_SUGGESTIONS, UNIVERSITY_TYPE_OPTIONS, writingTypeLabels, type EducationType } from "@/lib/constants";
import { JalaliDateInput } from "@/components/jalali-date-picker";
import { JuzPickerModal, juzPartsSummaryFa } from "@/components/juz-picker-modal";
import { SectionUpload, type DocSlot } from "@/components/doc-upload";
import { DynamicFieldsRenderer, type DynValues } from "@/components/dynamic-fields";
import { carryOverAnswers, type FormAnswers, type FormConfig } from "@/lib/form-config";
import { resolvedCaseField, type CaseFieldMetaMap } from "@/lib/case-field-catalog";

const faDigitsLocal = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

// الحاقیهٔ ۲.۱۹.۳ — پس از هدایت «بررسی آمادگی ارسال» (?check=1)، بخش‌های
// ناقص همان مرحله با کلاس section-flagged هایلایت می‌شوند تا کاربر بی‌درنگ
// محل دقیق ایراد را ببیند (فهرست کلیدها از readinessFlagSections سرور می‌آید).
const flagClass = (flagSections: string[] | undefined, key: string) => flagSections?.includes(key) ? " section-flagged" : "";

type Province = { id: number; name: string };
type County = { id: number; name: string; provinceId: number };
type Specialty = { id: number; title: string; code: string };
export type StepExistingEducation = { id: string; typeLabel: string; level: string; field: string | null; centerName: string | null; certificate: string | null };
export type StepExistingSpecialtyDetail = { specialtyId: number; code: string; detailValue: string | null; detailOptions: string[] | null; juzParts?: string | null };
export type StepExistingWriting = { id: string; workTypeLabel: string; title: string; topic: string | null };
export type StepExistingWorkHistory = { id: string; title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null };

type IdentityValues = { firstName: string; lastName: string; fatherName: string; nationalId: string; idCardNumber: string; idIssuePlace: string; birthDate: string; gender: string; phone: string; alternatePhone: string; contactEmail: string };
type LocationValues = { city: string; postalCode: string; address: string; activityPlace: string; organization: string };
type DetailState = { value: string; options: string[] };
type CourseRow = { title: string; provider: string; field: string; completedDate: string; hours: string };
type ActivityRow = { kind: string; field: string; title: string; organization: string; position: string; startDate: string; endDate: string; description: string };
const emptyCourseRow: CourseRow = { title: "", provider: "", field: "", completedDate: "", hours: "" };
const emptyActivityRow: ActivityRow = { kind: "", field: "", title: "", organization: "", position: "", startDate: "", endDate: "", description: "" };
export type StepExistingCourse = { id: string; title: string; provider: string | null; fieldLabel: string | null; completedDateLabel: string | null; hours: number | null };
export type StepExistingActivity = { id: string; kindLabel: string; title: string; organization: string | null; position: string | null; fieldLabel: string | null; periodLabel: string | null; description: string | null };
type WritingRow = { workType: string; title: string; topic: string };
type WorkRow = { title: string; employer: string; cooperationType: string; position: string; startDate: string; endDate: string; description: string };
const emptyWritingRow: WritingRow = { workType: "book", title: "", topic: "" };
const emptyWorkRow: WorkRow = { title: "", employer: "", cooperationType: "", position: "", startDate: "", endDate: "", description: "" };

/** After a Server Action response React resets uncontrolled fields; controlled
 *  selects are not re-rendered when their value prop is unchanged, so their
 *  wanted value travels on a data attribute and is reapplied to the DOM. */
function useSelectReset(formRef: React.RefObject<HTMLFormElement | null>, state: ActionState) {
  useEffect(() => {
    formRef.current?.querySelectorAll<HTMLSelectElement>("select[data-selected-value]").forEach((element) => { element.value = element.dataset.selectedValue || ""; });
  }, [state, formRef]);
}

function DuplicateWarning({ state, onAcknowledge, pending }: { state: ActionState; onAcknowledge: () => void; pending: boolean }) {
  const [dismissed, setDismissed] = useState<unknown>(null);
  if (!state.warning || dismissed === state) return null;
  return <div className="duplicate-warning" role="alert">
    <div className="duplicate-warning-head"><AlertTriangle size={19} /><div><strong>احتمال ثبت پرونده تکراری</strong><p>با معیارهای زیر پرونده‌هایی مشابه یافت شد. لطفاً فهرست را بررسی کنید؛ در صورت اطمینان از تکراری نبودن، ثبت را ادامه دهید.</p></div></div>
    <ul>{state.duplicates?.map((item) => <li key={item.caseId}><strong><Link href={`/cases/${item.caseId}`}>{item.name}</Link></strong><small>{item.reason}</small><small>{item.location || "بدون محدوده جغرافیایی"} · {item.status}</small></li>)}</ul>
    {state.globalIdDuplicate && <p className="duplicate-global">کد ملی واردشده در سامانه (خارج از محدوده دسترسی شما) قبلاً ثبت شده است؛ ثبت کد ملی تکراری توسط سامانه مسدود می‌شود.</p>}
    <div className="duplicate-warning-actions"><button type="button" className="secondary-button" onClick={() => setDismissed(state)}>بازگشت و بازبینی اطلاعات</button><button type="button" className="primary-button" onClick={onAcknowledge} disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} ثبت با آگاهی از احتمال تکرار</button></div>
  </div>;
}

function StepFooter({ pending, previousHref, submitLabel }: { pending: boolean; previousHref?: string; submitLabel: string }) {
  return <div className="form-actions">
    <div>{previousHref && <Link className="secondary-button" href={previousHref}>مرحلهٔ قبل</Link>}</div>
    <div><button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} {submitLabel}</button></div>
  </div>;
}

function ChangeReasonField({ required }: { required: boolean }) {
  if (!required) return null;
  return <div className="form-reason"><label>دلیل اصلاح اطلاعات<textarea name="changeReason" rows={2} maxLength={2000} placeholder="دلیل تغییر اطلاعات را بنویسید" /><small>برای کاربران سازمانی وارد کردن دلیل الزامی است؛ نسخه قبلی حفظ می‌شود.</small></label></div>;
}

/* --------------------------- مرحلهٔ ۱ — هویتی --------------------------- */

// الحاقیهٔ ۲.۲۶.۰ — عنوان، متن راهنما، الزام و نمایان‌بودن فیلدهای ثابت از
// meta (کاتالوگ + override مدیریت مراحل) می‌آید؛ فیلد مخفی رندر نمی‌شود و
// بدون meta همه‌چیز مطابق پیش‌فرض کاتالوگ است (رفتار ۲.۲۵.۰ حفظ می‌شود).
export function IdentityStepForm({ caseId, hasNationalId, defaults, sourceOptions, needsChangeReason, flagSections, meta }: { caseId?: string; hasNationalId?: boolean; defaults?: Partial<IdentityValues> & { universityLevel?: string; universityField?: string; universityType?: string; universityCenterName?: string; seminaryLevel?: string; universityDocName?: string; seminaryDocName?: string }; sourceOptions?: { value: string; label: string }[]; needsChangeReason?: boolean; flagSections?: string[]; meta?: CaseFieldMetaMap }) {
  const F = (key: string) => resolvedCaseField(meta, key);
  const nameReq = F("identity.fullName");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveIdentityStepAction, initialActionState);
  const [values, setValues] = useState<IdentityValues>(() => ({
    firstName: defaults?.firstName || "", lastName: defaults?.lastName || "", fatherName: defaults?.fatherName || "", nationalId: "",
    idCardNumber: defaults?.idCardNumber || "", idIssuePlace: defaults?.idIssuePlace || "", birthDate: defaults?.birthDate || "",
    gender: defaults?.gender || "", phone: defaults?.phone || "", alternatePhone: defaults?.alternatePhone || "", contactEmail: defaults?.contactEmail || "",
  }));
  // الحاقیهٔ ۲.۱۴.۱ — تحصیلات دانشگاهی و حوزوی در گام هویتی: مقطع کشویی + بارگذاری
  // مدرک در همان بخش (همان ستون‌ها و جداول قبلی؛ بدون فیلد تکراری)
  const [universityLevel, setUniversityLevel] = useState(defaults?.universityLevel || "");
  const [seminaryLevel, setSeminaryLevel] = useState(defaults?.seminaryLevel || "");
  const [universitySlot, setUniversitySlot] = useState<DocSlot[]>([]);
  const [seminarySlot, setSeminarySlot] = useState<DocSlot[]>([]);
  // الحاقیهٔ ۲.۱۹.۴ — رشته تحصیلی / نوع دانشگاه / نام دانشگاه برای مقاطع کاردانی تا
  // فوق دکتری؛ ترتیب نمایش: مقطع ← رشته ← نوع ← نام (نام فقط پس از انتخاب نوع).
  const [universityField, setUniversityField] = useState(defaults?.universityField || "");
  const [universityType, setUniversityType] = useState(defaults?.universityType || "");
  const [universityCenterName, setUniversityCenterName] = useState(defaults?.universityCenterName || "");
  const degreeLevel = (UNIVERSITY_DEGREE_LEVELS as readonly string[]).includes(universityLevel);
  const educationPayload = [
    universityLevel ? { type: "university", level: universityLevel, field: degreeLevel ? universityField : "", universityType: degreeLevel ? universityType : "", centerName: degreeLevel ? universityCenterName : "", certificate: "", docKey: universitySlot[0]?.key || "" } : null,
    seminaryLevel ? { type: "seminary", level: seminaryLevel, field: "", centerName: "", certificate: "", docKey: seminarySlot[0]?.key || "" } : null,
  ].filter(Boolean);
  const educationDocsPayload: Array<DocSlot & { section: string }> = [
    ...universitySlot.map((slot) => ({ ...slot, section: "university" })),
    ...seminarySlot.map((slot) => ({ ...slot, section: "seminary" })),
  ];
  const [source, setSource] = useState(sourceOptions?.[0]?.value ?? "");
  const [ack, setAck] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useSelectReset(formRef, state);
  const bind = (key: keyof IdentityValues) => ({ name: key, value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value })) });
  const acknowledge = () => { if (pending) return; setAck(true); requestAnimationFrame(() => formRef.current?.requestSubmit()); };
  return <form ref={formRef} action={action} className="profile-form wizard-step-form" noValidate>
    <input type="hidden" name="caseId" value={caseId || ""} /><input type="hidden" name="dupAck" value={ack ? "yes" : ""} />
    <input type="hidden" name="educationRecords" value={JSON.stringify(educationPayload)} />
    <input type="hidden" name="stagedDocs" value={JSON.stringify(educationDocsPayload)} />
    {state.error && <div className="form-error profile-error" role="alert">{state.error} {state.existingCaseId && <Link className="duplicate-link" href={`/cases/${state.existingCaseId}`}>مشاهده پرونده موجود ←</Link>}</div>}
    <DuplicateWarning state={state} onAcknowledge={acknowledge} pending={pending} />
    <section className={"form-section" + flagClass(flagSections, "identity-fields")} data-section="identity-fields">
      <div className="form-section-head"><h2>{F("identity.section.identity").label}</h2><p>فیلدهای ستاره‌دار (<i className="req-mark">*</i>) اجباری هستند؛ الزام و عنوان هر فیلد از تنظیمات مدیریت مراحل سامانه پیروی می‌کند. پس از ثبت موفق، مرحلهٔ بعدی خودکار باز می‌شود.</p></div>
      <div className="form-grid">
        {!F("identity.firstName").hidden && <label>{F("identity.firstName").label} {nameReq.required && <i>*</i>}<input required={nameReq.required} {...bind("firstName")} maxLength={80} placeholder="نام" /></label>}
        {!F("identity.lastName").hidden && <label>{F("identity.lastName").label} {nameReq.required && <i>*</i>}<input required={nameReq.required} {...bind("lastName")} maxLength={100} placeholder="نام خانوادگی" /></label>}
        {!F("identity.fatherName").hidden && <label>{F("identity.fatherName").label} {F("identity.fatherName").required && <i>*</i>}<input required={F("identity.fatherName").required} {...bind("fatherName")} maxLength={80} placeholder="نام پدر" /></label>}
        {!F("identity.nationalId").hidden && <label>{F("identity.nationalId").label} {F("identity.nationalId").required && <i>*</i>}<input required={F("identity.nationalId").required && !hasNationalId} {...bind("nationalId")} inputMode="numeric" maxLength={10} placeholder={hasNationalId ? "ثبت شده؛ برای تغییر وارد کنید" : "کد ملی ۱۰ رقمی"} />{F("identity.nationalId").help && <small>{F("identity.nationalId").help}</small>}</label>}
        {!F("identity.idCardNumber").hidden && <label>{F("identity.idCardNumber").label} {F("identity.idCardNumber").required && <i>*</i>}<input required={F("identity.idCardNumber").required} {...bind("idCardNumber")} inputMode="numeric" maxLength={10} placeholder="مثلاً ۱۲۳۴۵۶" />{F("identity.idCardNumber").help && <small>{F("identity.idCardNumber").help}</small>}</label>}
        {!F("identity.idIssuePlace").hidden && <label>{F("identity.idIssuePlace").label} {F("identity.idIssuePlace").required && <i>*</i>}<input required={F("identity.idIssuePlace").required} {...bind("idIssuePlace")} maxLength={80} placeholder="مثلاً تهران" /></label>}
        {!F("identity.birthDate").hidden && <label>{F("identity.birthDate").label} {F("identity.birthDate").required && <i>*</i>}<JalaliDateInput name="birthDate" required={F("identity.birthDate").required} ariaLabel={F("identity.birthDate").label} value={values.birthDate} onChange={(jalali) => setValues((current) => ({ ...current, birthDate: jalali }))} />{F("identity.birthDate").help && <small>{F("identity.birthDate").help}</small>}</label>}
        {!F("identity.gender").hidden && <label>{F("identity.gender").label} {F("identity.gender").required && <i>*</i>}<select name="gender" required={F("identity.gender").required} data-selected-value={values.gender} value={values.gender} onChange={(event) => setValues((current) => ({ ...current, gender: event.target.value }))}><option value="">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></label>}
        {!F("identity.phone").hidden && <label>{F("identity.phone").label} {F("identity.phone").required && <i>*</i>}<input required={F("identity.phone").required} {...bind("phone")} inputMode="tel" maxLength={11} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>}
        {!F("identity.alternatePhone").hidden && <label>{F("identity.alternatePhone").label} {F("identity.alternatePhone").required && <i>*</i>}<input required={F("identity.alternatePhone").required} {...bind("alternatePhone")} inputMode="tel" maxLength={11} placeholder="شماره همراه دوم" /></label>}
        {!F("identity.contactEmail").hidden && <label>{F("identity.contactEmail").label}{!F("identity.contactEmail").required ? " (اختیاری)" : ""} {F("identity.contactEmail").required && <i>*</i>}<input required={F("identity.contactEmail").required} {...bind("contactEmail")} type="email" dir="ltr" placeholder="example@email.com" /></label>}
        {sourceOptions && sourceOptions.length > 0 && <label>{F("identity.source").label}<select name="source" data-selected-value={source} value={source} onChange={(event) => setSource(event.target.value)}>{sourceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>در صورت ورود اطلاعات از فرم کاغذی، گزینه فرم کاغذی را انتخاب کنید.</small></label>}
      </div>
    </section>
    {/* الحاقیهٔ ۲.۱۴.۱ — تحصیلات دانشگاهی و حوزوی با بارگذاری مدرک در همان بخش
        الحاقیهٔ ۲.۱۴.۲ — دو کارت کنار هم (در نمایش باریک زیر هم می‌شوند) */}
    <section className="form-section">
      <div className="form-section-head"><h2>{F("identity.section.education").label}</h2><p>مقطع تحصیلی دانشگاهی (از بی‌سواد تا دکترا) و وضعیت تحصیلات حوزوی (سطح ۱ تا سطح ۴) را انتخاب کنید و در صورت داشتن مدرک، آن را در همان بخش بارگذاری کنید. هر دو بخش اختیاری‌اند و اگر مقطعی انتخاب نشود، اطلاعات قبلی پرونده دست‌نخورده می‌ماند.</p></div>
      <div className="form-grid education-cards">
        <div className="writings-block">
          <h3 className="form-subhead">{F("identity.section.university").label}</h3>
          <div className="memorizer-block">
            {!F("identity.universityLevel").hidden && <label>{F("identity.universityLevel").label}<select data-selected-value={universityLevel} value={universityLevel} onChange={(event) => setUniversityLevel(event.target.value)}><option value="">انتخاب کنید (اختیاری)</option>{educationLevelOptions.university.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>}
            {degreeLevel && !F("identity.universityField").hidden && <label>{F("identity.universityField").label}<input name="universityField" maxLength={120} placeholder="نام رشته تحصیلی" value={universityField} onChange={(event) => setUniversityField(event.target.value)} list="university-field-options" />{F("identity.universityField").help && <small>{F("identity.universityField").help}</small>}<datalist id="university-field-options">{UNIVERSITY_FIELD_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist></label>}
            {degreeLevel && !F("identity.universityType").hidden && <label>{F("identity.universityType").label}<select name="universityType" data-selected-value={universityType} value={universityType} onChange={(event) => { setUniversityType(event.target.value); if (!event.target.value) setUniversityCenterName(""); }}><option value="">انتخاب کنید (اختیاری)</option>{UNIVERSITY_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
            {degreeLevel && universityType && !F("identity.universityCenterName").hidden && <label>{F("identity.universityCenterName").label}<input name="universityCenterName" maxLength={180} placeholder="نام دقیق دانشگاه / واحد / مرکز" value={universityCenterName} onChange={(event) => setUniversityCenterName(event.target.value)} /></label>}
            <SectionUpload section="university" slots={universitySlot} onChange={setUniversitySlot} label={F("identity.universityDoc").label} />
            {defaults?.universityDocName && <small>مدرک ثبت‌شدهٔ فعلی: {defaults.universityDocName} — بارگذاری فایل تازه، مدرک این بخش را جایگزین می‌کند.</small>}
          </div>
        </div>
        <div className="writings-block">
          <h3 className="form-subhead">{F("identity.section.seminary").label}</h3>
          <div className="memorizer-block">
            {!F("identity.seminaryLevel").hidden && <label>{F("identity.seminaryLevel").label}<select data-selected-value={seminaryLevel} value={seminaryLevel} onChange={(event) => setSeminaryLevel(event.target.value)}><option value="">انتخاب کنید (اختیاری)</option>{educationLevelOptions.seminary.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>}
            <SectionUpload section="seminary" slots={seminarySlot} onChange={setSeminarySlot} label={F("identity.seminaryDoc").label} />
            {defaults?.seminaryDocName && <small>مدرک ثبت‌شدهٔ فعلی: {defaults.seminaryDocName} — بارگذاری فایل تازه، مدرک این بخش را جایگزین می‌کند.</small>}
          </div>
        </div>
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={caseId ? `/cases/${caseId}` : undefined} submitLabel={caseId ? "ذخیره و ادامه به مرحلهٔ بعد" : "ثبت هویت و شروع مرحلهٔ بعد"} />
  </form>;
}

/* ------------------------ مرحلهٔ ۲ — مکانی و فعالیت ------------------------ */

// الحاقیهٔ ۲.۲۶.۰ — فیلدهای ثابت مرحلهٔ ۲ از meta می‌آیند (عنوان/راهنما/الزام/مخفی)
export function LocationStepForm({ caseId, provinces, counties, activityProvinces, activityCounties, defaults, needsChangeReason, flagSections, meta }: { caseId: string; provinces: Province[]; counties: County[]; activityProvinces: Province[]; activityCounties: County[]; defaults: { provinceId: number | null; countyId: number | null; activityProvinceId: number | null; activityCountyId: number | null } & Partial<LocationValues>; needsChangeReason?: boolean; flagSections?: string[]; meta?: CaseFieldMetaMap }) {
  const F = (key: string) => resolvedCaseField(meta, key);
  const residenceReq = F("location.residence");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveLocationStepAction, initialActionState);
  const [provinceId, setProvinceId] = useState(String(defaults.provinceId || ""));
  const [countyId, setCountyId] = useState(String(defaults.countyId || ""));
  const [activityProvinceId, setActivityProvinceId] = useState(String(defaults.activityProvinceId || ""));
  const [activityCountyId, setActivityCountyId] = useState(String(defaults.activityCountyId || ""));
  const [values, setValues] = useState<LocationValues>(() => ({ city: defaults.city || "", postalCode: defaults.postalCode || "", address: defaults.address || "", activityPlace: defaults.activityPlace || "", organization: defaults.organization || "" }));
  const formRef = useRef<HTMLFormElement>(null);
  useSelectReset(formRef, state);
  const bind = (key: keyof LocationValues) => ({ name: key, value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [key]: event.target.value })) });
  return <form ref={formRef} action={action} className="profile-form wizard-step-form" noValidate>
    <input type="hidden" name="caseId" value={caseId} />
    {state.error && <div className="form-error profile-error" role="alert">{state.error}</div>}
    <section className="form-section">
      <div className="form-section-head"><h2>{F("location.section.residence").label} و {F("location.section.activity").label}</h2><p>{residenceReq.required ? "استان و شهرستان سکونت برای تکمیل این مرحله الزامی است" : "همهٔ فیلدهای این مرحله بر اساس تنظیمات مدیریت مراحل اختیاری شده‌اند"}؛ بقیهٔ فیلدها اختیاری‌اند و محل فعالیت قرآنی به‌صورت جداگانه ثبت می‌شود.</p></div>
      <div className={"residence-wrap" + flagClass(flagSections, "residence")} data-section="residence">
      <h3 className="form-subhead">{F("location.section.residence").label}</h3>
      <div className="form-grid">
        {!F("location.provinceId").hidden && <label>{F("location.provinceId").label} {residenceReq.required && <i>*</i>}<select name="provinceId" required={residenceReq.required} data-selected-value={provinceId} value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setCountyId(""); }}><option value="">انتخاب استان</option>{provinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {!F("location.countyId").hidden && <label>{F("location.countyId").label} {residenceReq.required && <i>*</i>}<select name="countyId" required={residenceReq.required} data-selected-value={countyId} value={countyId} onChange={(event) => setCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{counties.filter((item) => String(item.provinceId) === provinceId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{F("location.countyId").help && <small>{F("location.countyId").help}</small>}</label>}
        {!F("location.city").hidden && <label>{F("location.city").label}<input {...bind("city")} maxLength={120} placeholder="نام شهر" /></label>}
        {!F("location.postalCode").hidden && <label>{F("location.postalCode").label}<input {...bind("postalCode")} inputMode="numeric" maxLength={10} placeholder="کد پستی ۱۰ رقمی" /></label>}
        {!F("location.address").hidden && <label className="full-field">{F("location.address").label}<textarea {...bind("address")} maxLength={1000} rows={3} placeholder="نشانی محل سکونت" /></label>}
      </div>
      </div>
      <h3 className="form-subhead">{F("location.section.activity").label}</h3>
      <div className="form-grid">
        {!F("location.activityProvinceId").hidden && <label>{F("location.activityProvinceId").label}<select name="activityProvinceId" data-selected-value={activityProvinceId} value={activityProvinceId} onChange={(event) => { setActivityProvinceId(event.target.value); setActivityCountyId(""); }}><option value="">انتخاب استان</option>{activityProvinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {!F("location.activityCountyId").hidden && <label>{F("location.activityCountyId").label}<select name="activityCountyId" data-selected-value={activityCountyId} value={activityCountyId} onChange={(event) => setActivityCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{activityCounties.filter((item) => String(item.provinceId) === activityProvinceId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {!F("location.activityPlace").hidden && <label>{F("location.activityPlace").label}<input {...bind("activityPlace")} maxLength={180} placeholder="مثلاً مسجد، مؤسسه یا مرکز فرهنگی" /></label>}
        {!F("location.organization").hidden && <label>{F("location.organization").label}<input {...bind("organization")} maxLength={180} placeholder="نام مؤسسه یا سازمان" /></label>}
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={`/cases/${caseId}/steps/1`} submitLabel="ذخیره و ادامه به مرحلهٔ تخصص‌ها" />
  </form>;
}

/* ------------------- مرحلهٔ ۳ — تخصص‌ها و سوابق ------------------- */

// الحاقیهٔ ۲.۲۶.۰ — فیلدهای ثابت مرحلهٔ ۳ از meta می‌آیند (عنوان بخش‌ها، شغل، توضیحات تکمیلی)
export function SpecialtiesStepForm({ caseId, specialties, defaults, needsChangeReason, dynForms, flagSections, meta }: { caseId: string; specialties: Specialty[]; defaults: { specialtyIds: number[]; specialtyDetails: StepExistingSpecialtyDetail[]; writings: StepExistingWriting[]; workHistory: StepExistingWorkHistory[]; courses: StepExistingCourse[]; activities: StepExistingActivity[]; job?: string; notes?: string }; needsChangeReason?: boolean; dynForms?: Array<{ specialtyId: number; title: string; version: number; config: FormConfig; saved: FormAnswers }>; flagSections?: string[]; meta?: CaseFieldMetaMap }) {
  const F = (key: string) => resolvedCaseField(meta, key);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSpecialtiesStepAction, initialActionState);
  // الحاقیهٔ ۲.۲۳.۰ — پاسخ‌های فرم‌های پویا؛ پاسخ‌های ذخیره‌شدهٔ قبلی (حتی از
  // نسخهٔ قدیمی‌تر فرم) با carryOverAnswers پیش‌پر می‌شوند و بقیه خالی می‌مانند.
  const [dynValues, setDynValues] = useState<Record<number, DynValues>>(() => Object.fromEntries((dynForms || []).map((form) => [form.specialtyId, carryOverAnswers(form.config, form.saved)])));
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<number>>(() => new Set(defaults.specialtyIds));
  const [specialtyDetailState, setSpecialtyDetailState] = useState<Record<number, DetailState>>(() => {
    const map: Record<number, DetailState> = {};
    for (const item of defaults.specialtyDetails) map[item.specialtyId] = { value: item.detailValue || "", options: item.detailOptions || [] };
    return map;
  });
  // الحاقیهٔ ۲.۱۳.۰ — اجزای دقیق حفظ (از دادهٔ موجود برای ویرایش) + پنجرهٔ انتخاب
  const [juzParts, setJuzParts] = useState<Record<number, number[]>>(() => {
    const map: Record<number, number[]> = {};
    for (const item of defaults.specialtyDetails) {
      if (item.code === "memorizer" && item.juzParts) {
        const parsed = item.juzParts.split(",").map((token) => Number(token.trim())).filter((value) => Number.isSafeInteger(value) && value >= 1 && value <= 30);
        if (parsed.length) map[item.specialtyId] = parsed;
      }
    }
    return map;
  });
  const [juzModal, setJuzModal] = useState<{ id: number; count: number } | null>(null);
  const [writingRows, setWritingRows] = useState<WritingRow[]>([]);
  const [workRows, setWorkRows] = useState<WorkRow[]>([]);
  // الحاقیهٔ ۲.۱۴.۰ — انتقال کامل امکانات فرم قبلی ثبت‌نام به ویزارد:
  // دوره‌ها، سوابق فعالیت قرآنی، مدارک ردیفی، نوع مدرک حافظ و گواهی تخصص‌ها.
  const [courseRows, setCourseRows] = useState<CourseRow[]>([]);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [workSlots, setWorkSlots] = useState<Record<number, DocSlot[]>>({});
  const [courseSlots, setCourseSlots] = useState<Record<number, DocSlot[]>>({});
  const [memorizationCertType, setMemorizationCertType] = useState("");
  const [memorizationSlot, setMemorizationSlot] = useState<DocSlot[]>([]);
  const [certSlots, setCertSlots] = useState<Record<number, DocSlot[]>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useSelectReset(formRef, state);
  const toggleSpecialty = (id: number) => setSelectedSpecialties((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const detailFor = (id: number): DetailState => specialtyDetailState[id] || { value: "", options: [] };
  const setDetailValue = (id: number, value: string) => setSpecialtyDetailState((current) => ({ ...current, [id]: { ...detailFor(id), value } }));
  /* الحاقیهٔ ۲.۱۳.۰ — انتخاب تعاملی اجزای حفظ: بعد از اعلام تعداد، پنجرهٔ انتخاب باز می‌شود */
  const setJuzValue = (id: number, value: string) => {
    setDetailValue(id, value);
    if (!value) { setJuzParts((current) => ({ ...current, [id]: [] })); return; }
    if (value === "complete") {
      setJuzParts((current) => ({ ...current, [id]: Array.from({ length: 30 }, (_, index) => index + 1) }));
      return;
    }
    const count = Number(value);
    setJuzParts((current) => ({ ...current, [id]: (current[id] || []).slice(0, count) }));
    setJuzModal({ id, count });
  };
  const toggleDetailOption = (id: number, option: string) => setSpecialtyDetailState((current) => {
    const detail = detailFor(id); const options = new Set(detail.options);
    if (options.has(option)) options.delete(option); else options.add(option);
    return { ...current, [id]: { ...detail, options: [...options] } };
  });
  const addWritingRow = () => setWritingRows((current) => [...current, { ...emptyWritingRow }]);
  const updateWritingRow = (index: number, patch: Partial<WritingRow>) => setWritingRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeWritingRow = (index: number) => setWritingRows((current) => current.filter((_, i) => i !== index));
  const addWorkRow = () => setWorkRows((current) => [...current, { ...emptyWorkRow }]);
  const updateWorkRow = (index: number, patch: Partial<WorkRow>) => setWorkRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeWorkRow = (index: number) => setWorkRows((current) => current.filter((_, i) => i !== index));
  // الحاقیهٔ ۲.۱۴.۰ — ردیف‌های دوره و فعالیت قرآنی
  const addCourseRow = () => setCourseRows((current) => [...current, { ...emptyCourseRow }]);
  const updateCourseRow = (index: number, patch: Partial<CourseRow>) => setCourseRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeCourseRow = (index: number) => setCourseRows((current) => current.filter((_, i) => i !== index));
  const addActivityRow = () => setActivityRows((current) => [...current, { ...emptyActivityRow }]);
  const updateActivityRow = (index: number, patch: Partial<ActivityRow>) => setActivityRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeActivityRow = (index: number) => setActivityRows((current) => current.filter((_, i) => i !== index));
  const authorSpecialty = specialties.find((item) => item.code === "author");
  const authorSelected = Boolean(authorSpecialty && selectedSpecialties.has(authorSpecialty.id));
  const specialtyDetailsPayload = specialties
    .filter((item) => {
      const spec = specialtyDetailSpec[item.code];
      return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
    })
    .map((item): { code: string; value?: string; options?: string[]; juz?: string } | null => {
      const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
      if (spec.kind === "checklist") return detail.options.length ? { code: item.code, options: detail.options } : null;
      if (!detail.value) return null;
      // الحاقیهٔ ۲.۱۳.۰ — اجزای دقیق حفظ؛ دادهٔ قدیمی بدون اجزا بدون juz ارسال می‌شود
      if (spec.kind === "juz") {
        const parts = juzParts[item.id] || [];
        return { code: item.code, value: detail.value, ...(parts.length ? { juz: parts.join(",") } : {}) };
      }
      return { code: item.code, value: detail.value };
    })
    .filter((row) => row !== null);
  const writingsPayload = authorSelected ? writingRows.filter((row) => row.workType && row.title.trim().length >= 2) : [];
  // الحاقیهٔ ۲.۱۴.۰ — کلید مدرک هر ردیف از بارگذار درون‌بخشی به payload می‌آید
  const workHistoryPayload = workRows.map((row, index) => ({ ...row, docKey: workSlots[index]?.[0]?.key || "" })).filter((row) => row.title.trim().length >= 2);
  const coursesPayload = courseRows.map((row, index) => ({ ...row, docKey: courseSlots[index]?.[0]?.key || "" })).filter((row) => row.title.trim().length >= 2);
  const activitiesPayload = activityRows.filter((row) => row.title.trim().length >= 2 && row.kind);
  const specialtyCertKeysPayload = specialties
    .filter((item) => selectedSpecialties.has(item.id) && certSlots[item.id]?.[0])
    .map((item) => ({ code: item.code, key: certSlots[item.id][0].key }));
  const stagedDocsPayload: Array<DocSlot & { section: string }> = [
    ...Object.entries(workSlots).flatMap(([index, slots]) => slots.map((slot) => ({ ...slot, section: `work:${index}` }))),
    ...Object.entries(courseSlots).flatMap(([index, slots]) => slots.map((slot) => ({ ...slot, section: `course:${index}` }))),
    ...memorizationSlot.map((slot) => ({ ...slot, section: "memorization" })),
    ...specialties.filter((item) => selectedSpecialties.has(item.id)).flatMap((item) => (certSlots[item.id] || []).map((slot) => ({ ...slot, section: `specialty:${item.code}` }))),
  ];
  return <form ref={formRef} action={action} className="profile-form wizard-step-form" noValidate>
    <input type="hidden" name="caseId" value={caseId} />
    <input type="hidden" name="specialtyDetails" value={JSON.stringify(specialtyDetailsPayload)} />
    <input type="hidden" name="writings" value={JSON.stringify(writingsPayload)} />
    <input type="hidden" name="workHistory" value={JSON.stringify(workHistoryPayload)} />
    {/* الحاقیهٔ ۲.۱۴.۰ — بخش‌های منتقل‌شده از فرم قبلی ثبت‌نام */}
    <input type="hidden" name="courses" value={JSON.stringify(coursesPayload)} />
    <input type="hidden" name="activityRecords" value={JSON.stringify(activitiesPayload)} />
    <input type="hidden" name="stagedDocs" value={JSON.stringify(stagedDocsPayload)} />
    <input type="hidden" name="specialtyCertKeys" value={JSON.stringify(specialtyCertKeysPayload)} />
    <input type="hidden" name="memorizationCertType" value={memorizationCertType} />
    {state.error && <div className="form-error profile-error" role="alert">{state.error}</div>}
    <section className="form-section">
      <div className="form-section-head"><h2>{F("specialties.section.grid").label}</h2><p>{F("specialties.minOne").required ? "برای تکمیل این مرحله، انتخاب حداقل یک تخصص الزامی است و جزئیات هر تخصص دارای جزئیات (میزان حفظ، سطح قرائت یا نقش‌ها) باید کامل شود." : "انتخاب تخصص بر اساس تنظیمات مدیریت مراحل اختیاری شده است؛ جزئیات هر تخصص انتخاب‌شده باید کامل شود."}</p></div>
      <div className={"specialty-grid" + flagClass(flagSections, "specialty-grid")} data-section="specialty-grid">{specialties.map((item) => <label key={item.id}><input type="checkbox" name="specialties" value={item.id} checked={selectedSpecialties.has(item.id)} onChange={() => toggleSpecialty(item.id)} /><span>{item.title}</span></label>)}</div>
      <div className={"specialty-details-wrap" + flagClass(flagSections, "specialty-details")} data-section="specialty-details">
      {specialties.filter((item) => {
        const spec = specialtyDetailSpec[item.code];
        return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
      }).map((item) => {
        const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
        return <div className="specialty-detail" key={`detail-${item.id}`}>
          <div className="specialty-detail-head"><strong>{item.title}</strong><small>{spec.hint}</small></div>
          {(spec.kind === "juz" || spec.kind === "level") && <label className="specialty-detail-select"><span>{spec.kind === "juz" ? "میزان حفظ" : "سطح قرائت"}</span><select value={detail.value} onChange={(event) => (spec.kind === "juz" ? setJuzValue(item.id, event.target.value) : setDetailValue(item.id, event.target.value))}><option value="">انتخاب کنید</option>{Object.entries(spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          {/* الحاقیهٔ ۲.۱۳.۰ — خلاصهٔ اجزای منتخب + ویرایش */}
          {spec.kind === "juz" && detail.value && <div className="juz-parts-line">
            <span className="juz-parts-value">{juzParts[item.id]?.length ? `اجزای منتخب: ${juzPartsSummaryFa(juzParts[item.id])}` : "جزءها هنوز انتخاب نشده‌اند"}</span>
            <button type="button" onClick={() => setJuzModal({ id: item.id, count: detail.value === "complete" ? 30 : Number(detail.value) })}>{juzParts[item.id]?.length ? "ویرایش اجزا" : "انتخاب اجزا"}</button>
          </div>}
          {spec.kind === "checklist" && spec.options && <div className="check-list">{Object.entries(spec.options).map(([key, label]) => <label key={key} className={detail.options.includes(key) ? "checked" : ""}><input type="checkbox" checked={detail.options.includes(key)} onChange={() => toggleDetailOption(item.id, key)} /><span>{label}</span></label>)}</div>}
          {/* الحاقیهٔ ۲.۱۴.۰ — نوع مدرک حافظ + گواهی حفظ (انتقال از فرم قبلی ثبت‌نام) */}
          {item.code === "memorizer" && <div className="memorizer-block">
            <label>نوع مدرک حافظ<select value={memorizationCertType} onChange={(event) => setMemorizationCertType(event.target.value)}><option value="">انتخاب کنید (اختیاری)</option>{Object.entries(memorizationCertTypeOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <SectionUpload section="memorization" slots={memorizationSlot} onChange={setMemorizationSlot} label="بارگذاری گواهی یا مدرک حفظ" />
          </div>}
          {/* الحاقیهٔ ۲.۱۴.۰ — گواهی بارگذاری‌شدهٔ هر تخصص (certDocumentId) */}
          <SectionUpload section={`specialty:${item.code}`} slots={certSlots[item.id] || []} onChange={(next) => setCertSlots((current) => ({ ...current, [item.id]: next }))} label="بارگذاری گواهی تخصص" />
        </div>;
      })}
      {/* الحاقیهٔ ۲.۲۳.۰ — فرم پویای هر تخصص انتخاب‌شده؛ نمایش شرطی با همان موتور
          مشترک سرور اجرا می‌شود و پاسخ‌ها همراه ذخیرهٔ همین مرحله ثبت و ممیزی می‌شوند */}
      {(dynForms || []).filter((form) => selectedSpecialties.has(form.specialtyId)).map((form) => <div className="dyn-form-block" key={`dyn-${form.specialtyId}`}>
        <div className="specialty-detail-head"><strong>فرم اختصاصی تخصص: {form.title}</strong><small>فیلدها بر اساس انتخاب‌های شما باز و بسته می‌شوند؛ فیلدهای ستاره‌دار الزامی‌اند و پاسخ‌ها با «ذخیره و ادامه» ثبت می‌شود.</small></div>
        <DynamicFieldsRenderer config={form.config} applicationId={caseId} specialtyId={form.specialtyId} values={dynValues[form.specialtyId] || {}} onValueChange={(fieldKey, value) => setDynValues((current) => ({ ...current, [form.specialtyId]: { ...(current[form.specialtyId] || {}), [fieldKey]: value } }))} />
      </div>)}
      </div>
      {authorSpecialty && selectedSpecialties.has(authorSpecialty.id) && <div className="writings-block">
        <h3 className="form-subhead">{F("specialties.section.writings").label}</h3>
        {defaults.writings.length > 0 && <div className="education-existing"><ul>{defaults.writings.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.workTypeLabel, item.topic].filter(Boolean).join(" · ")}</small></li>)}</ul><small>حذف یا افزودن به این فهرست از صفحه جزئیات پرونده نیز امکان‌پذیر است؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {writingRows.length > 0 && <div className="education-rows">{writingRows.map((row, index) => <div className="education-row" key={index}><div className="writing-row-grid">
          <label>نوع اثر <i>*</i><select value={row.workType} onChange={(event) => updateWritingRow(index, { workType: event.target.value })}>{Object.entries(writingTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>نام کتاب / مقاله <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateWritingRow(index, { title: event.target.value })} placeholder="مثلاً نگاهی به فضایل قرآن" /></label>
          <label>موضوع<input value={row.topic} maxLength={180} onChange={(event) => updateWritingRow(index, { topic: event.target.value })} placeholder="مثلاً تفسیر موضوعی" /></label>
        </div><button type="button" className="row-remove" onClick={() => removeWritingRow(index)} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addWritingRow}><Plus size={16} /> افزودن اثر (کتاب / مقاله)</button>
      </div>}
      <div className="form-grid">
        {!F("specialties.job").hidden && <label>{F("specialties.job").label}<input name="job" defaultValue={defaults.job || ""} maxLength={120} placeholder="اختیاری؛ مثلاً دانشجو، معلم، کارمند" />{F("specialties.job").help && <small>{F("specialties.job").help}</small>}</label>}
        {!F("specialties.notes").hidden && <label className="full-field">{F("specialties.notes").label}<textarea name="notes" defaultValue={defaults.notes || ""} maxLength={4000} rows={3} placeholder="در صورت نیاز" /></label>}
      </div>
      <div className="writings-block">
        <h3 className="form-subhead">{F("specialties.section.workHistory").label}</h3>
        {defaults.workHistory.length > 0 && <div className="education-existing"><ul>{defaults.workHistory.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.employer, item.position, item.startDate ? "از " + faDigitsLocal(isoToJalali(item.startDate)) : "", item.endDate ? "تا " + faDigitsLocal(isoToJalali(item.endDate)) : ""].filter(Boolean).join(" · ") || "بدون جزئیات"}</small></li>)}</ul><small>ویرایش یا حذف این موارد از صفحه جزئیات پرونده انجام می‌شود؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {workRows.length > 0 && <div className="education-rows">{workRows.map((row, index) => <div className="education-row" key={index}><div className="writing-row-grid">
          <label>عنوان یا محل اشتغال <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateWorkRow(index, { title: event.target.value })} placeholder="مثلاً دبیری آموزش و پرورش" /></label>
          <label>نام سازمان یا مجموعه<input value={row.employer} maxLength={180} onChange={(event) => updateWorkRow(index, { employer: event.target.value })} placeholder="اختیاری" /></label>
          <label>نوع همکاری<select value={row.cooperationType} onChange={(event) => updateWorkRow(index, { cooperationType: event.target.value })}><option value="">انتخاب کنید (اختیاری)</option>{Object.entries(cooperationTypeOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>سمت<input value={row.position} maxLength={120} onChange={(event) => updateWorkRow(index, { position: event.target.value })} placeholder="اختیاری" /></label>
          <label>تاریخ شروع شمسی<JalaliDateInput ariaLabel="تاریخ شروع سابقهٔ شغلی" value={row.startDate} onChange={(jalali) => updateWorkRow(index, { startDate: jalali })} /></label>
          <label>تاریخ پایان شمسی (خالی = تاکنون)<JalaliDateInput ariaLabel="تاریخ پایان سابقهٔ شغلی" value={row.endDate} onChange={(jalali) => updateWorkRow(index, { endDate: jalali })} /></label>
          <label>توضیحات<input value={row.description} maxLength={2000} onChange={(event) => updateWorkRow(index, { description: event.target.value })} placeholder="اختیاری" /></label>
        </div>
          {/* الحاقیهٔ ۲.۱۴.۰ — بارگذاری مدرک همکاری همان ردیف */}
          <SectionUpload section={`work:${index}`} slots={workSlots[index] || []} onChange={(next) => setWorkSlots((current) => ({ ...current, [index]: next }))} label="بارگذاری مدرک سابقه همکاری" />
          <button type="button" className="row-remove" onClick={() => { removeWorkRow(index); setWorkSlots((current) => { const next = { ...current }; delete next[index]; return next; }); }} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addWorkRow}><Plus size={16} /> افزودن سابقه شغلی</button>
      </div>
      {/* الحاقیهٔ ۲.۱۴.۰ — دوره‌های گذرانده‌شده (انتقال از فرم قبلی ثبت‌نام) */}
      <div className="writings-block">
        <h3 className="form-subhead">{F("specialties.section.courses").label}</h3>
        {defaults.courses.length > 0 && <div className="education-existing"><ul>{defaults.courses.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.provider, item.fieldLabel, item.completedDateLabel, item.hours ? `${item.hours} ساعت` : ""].filter(Boolean).join(" · ") || "بدون جزئیات"}</small></li>)}</ul><small>ویرایش یا حذف این موارد از صفحه جزئیات پرونده انجام می‌شود؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {courseRows.length > 0 && <div className="education-rows">{courseRows.map((row, index) => <div className="education-row" key={index}><div className="work-row-grid">
          <label>نام دوره <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateCourseRow(index, { title: event.target.value })} placeholder="مثلاً دورهٔ روخوانی و روان‌خوانی" /></label>
          <label>برگزارکننده<input value={row.provider} maxLength={180} onChange={(event) => updateCourseRow(index, { provider: event.target.value })} placeholder="اختیاری" /></label>
          <label>رشتهٔ دوره<select value={row.field} onChange={(event) => updateCourseRow(index, { field: event.target.value })}><option value="">انتخاب کنید (اختیاری)</option>{Object.entries(courseFieldOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>تاریخ اخذ شمسی<JalaliDateInput ariaLabel="تاریخ اخذ دوره" value={row.completedDate} onChange={(jalali) => updateCourseRow(index, { completedDate: jalali })} /></label>
          <label>مدت (ساعت)<input value={row.hours} maxLength={4} inputMode="numeric" onChange={(event) => updateCourseRow(index, { hours: event.target.value.replace(/[^\d]/g, "") })} placeholder="مثلاً ۴۰" /></label>
        </div>
          <SectionUpload section={`course:${index}`} slots={courseSlots[index] || []} onChange={(next) => setCourseSlots((current) => ({ ...current, [index]: next }))} label="بارگذاری گواهی دوره" />
          <button type="button" className="row-remove" onClick={() => { removeCourseRow(index); setCourseSlots((current) => { const next = { ...current }; delete next[index]; return next; }); }} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addCourseRow}><Plus size={16} /> افزودن دوره</button>
      </div>
      {/* الحاقیهٔ ۲.۱۴.۰ — سوابق فعالیت قرآنی (انتقال از فرم قبلی ثبت‌نام) */}
      <div className="writings-block">
        <h3 className="form-subhead">{F("specialties.section.activities").label}</h3>
        {defaults.activities.length > 0 && <div className="education-existing"><ul>{defaults.activities.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.kindLabel, item.fieldLabel, item.organization, item.position, item.periodLabel].filter(Boolean).join(" · ") || "بدون جزئیات"}</small></li>)}</ul><small>ویرایش یا حذف این موارد از صفحه جزئیات پرونده انجام می‌شود؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {activityRows.length > 0 && <div className="education-rows">{activityRows.map((row, index) => <div className="education-row" key={index}><div className="work-row-grid">
          <label>نوع فعالیت <i>*</i><select value={row.kind} onChange={(event) => updateActivityRow(index, { kind: event.target.value, field: "" })}><option value="">انتخاب کنید</option>{Object.entries(activityRecordKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>رشتهٔ فعالیت<select value={row.field} disabled={!["teaching", "judging"].includes(row.kind)} onChange={(event) => updateActivityRow(index, { field: event.target.value })}><option value="">{["teaching", "judging"].includes(row.kind) ? "انتخاب کنید (اختیاری)" : "فقط برای تدریس و داوری"}</option>{["teaching", "judging"].includes(row.kind) && Object.entries(courseFieldOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>عنوان فعالیت <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateActivityRow(index, { title: event.target.value })} placeholder="مثلاً تدریس حفظ در مسجد جامع" /></label>
          <label>مجموعه / محل فعالیت<input value={row.organization} maxLength={180} onChange={(event) => updateActivityRow(index, { organization: event.target.value })} placeholder="اختیاری" /></label>
          <label>سمت<input value={row.position} maxLength={120} onChange={(event) => updateActivityRow(index, { position: event.target.value })} placeholder="اختیاری" /></label>
          <label>تاریخ شروع شمسی<JalaliDateInput ariaLabel="تاریخ شروع فعالیت" value={row.startDate} onChange={(jalali) => updateActivityRow(index, { startDate: jalali })} /></label>
          <label>تاریخ پایان شمسی (خالی = تاکنون)<JalaliDateInput ariaLabel="تاریخ پایان فعالیت" value={row.endDate} onChange={(jalali) => updateActivityRow(index, { endDate: jalali })} /></label>
          <label>توضیحات<input value={row.description} maxLength={2000} onChange={(event) => updateActivityRow(index, { description: event.target.value })} placeholder="اختیاری" /></label>
        </div><button type="button" className="row-remove" onClick={() => removeActivityRow(index)} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addActivityRow}><Plus size={16} /> افزودن سابقه فعالیت قرآنی</button>
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={`/cases/${caseId}/steps/2`} submitLabel="ذخیره و ادامه به مرحلهٔ مدارک" />
    {juzModal && <JuzPickerModal
      key={`${juzModal.id}:${juzModal.count}`}
      open
      count={juzModal.count}
      initial={juzParts[juzModal.id] || []}
      onConfirm={(parts) => { setJuzParts((current) => ({ ...current, [juzModal.id]: parts })); setJuzModal(null); }}
      onCancel={() => setJuzModal(null)}
    />}
  </form>;
}
