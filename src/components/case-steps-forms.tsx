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
import { educationLevelOptions, educationTypeLabels, hafizJuzOptions, recitationLevelOptions, specialtyDetailSpec, writingTypeLabels, type EducationType } from "@/lib/constants";

type Province = { id: number; name: string };
type County = { id: number; name: string; provinceId: number };
type Specialty = { id: number; title: string; code: string };
export type StepExistingEducation = { id: string; typeLabel: string; level: string; field: string | null; centerName: string | null; certificate: string | null };
export type StepExistingSpecialtyDetail = { specialtyId: number; code: string; detailValue: string | null; detailOptions: string[] | null };
export type StepExistingWriting = { id: string; workTypeLabel: string; title: string; topic: string | null };
export type StepExistingWorkHistory = { id: string; title: string; employer: string | null; position: string | null; startDate: string | null; endDate: string | null; description: string | null };

type IdentityValues = { firstName: string; lastName: string; fatherName: string; nationalId: string; idCardNumber: string; idIssuePlace: string; birthDate: string; gender: string; phone: string; alternatePhone: string; contactEmail: string };
type LocationValues = { city: string; postalCode: string; address: string; activityPlace: string; organization: string };
type DetailState = { value: string; options: string[] };
type EducationRow = { type: string; level: string; field: string; centerName: string; certificate: string };
type WritingRow = { workType: string; title: string; topic: string };
type WorkRow = { title: string; employer: string; position: string; startDate: string; endDate: string; description: string };
const emptyEducationRow: EducationRow = { type: "", level: "", field: "", centerName: "", certificate: "" };
const emptyWritingRow: WritingRow = { workType: "book", title: "", topic: "" };
const emptyWorkRow: WorkRow = { title: "", employer: "", position: "", startDate: "", endDate: "", description: "" };

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

export function IdentityStepForm({ caseId, hasNationalId, defaults, sourceOptions, needsChangeReason }: { caseId?: string; hasNationalId?: boolean; defaults?: Partial<IdentityValues>; sourceOptions?: { value: string; label: string }[]; needsChangeReason?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveIdentityStepAction, initialActionState);
  const [values, setValues] = useState<IdentityValues>(() => ({
    firstName: defaults?.firstName || "", lastName: defaults?.lastName || "", fatherName: defaults?.fatherName || "", nationalId: "",
    idCardNumber: defaults?.idCardNumber || "", idIssuePlace: defaults?.idIssuePlace || "", birthDate: defaults?.birthDate || "",
    gender: defaults?.gender || "", phone: defaults?.phone || "", alternatePhone: defaults?.alternatePhone || "", contactEmail: defaults?.contactEmail || "",
  }));
  const [source, setSource] = useState(sourceOptions?.[0]?.value ?? "");
  const [ack, setAck] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useSelectReset(formRef, state);
  const bind = (key: keyof IdentityValues) => ({ name: key, value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value })) });
  const acknowledge = () => { if (pending) return; setAck(true); requestAnimationFrame(() => formRef.current?.requestSubmit()); };
  return <form ref={formRef} action={action} className="profile-form wizard-step-form" noValidate>
    <input type="hidden" name="caseId" value={caseId || ""} /><input type="hidden" name="dupAck" value={ack ? "yes" : ""} />
    {state.error && <div className="form-error profile-error" role="alert">{state.error} {state.existingCaseId && <Link className="duplicate-link" href={`/cases/${state.existingCaseId}`}>مشاهده پرونده موجود ←</Link>}</div>}
    <DuplicateWarning state={state} onAcknowledge={acknowledge} pending={pending} />
    <section className="form-section">
      <div className="form-section-head"><h2>اطلاعات هویتی و تماس</h2><p>همه فیلدهای ستاره‌دار (<i className="req-mark">*</i>) اجباری هستند؛ فقط ایمیل اختیاری است. پس از ثبت موفق، مرحلهٔ بعدی خودکار باز می‌شود.</p></div>
      <div className="form-grid">
        <label>نام <i>*</i><input required {...bind("firstName")} maxLength={80} placeholder="نام" /></label>
        <label>نام خانوادگی <i>*</i><input required {...bind("lastName")} maxLength={100} placeholder="نام خانوادگی" /></label>
        <label>نام پدر <i>*</i><input required {...bind("fatherName")} maxLength={80} placeholder="نام پدر" /></label>
        <label>کد ملی <i>*</i><input required={!hasNationalId} {...bind("nationalId")} inputMode="numeric" maxLength={10} placeholder={hasNationalId ? "ثبت شده؛ برای تغییر وارد کنید" : "کد ملی ۱۰ رقمی"} /><small>کد ملی برای جست‌وجو محافظت و در فهرست‌ها پوشانده می‌شود.</small></label>
        <label>شماره شناسنامه <i>*</i><input required {...bind("idCardNumber")} inputMode="numeric" maxLength={10} placeholder="مثلاً ۱۲۳۴۵۶" /><small>شماره شناسنامه بدون صفرهای ابتدایی.</small></label>
        <label>محل صدور شناسنامه <i>*</i><input required {...bind("idIssuePlace")} maxLength={80} placeholder="مثلاً تهران" /></label>
        <label>تاریخ تولد شمسی <i>*</i><input required {...bind("birthDate")} placeholder="۱۳۷۵/۰۱/۰۱" inputMode="numeric" /><small>به صورت سال/ماه/روز شمسی وارد شود.</small></label>
        <label>جنسیت <i>*</i><select name="gender" required data-selected-value={values.gender} value={values.gender} onChange={(event) => setValues((current) => ({ ...current, gender: event.target.value }))}><option value="">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></label>
        <label>شماره همراه <i>*</i><input required {...bind("phone")} inputMode="tel" maxLength={11} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>
        <label>شماره همراه جایگزین <i>*</i><input required {...bind("alternatePhone")} inputMode="tel" maxLength={11} placeholder="شماره همراه دوم" /></label>
        <label>ایمیل تماس (اختیاری)<input {...bind("contactEmail")} type="email" dir="ltr" placeholder="example@email.com" /></label>
        {sourceOptions && sourceOptions.length > 0 && <label>منبع ثبت اطلاعات<select name="source" data-selected-value={source} value={source} onChange={(event) => setSource(event.target.value)}>{sourceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>در صورت ورود اطلاعات از فرم کاغذی، گزینه فرم کاغذی را انتخاب کنید.</small></label>}
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={caseId ? `/cases/${caseId}` : undefined} submitLabel={caseId ? "ذخیره و ادامه به مرحلهٔ بعد" : "ثبت هویت و شروع مرحلهٔ بعد"} />
  </form>;
}

/* ------------------------ مرحلهٔ ۲ — مکانی و فعالیت ------------------------ */

export function LocationStepForm({ caseId, provinces, counties, activityProvinces, activityCounties, defaults, needsChangeReason }: { caseId: string; provinces: Province[]; counties: County[]; activityProvinces: Province[]; activityCounties: County[]; defaults: { provinceId: number | null; countyId: number | null; activityProvinceId: number | null; activityCountyId: number | null } & Partial<LocationValues>; needsChangeReason?: boolean }) {
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
      <div className="form-section-head"><h2>سکونت و محل فعالیت قرآنی</h2><p>استان و شهرستان سکونت برای تکمیل این مرحله الزامی است؛ بقیهٔ فیلدها اختیاری‌اند و محل فعالیت قرآنی به‌صورت جداگانه ثبت می‌شود.</p></div>
      <h3 className="form-subhead">محل سکونت</h3>
      <div className="form-grid">
        <label>استان <i>*</i><select name="provinceId" required data-selected-value={provinceId} value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setCountyId(""); }}><option value="">انتخاب استان</option>{provinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>شهرستان <i>*</i><select name="countyId" required data-selected-value={countyId} value={countyId} onChange={(event) => setCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{counties.filter((item) => String(item.provinceId) === provinceId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><small>فهرست پیش‌فرض شامل شهرستان‌های مرکز استان است و توسط مدیر قابل تکمیل است.</small></label>
        <label>شهر / محل سکونت<input {...bind("city")} maxLength={120} placeholder="نام شهر" /></label>
        <label>کد پستی<input {...bind("postalCode")} inputMode="numeric" maxLength={10} placeholder="کد پستی ۱۰ رقمی" /></label>
        <label className="full-field">نشانی<textarea {...bind("address")} maxLength={1000} rows={3} placeholder="نشانی محل سکونت" /></label>
      </div>
      <h3 className="form-subhead">محل فعالیت قرآنی</h3>
      <div className="form-grid">
        <label>استان فعالیت<select name="activityProvinceId" data-selected-value={activityProvinceId} value={activityProvinceId} onChange={(event) => { setActivityProvinceId(event.target.value); setActivityCountyId(""); }}><option value="">انتخاب استان</option>{activityProvinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>شهرستان فعالیت<select name="activityCountyId" data-selected-value={activityCountyId} value={activityCountyId} onChange={(event) => setActivityCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{activityCounties.filter((item) => String(item.provinceId) === activityProvinceId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>محل فعالیت قرآنی<input {...bind("activityPlace")} maxLength={180} placeholder="مثلاً مسجد، مؤسسه یا مرکز فرهنگی" /></label>
        <label>مؤسسه قرآنی محل فعالیت<input {...bind("organization")} maxLength={180} placeholder="نام مؤسسه یا سازمان" /></label>
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={`/cases/${caseId}/steps/1`} submitLabel="ذخیره و ادامه به مرحلهٔ تخصص‌ها" />
  </form>;
}

/* ------------------- مرحلهٔ ۳ — تخصص‌ها و سوابق ------------------- */

export function SpecialtiesStepForm({ caseId, specialties, defaults, needsChangeReason }: { caseId: string; specialties: Specialty[]; defaults: { specialtyIds: number[]; specialtyDetails: StepExistingSpecialtyDetail[]; writings: StepExistingWriting[]; education: StepExistingEducation[]; workHistory: StepExistingWorkHistory[]; job?: string; notes?: string }; needsChangeReason?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSpecialtiesStepAction, initialActionState);
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<number>>(() => new Set(defaults.specialtyIds));
  const [specialtyDetailState, setSpecialtyDetailState] = useState<Record<number, DetailState>>(() => {
    const map: Record<number, DetailState> = {};
    for (const item of defaults.specialtyDetails) map[item.specialtyId] = { value: item.detailValue || "", options: item.detailOptions || [] };
    return map;
  });
  const [writingRows, setWritingRows] = useState<WritingRow[]>([]);
  const [educationRows, setEducationRows] = useState<EducationRow[]>([]);
  const [workRows, setWorkRows] = useState<WorkRow[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  useSelectReset(formRef, state);
  const toggleSpecialty = (id: number) => setSelectedSpecialties((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const detailFor = (id: number): DetailState => specialtyDetailState[id] || { value: "", options: [] };
  const setDetailValue = (id: number, value: string) => setSpecialtyDetailState((current) => ({ ...current, [id]: { ...detailFor(id), value } }));
  const toggleDetailOption = (id: number, option: string) => setSpecialtyDetailState((current) => {
    const detail = detailFor(id); const options = new Set(detail.options);
    if (options.has(option)) options.delete(option); else options.add(option);
    return { ...current, [id]: { ...detail, options: [...options] } };
  });
  const addWritingRow = () => setWritingRows((current) => [...current, { ...emptyWritingRow }]);
  const updateWritingRow = (index: number, patch: Partial<WritingRow>) => setWritingRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeWritingRow = (index: number) => setWritingRows((current) => current.filter((_, i) => i !== index));
  const updateEducationRow = (index: number, patch: Partial<EducationRow>) => setEducationRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addEducationRow = () => setEducationRows((current) => [...current, { ...emptyEducationRow }]);
  const removeEducationRow = (index: number) => setEducationRows((current) => current.filter((_, i) => i !== index));
  const addWorkRow = () => setWorkRows((current) => [...current, { ...emptyWorkRow }]);
  const updateWorkRow = (index: number, patch: Partial<WorkRow>) => setWorkRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeWorkRow = (index: number) => setWorkRows((current) => current.filter((_, i) => i !== index));
  // فقط ردیف‌های با انتخاب معتبر به سرور می‌روند (همان قاعدهٔ فرم قبلی).
  const educationPayload = educationRows.filter((row) => row.type && row.level);
  const authorSpecialty = specialties.find((item) => item.code === "author");
  const authorSelected = Boolean(authorSpecialty && selectedSpecialties.has(authorSpecialty.id));
  const specialtyDetailsPayload = specialties
    .filter((item) => {
      const spec = specialtyDetailSpec[item.code];
      return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
    })
    .map((item): { code: string; value?: string; options?: string[] } | null => {
      const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
      if (spec.kind === "checklist") return detail.options.length ? { code: item.code, options: detail.options } : null;
      return detail.value ? { code: item.code, value: detail.value } : null;
    })
    .filter((row) => row !== null);
  const writingsPayload = authorSelected ? writingRows.filter((row) => row.workType && row.title.trim().length >= 2) : [];
  const workHistoryPayload = workRows.filter((row) => row.title.trim().length >= 2);
  return <form ref={formRef} action={action} className="profile-form wizard-step-form" noValidate>
    <input type="hidden" name="caseId" value={caseId} />
    <input type="hidden" name="specialtyDetails" value={JSON.stringify(specialtyDetailsPayload)} />
    <input type="hidden" name="writings" value={JSON.stringify(writingsPayload)} />
    <input type="hidden" name="educationRecords" value={JSON.stringify(educationPayload)} />
    <input type="hidden" name="workHistory" value={JSON.stringify(workHistoryPayload)} />
    {state.error && <div className="form-error profile-error" role="alert">{state.error}</div>}
    <section className="form-section">
      <div className="form-section-head"><h2>تخصص‌های قرآنی</h2><p>برای تکمیل این مرحله، انتخاب حداقل یک تخصص الزامی است و جزئیات هر تخصص دارای جزئیات (میزان حفظ، سطح قرائت یا نقش‌ها) باید کامل شود.</p></div>
      <div className="specialty-grid">{specialties.map((item) => <label key={item.id}><input type="checkbox" name="specialties" value={item.id} checked={selectedSpecialties.has(item.id)} onChange={() => toggleSpecialty(item.id)} /><span>{item.title}</span></label>)}</div>
      {specialties.filter((item) => {
        const spec = specialtyDetailSpec[item.code];
        return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
      }).map((item) => {
        const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
        return <div className="specialty-detail" key={`detail-${item.id}`}>
          <div className="specialty-detail-head"><strong>{item.title}</strong><small>{spec.hint}</small></div>
          {(spec.kind === "juz" || spec.kind === "level") && <label className="specialty-detail-select"><span>{spec.kind === "juz" ? "میزان حفظ" : "سطح قرائت"}</span><select value={detail.value} onChange={(event) => setDetailValue(item.id, event.target.value)}><option value="">انتخاب کنید</option>{Object.entries(spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          {spec.kind === "checklist" && spec.options && <div className="check-list">{Object.entries(spec.options).map(([key, label]) => <label key={key} className={detail.options.includes(key) ? "checked" : ""}><input type="checkbox" checked={detail.options.includes(key)} onChange={() => toggleDetailOption(item.id, key)} /><span>{label}</span></label>)}</div>}
        </div>;
      })}
      {authorSpecialty && selectedSpecialties.has(authorSpecialty.id) && <div className="writings-block">
        {defaults.writings.length > 0 && <div className="education-existing"><h3 className="form-subhead">آثار ثبت‌شده این پرونده</h3><ul>{defaults.writings.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.workTypeLabel, item.topic].filter(Boolean).join(" · ")}</small></li>)}</ul><small>حذف یا افزودن به این فهرست از صفحه جزئیات پرونده نیز امکان‌پذیر است؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {writingRows.length > 0 && <div className="education-rows">{writingRows.map((row, index) => <div className="education-row" key={index}><div className="writing-row-grid">
          <label>نوع اثر <i>*</i><select value={row.workType} onChange={(event) => updateWritingRow(index, { workType: event.target.value })}>{Object.entries(writingTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>نام کتاب / مقاله <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateWritingRow(index, { title: event.target.value })} placeholder="مثلاً نگاهی به فضایل قرآن" /></label>
          <label>موضوع<input value={row.topic} maxLength={180} onChange={(event) => updateWritingRow(index, { topic: event.target.value })} placeholder="مثلاً تفسیر موضوعی" /></label>
        </div><button type="button" className="row-remove" onClick={() => removeWritingRow(index)} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addWritingRow}><Plus size={16} /> افزودن اثر (کتاب / مقاله)</button>
      </div>}
      <div className="form-grid">
        <label>شغل<input name="job" defaultValue={defaults.job || ""} maxLength={120} placeholder="اختیاری؛ مثلاً دانشجو، معلم، کارمند" /><small>فیلد مستقل از مؤسسه قرآنی محل فعالیت ثبت می‌شود.</small></label>
        <label className="full-field">توضیحات تکمیلی<textarea name="notes" defaultValue={defaults.notes || ""} maxLength={4000} rows={3} placeholder="در صورت نیاز" /></label>
      </div>
      <div className="writings-block">
        {defaults.education.length > 0 && <div className="education-existing"><h3 className="form-subhead">تحصیلات ثبت‌شده این پرونده</h3><ul>{defaults.education.map((item) => <li key={item.id}><strong>{item.typeLabel} · {item.level}</strong><small>{[item.field, item.centerName, item.certificate].filter(Boolean).join(" · ") || "بدون جزئیات"}</small></li>)}</ul><small>ویرایش یا حذف این موارد از صفحه جزئیات پرونده انجام می‌شود؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {educationRows.length > 0 && <div className="education-rows">{educationRows.map((row, index) => <div className="education-row" key={index}><div className="education-row-grid"><label>نوع تحصیل <i>*</i><select value={row.type} onChange={(event) => updateEducationRow(index, { type: event.target.value, level: "" })}><option value="">انتخاب کنید</option>{Object.entries(educationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>مقطع <i>*</i><select value={row.level} disabled={!row.type} onChange={(event) => updateEducationRow(index, { level: event.target.value })}><option value="">{row.type ? "انتخاب کنید" : "ابتدا نوع را انتخاب کنید"}</option>{(educationLevelOptions[row.type as EducationType] || []).map((level) => <option key={level} value={level}>{level}</option>)}</select></label><label>رشته<input value={row.field} maxLength={120} onChange={(event) => updateEducationRow(index, { field: event.target.value })} placeholder="مثلاً علوم قرآنی" /></label><label>نام مرکز<input value={row.centerName} maxLength={180} onChange={(event) => updateEducationRow(index, { centerName: event.target.value })} placeholder="نام دانشگاه یا حوزه" /></label><label>مدرک<input value={row.certificate} maxLength={180} onChange={(event) => updateEducationRow(index, { certificate: event.target.value })} placeholder="مثلاً گواهی پایان سطح ۲" /></label></div><button type="button" className="row-remove" onClick={() => removeEducationRow(index)} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addEducationRow}><Plus size={16} /> افزودن مدرک تحصیلی</button>
      </div>
      <div className="writings-block">
        {defaults.workHistory.length > 0 && <div className="education-existing"><h3 className="form-subhead">سوابق شغلی ثبت‌شده این پرونده</h3><ul>{defaults.workHistory.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{[item.employer, item.position, item.startDate ? "از " + item.startDate : "", item.endDate ? "تا " + item.endDate : ""].filter(Boolean).join(" · ") || "بدون جزئیات"}</small></li>)}</ul><small>ویرایش یا حذف این موارد از صفحه جزئیات پرونده انجام می‌شود؛ در این فرم فقط ردیف تازه افزوده می‌شود.</small></div>}
        {workRows.length > 0 && <div className="education-rows">{workRows.map((row, index) => <div className="education-row" key={index}><div className="writing-row-grid">
          <label>عنوان یا محل اشتغال <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateWorkRow(index, { title: event.target.value })} placeholder="مثلاً دبیری آموزش و پرورش" /></label>
          <label>کارفرما یا سازمان<input value={row.employer} maxLength={180} onChange={(event) => updateWorkRow(index, { employer: event.target.value })} placeholder="اختیاری" /></label>
          <label>سمت<input value={row.position} maxLength={120} onChange={(event) => updateWorkRow(index, { position: event.target.value })} placeholder="اختیاری" /></label>
          <label>تاریخ شروع شمسی<input value={row.startDate} maxLength={10} onChange={(event) => updateWorkRow(index, { startDate: event.target.value })} placeholder="۱۳۹۵/۰۱/۰۱" /></label>
          <label>تاریخ پایان شمسی<input value={row.endDate} maxLength={10} onChange={(event) => updateWorkRow(index, { endDate: event.target.value })} placeholder="خالی = تاکنون" /></label>
          <label>توضیحات<input value={row.description} maxLength={2000} onChange={(event) => updateWorkRow(index, { description: event.target.value })} placeholder="اختیاری" /></label>
        </div><button type="button" className="row-remove" onClick={() => removeWorkRow(index)} title="حذف این ردیف"><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={addWorkRow}><Plus size={16} /> افزودن سابقه شغلی</button>
      </div>
    </section>
    <ChangeReasonField required={Boolean(needsChangeReason)} />
    <StepFooter pending={pending} previousHref={`/cases/${caseId}/steps/2`} submitLabel="ذخیره و ادامه به مرحلهٔ مدارک" />
  </form>;
}
