"use client";

// الحاقیهٔ ۲.۱۲.۰ — فرم ثبت‌نام یک‌مرحله‌ای فعال قرآنی.
// همهٔ اطلاعات هویتی، سکونت، تحصیلات (دانشگاهی/حوزوی)، حافظ قرآن، تخصص‌ها با
// جزئیات، سوابق شغلی و همکاری، دوره‌ها و سوابق فعالیت قرآنی در همین فرم ثبت و
// تمام مدارک در «همان بخش مربوط» بارگذاری می‌شوند؛ با «ثبت نهایی» حساب و
// پروندهٔ کامل با وضعیت «در انتظار بررسی» ساخته می‌شود و مرحلهٔ دومِ بارگذاری
// مدارک پس از ورود، برای ثبت‌نام عمومی حذف شده است.
// الگوی کنترل‌شدهٔ فیلدها و ظاهر، از فرم‌های مرحله‌ای ویزارد گرفته شده است.

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { registerCaseAction } from "@/app/actions/register-case";
import { initialActionState } from "@/lib/action-state";
import { JalaliDateInput } from "@/components/jalali-date-picker";
import { JuzPickerModal, juzPartsSummaryFa } from "@/components/juz-picker-modal";
import {
  activityRecordKindLabels, courseFieldOptions, cooperationTypeOptions,
  educationLevelOptions, educationTypeLabels, hafizJuzOptions, memorizationCertTypeOptions,
  recitationLevelOptions, specialtyDetailSpec, writingTypeLabels, type WritingType,
} from "@/lib/constants";

type Province = { id: number; name: string };
type County = { id: number; name: string; provinceId: number };
type Specialty = { id: number; title: string; code: string };
type DocSlot = { key: string; name: string; mime: string; size: number };
type DetailState = { value: string; options: string[] };
type WritingRow = { workType: string; title: string; topic: string };
type EducationCard = { level: string; field: string; centerName: string; certificate: string };
type WorkRow = { title: string; employer: string; cooperationType: string; position: string; startDate: string; endDate: string; description: string };
type CourseRow = { title: string; provider: string; field: string; completedDate: string; hours: string };
type ActivityRow = { kind: string; field: string; title: string; organization: string; position: string; startDate: string; endDate: string; description: string };

const emptyEducationCard: EducationCard = { level: "", field: "", centerName: "", certificate: "" };
const emptyWorkRow: WorkRow = { title: "", employer: "", cooperationType: "", position: "", startDate: "", endDate: "", description: "" };
const emptyCourseRow: CourseRow = { title: "", provider: "", field: "", completedDate: "", hours: "" };
const emptyActivityRow: ActivityRow = { kind: "", field: "", title: "", organization: "", position: "", startDate: "", endDate: "", description: "" };

/** بارگذاری یک فایل به بخش مشخص و بازگشت شناسهٔ فایل ذخیره‌شده روی سرور. */
async function uploadOne(file: File, section: string): Promise<DocSlot> {
  const body = new FormData();
  body.set("file", file);
  body.set("section", section);
  const response = await fetch("/api/register/upload", { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(String(payload?.error || "بارگذاری فایل انجام نشد."));
  return { key: payload.key, name: payload.name, mime: payload.mime, size: payload.size };
}

/** بخش بارگذاری مدرک داخل همان بخش اطلاعات؛ یک یا چند فایل PDF/تصویر. */
function SectionUpload({ section, slots, onChange, label, hint, multiple = false, maxBytes }: {
  section: string;
  slots: DocSlot[];
  onChange: (next: DocSlot[]) => void;
  label: string;
  hint?: string;
  multiple?: boolean;
  maxBytes?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      const next: DocSlot[] = [...slots];
      for (const file of Array.from(files).slice(0, multiple ? 5 : 1)) {
        if (maxBytes && file.size > maxBytes) throw new Error("حجم فایل بیش از حد مجاز است.");
        next.push(await uploadOne(file, section));
        if (!multiple) break;
      }
      onChange(next);
    } catch (cause) { setError(String((cause as Error).message || "بارگذاری انجام نشد.")); }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  return <div className="upload-block">
    <div className="upload-block-head">
      <label className="upload-pick">{busy ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />} {label}
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple={multiple} className="upload-input" onChange={(event) => handleFiles(event.target.files)} />
      </label>
      <small>{hint || "PDF یا تصویر؛ حداکثر ۵ مگابایت"}</small>
    </div>
    {error && <small className="upload-error">{error}</small>}
    {slots.length > 0 && <div className="upload-list">{slots.map((slot) => <span key={slot.key} className="upload-chip"><FileUp size={12} /> {slot.name}<button type="button" className="upload-remove" onClick={() => onChange(slots.filter((item) => item.key !== slot.key))} aria-label="حذف فایل"><X size={12} /></button></span>)}</div>}
  </div>;
}

export function RegisterCaseForm({ provinces, counties, specialties }: { provinces: Province[]; counties: County[]; specialties: Specialty[] }) {
  const [state, action, pending] = useActionState(registerCaseAction, initialActionState);
  const [values, setValues] = useState({ firstName: "", lastName: "", mobile: "", email: "", password: "", confirmation: "", fatherName: "", nationalId: "", idCardNumber: "", idIssuePlace: "", gender: "", alternatePhone: "", contactEmail: "", city: "", postalCode: "", address: "", activityPlace: "", organization: "", job: "", notes: "" });
  const [provinceId, setProvinceId] = useState("");
  const [countyId, setCountyId] = useState("");
  const [activityProvinceId, setActivityProvinceId] = useState("");
  const [activityCountyId, setActivityCountyId] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<number>>(new Set());
  const [detailState, setDetailState] = useState<Record<number, DetailState>>({});
  // الحاقیهٔ ۲.۱۳.۰ — اجزای دقیق حفظ (به تفکیک تخصص «حافظ») + پنجرهٔ انتخاب
  const [juzParts, setJuzParts] = useState<Record<number, number[]>>({});
  const [juzModal, setJuzModal] = useState<{ id: number; count: number } | null>(null);
  const [memorizationCertType, setMemorizationCertType] = useState("");
  const [certSlots, setCertSlots] = useState<Record<number, DocSlot[]>>({}); // گواهی تخصص per specialty id
  const [education, setEducation] = useState<{ university: EducationCard; seminary: EducationCard }>({ university: { ...emptyEducationCard }, seminary: { ...emptyEducationCard } });
  const [eduSlots, setEduSlots] = useState<{ university: DocSlot[]; seminary: DocSlot[] }>({ university: [], seminary: [] });
  const [writingRows, setWritingRows] = useState<WritingRow[]>([]);
  const [workRows, setWorkRows] = useState<WorkRow[]>([]);
  const [workSlots, setWorkSlots] = useState<Record<number, DocSlot[]>>({});
  const [courseRows, setCourseRows] = useState<CourseRow[]>([]);
  const [courseSlots, setCourseSlots] = useState<Record<number, DocSlot[]>>({});
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [photoSlot, setPhotoSlot] = useState<DocSlot[]>([]);
  const [memorizationSlot, setMemorizationSlot] = useState<DocSlot[]>([]);
  const [evidenceSlots, setEvidenceSlots] = useState<DocSlot[]>([]);

  const bind = (key: keyof typeof values) => ({ name: key, value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [key]: event.target.value })) });
  const detailFor = (id: number): DetailState => detailState[id] || { value: "", options: [] };
  const setDetailValue = (id: number, value: string) => setDetailState((current) => ({ ...current, [id]: { ...detailFor(id), value } }));
  const toggleDetailOption = (id: number, option: string) => setDetailState((current) => {
    const detail = detailFor(id); const options = new Set(detail.options);
    if (options.has(option)) options.delete(option); else options.add(option);
    return { ...current, [id]: { ...detail, options: [...options] } };
  });
  const toggleSpecialty = (id: number) => setSelectedSpecialties((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const updateWorkRow = (index: number, patch: Partial<WorkRow>) => setWorkRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateCourseRow = (index: number, patch: Partial<CourseRow>) => setCourseRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateActivityRow = (index: number, patch: Partial<ActivityRow>) => setActivityRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const authorSpecialty = specialties.find((item) => item.code === "author");

  /* --------- الحاقیهٔ ۲.۱۳.۰ — انتخاب تعاملی اجزای حفظ قرآن --------- */
  const setJuzValue = (id: number, value: string) => {
    setDetailValue(id, value);
    if (!value) { setJuzParts((current) => ({ ...current, [id]: [] })); return; }
    if (value === "complete") {
      // «حفظ کل قرآن»: هر ۳۰ جزء خودکار انتخاب می‌شود
      setJuzParts((current) => ({ ...current, [id]: Array.from({ length: 30 }, (_, index) => index + 1) }));
      return;
    }
    const count = Number(value);
    setJuzParts((current) => ({ ...current, [id]: (current[id] || []).slice(0, count) }));
    // بلافاصله پس از ثبت تعداد، پنجرهٔ انتخاب اجزا باز می‌شود
    setJuzModal({ id, count });
  };

  /* --------- بارنامهٔ نهایی: همهٔ بخش‌ها به فیلدهای مخفی JSON --------- */
  const specialtyDetailsPayload = specialties
    .filter((item) => {
      const spec = specialtyDetailSpec[item.code];
      return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
    })
    .map((item): { code: string; value?: string; options?: string[]; juz?: string } | null => {
      const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
      if (spec.kind === "checklist") return detail.options.length ? { code: item.code, options: detail.options } : null;
      if (!detail.value) return null;
      if (spec.kind === "juz") {
        const parts = juzParts[item.id] || [];
        // بدون تأیید پنجرهٔ انتخاب اجزا، ردیف حافظ ارسال نمی‌شود
        if (!parts.length) return null;
        return { code: item.code, value: detail.value, juz: parts.join(",") };
      }
      return { code: item.code, value: detail.value };
    })
    .filter((row) => row !== null);
  const specialtyCertKeysPayload = specialties
    .filter((item) => selectedSpecialties.has(item.id) && certSlots[item.id]?.[0])
    .map((item) => ({ code: item.code, key: certSlots[item.id][0].key }));
  const educationPayload = [{ university: { ...education.university, docKey: eduSlots.university[0]?.key || "" }, seminary: { ...education.seminary, docKey: eduSlots.seminary[0]?.key || "" } }];
  const workHistoryPayload = workRows.map((row, index) => ({ ...row, docKey: workSlots[index]?.[0]?.key || "" })).filter((row) => row.title.trim().length >= 2);
  const coursesPayload = courseRows.map((row, index) => ({ ...row, docKey: courseSlots[index]?.[0]?.key || "" })).filter((row) => row.title.trim().length >= 2);
  const activityPayload = activityRows.filter((row) => row.title.trim().length >= 2 && row.kind);
  const allSlots: Array<DocSlot & { section: string }> = [
    ...photoSlot.map((slot) => ({ ...slot, section: "photo" })),
    ...eduSlots.university.map((slot) => ({ ...slot, section: "university" })),
    ...eduSlots.seminary.map((slot) => ({ ...slot, section: "seminary" })),
    ...memorizationSlot.map((slot) => ({ ...slot, section: "memorization" })),
    ...evidenceSlots.map((slot) => ({ ...slot, section: "evidence" })),
    ...specialties.flatMap((item) => (certSlots[item.id] || []).map((slot) => ({ ...slot, section: `specialty:${item.code}` }))),
    ...workRows.flatMap((row, index) => (workSlots[index] || []).map((slot) => ({ ...slot, section: `work:${index}` }))),
    ...courseRows.flatMap((row, index) => (courseSlots[index] || []).map((slot) => ({ ...slot, section: `course:${index}` }))),
  ];
  const evidenceCount = evidenceSlots.length + eduSlots.university.length + eduSlots.seminary.length + memorizationSlot.length + specialties.reduce((sum, item) => sum + (certSlots[item.id]?.length || 0), 0);

  return <form action={action} className="profile-form register-case-form" noValidate>
    {state.error && <div className="form-error profile-error" role="alert">{state.error}</div>}

    {/* ---------------- حساب کاربری ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>حساب کاربری</h2><p>حساب شما با همین شماره موبایل ساخته می‌شود؛ کد تأیید فعال‌سازی به همین شماره پیامک خواهد شد.</p></div>
      <div className="form-grid">
        <label>نام <i>*</i><input required {...bind("firstName")} maxLength={80} placeholder="نام" /></label>
        <label>نام خانوادگی <i>*</i><input required {...bind("lastName")} maxLength={100} placeholder="نام خانوادگی" /></label>
        <label>شماره موبایل <i>*</i><input required {...bind("mobile")} inputMode="tel" maxLength={11} dir="ltr" placeholder="۰۹۱۲۳۴۵۶۷۸۹" /><small>این شماره به‌عنوان شماره تماس پرونده نیز ثبت می‌شود.</small></label>
        <label>ایمیل (اختیاری)<input {...bind("email")} type="email" dir="ltr" maxLength={254} placeholder="example@email.com" /></label>
        <label>گذرواژه <i>*</i><input required {...bind("password")} type="password" dir="ltr" autoComplete="new-password" maxLength={128} placeholder="حداقل ۸ نویسه با حروف بزرگ، کوچک و عدد" /></label>
        <label>تکرار گذرواژه <i>*</i><input required {...bind("confirmation")} type="password" dir="ltr" autoComplete="new-password" maxLength={128} /></label>
      </div>
    </section>

    {/* ---------------- اطلاعات هویتی ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>اطلاعات هویتی و تماس</h2><p>همهٔ فیلدهای ستاره‌دار اجباری هستند.</p></div>
      <div className="form-grid">
        <label>نام پدر <i>*</i><input required {...bind("fatherName")} maxLength={80} /></label>
        <label>کد ملی <i>*</i><input required {...bind("nationalId")} inputMode="numeric" maxLength={10} dir="ltr" placeholder="کد ملی ۱۰ رقمی" /><small>برای جست‌وجو محافظت و در فهرست‌ها پوشانده می‌شود.</small></label>
        <label>شماره شناسنامه <i>*</i><input required {...bind("idCardNumber")} inputMode="numeric" maxLength={10} dir="ltr" /></label>
        <label>محل صدور شناسنامه <i>*</i><input required {...bind("idIssuePlace")} maxLength={80} /></label>
        <label>تاریخ تولد شمسی <i>*</i><JalaliDateInput name="birthDate" required ariaLabel="تاریخ تولد شمسی" /></label>
        <label>جنسیت <i>*</i><select name="gender" required value={values.gender} onChange={(event) => setValues((current) => ({ ...current, gender: event.target.value }))}><option value="">انتخاب کنید</option><option value="female">زن</option><option value="male">مرد</option></select></label>
        <label>شماره همراه جایگزین <i>*</i><input required {...bind("alternatePhone")} inputMode="tel" maxLength={11} dir="ltr" /></label>
        <label>ایمیل تماس (اختیاری)<input {...bind("contactEmail")} type="email" dir="ltr" maxLength={254} /></label>
        <label>شغل<input {...bind("job")} maxLength={120} placeholder="اختیاری؛ مثلاً دانشجو، معلم" /></label>
      </div>
    </section>

    {/* ---------------- سکونت و محل فعالیت ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>سکونت و محل فعالیت قرآنی</h2><p>استان و شهرستان سکونت الزامی است؛ بقیهٔ فیلدها اختیاری‌اند.</p></div>
      <h3 className="form-subhead">محل سکونت</h3>
      <div className="form-grid">
        <label>استان <i>*</i><select name="provinceId" required value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setCountyId(""); }}><option value="">انتخاب استان</option>{provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>شهرستان <i>*</i><select name="countyId" required value={countyId} onChange={(event) => setCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{counties.filter((item) => String(item.provinceId) === provinceId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>شهر<input {...bind("city")} maxLength={120} /></label>
        <label>کد پستی<input {...bind("postalCode")} inputMode="numeric" maxLength={10} dir="ltr" /></label>
        <label className="full-field">نشانی<textarea {...bind("address")} maxLength={1000} rows={2} /></label>
      </div>
      <h3 className="form-subhead">محل فعالیت قرآنی</h3>
      <div className="form-grid">
        <label>استان فعالیت<select name="activityProvinceId" value={activityProvinceId} onChange={(event) => { setActivityProvinceId(event.target.value); setActivityCountyId(""); }}><option value="">انتخاب استان</option>{provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>شهرستان فعالیت<select name="activityCountyId" value={activityCountyId} onChange={(event) => setActivityCountyId(event.target.value)}><option value="">انتخاب شهرستان</option>{counties.filter((item) => String(item.provinceId) === activityProvinceId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>محل فعالیت قرآنی<input {...bind("activityPlace")} maxLength={180} placeholder="مثلاً مسجد، مؤسسه یا مرکز فرهنگی" /></label>
        <label>مؤسسه قرآنی محل فعالیت<input {...bind("organization")} maxLength={180} /></label>
      </div>
    </section>

    {/* ---------------- تحصیلات دانشگاهی و حوزوی ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>تحصیلات دانشگاهی و حوزوی</h2><p>مقطع تحصیلی را متناسب با وضعیت خود انتخاب کنید و مدرک مربوط را در همین بخش بارگذاری کنید؛ هر دو بخش اختیاری‌اند.</p></div>
      <h3 className="form-subhead">تحصیلات دانشگاهی</h3>
      <div className="form-grid">
        <label>مقطع تحصیلی<select name="universityLevel" value={education.university.level} onChange={(event) => setEducation((current) => ({ ...current, university: { ...current.university, level: event.target.value } }))}><option value="">انتخاب مقطع (از بی‌سواد تا دکترا)</option>{educationLevelOptions.university.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        <label>رشته<input value={education.university.field} maxLength={120} onChange={(event) => setEducation((current) => ({ ...current, university: { ...current.university, field: event.target.value } }))} placeholder="اختیاری" /></label>
        <label>نام دانشگاه یا مرکز<input value={education.university.centerName} maxLength={180} onChange={(event) => setEducation((current) => ({ ...current, university: { ...current.university, centerName: event.target.value } }))} placeholder="اختیاری" /></label>
        <label>مدرک یا گواهی<input value={education.university.certificate} maxLength={180} onChange={(event) => setEducation((current) => ({ ...current, university: { ...current.university, certificate: event.target.value } }))} placeholder="اختیاری؛ مثلاً گواهی کارشناسی" /></label>
        <label className="full-field">مدرک تحصیلی دانشگاهی (بارگذاری)<SectionUpload section="university" slots={eduSlots.university} onChange={(next) => setEduSlots((current) => ({ ...current, university: next }))} label="بارگذاری مدرک تحصیلی دانشگاهی" /></label>
      </div>
      <h3 className="form-subhead">تحصیلات حوزوی</h3>
      <div className="form-grid">
        <label>سطح تحصیلات حوزوی<select name="seminaryLevel" value={education.seminary.level} onChange={(event) => setEducation((current) => ({ ...current, seminary: { ...current.seminary, level: event.target.value } }))}><option value="">انتخاب سطح</option>{educationLevelOptions.seminary.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        <label>رشته یا دروس<input value={education.seminary.field} maxLength={120} onChange={(event) => setEducation((current) => ({ ...current, seminary: { ...current.seminary, field: event.target.value } }))} placeholder="اختیاری" /></label>
        <label>نام حوزه یا مرکز<input value={education.seminary.centerName} maxLength={180} onChange={(event) => setEducation((current) => ({ ...current, seminary: { ...current.seminary, centerName: event.target.value } }))} placeholder="اختیاری" /></label>
        <label>مدرک یا گواهی<input value={education.seminary.certificate} maxLength={180} onChange={(event) => setEducation((current) => ({ ...current, seminary: { ...current.seminary, certificate: event.target.value } }))} placeholder="اختیاری؛ مثلاً گواهی سطح ۲" /></label>
        <label className="full-field">مدرک تحصیلی حوزوی (بارگذاری)<SectionUpload section="seminary" slots={eduSlots.seminary} onChange={(next) => setEduSlots((current) => ({ ...current, seminary: next }))} label="بارگذاری مدرک تحصیلی حوزوی" /></label>
      </div>
    </section>

    {/* ---------------- تخصص‌های قرآنی ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>تخصص‌های قرآنی</h2><p>حداقل یک تخصص را انتخاب کنید؛ جزئیات هر تخصص (میزان حفظ، سطح قرائت یا حوزه‌ها/رشته‌ها) باید کامل شود و گواهی هر تخصص را می‌توانید در همان بخش بارگذاری کنید.</p></div>
      <div className="specialty-grid">{specialties.map((item) => <label key={item.id}><input type="checkbox" name="specialties" value={item.id} checked={selectedSpecialties.has(item.id)} onChange={() => toggleSpecialty(item.id)} /><span>{item.title}</span></label>)}</div>
      {specialties.filter((item) => {
        const spec = specialtyDetailSpec[item.code];
        return selectedSpecialties.has(item.id) && spec && (spec.kind === "juz" || spec.kind === "level" || spec.kind === "checklist");
      }).map((item) => {
        const spec = specialtyDetailSpec[item.code]; const detail = detailFor(item.id);
        return <div className="specialty-detail" key={`detail-${item.id}`}>
          <div className="specialty-detail-head"><strong>{item.title}</strong><small>{spec.hint}</small></div>
          {(spec.kind === "juz" || spec.kind === "level") && <label className="specialty-detail-select"><span>{spec.kind === "juz" ? "میزان حفظ" : "سطح قرائت"}</span><select value={detail.value} onChange={(event) => (spec.kind === "juz" ? setJuzValue(item.id, event.target.value) : setDetailValue(item.id, event.target.value))}><option value="">انتخاب کنید</option>{Object.entries(spec.kind === "juz" ? hafizJuzOptions : recitationLevelOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          {/* الحاقیهٔ ۲.۱۳.۰ — خلاصهٔ اجزای منتخب + ویرایش آن‌ها */}
          {spec.kind === "juz" && detail.value && <div className="juz-parts-line">
            <span className="juz-parts-value">{juzParts[item.id]?.length ? `اجزای منتخب: ${juzPartsSummaryFa(juzParts[item.id])}` : "جزءها هنوز انتخاب نشده‌اند"}</span>
            <button type="button" onClick={() => setJuzModal({ id: item.id, count: detail.value === "complete" ? 30 : Number(detail.value) })}>{juzParts[item.id]?.length ? "ویرایش اجزا" : "انتخاب اجزا"}</button>
          </div>}
          {spec.kind === "checklist" && spec.options && <div className="check-list">{Object.entries(spec.options).map(([key, label]) => <label key={key} className={detail.options.includes(key) ? "checked" : ""}><input type="checkbox" checked={detail.options.includes(key)} onChange={() => toggleDetailOption(item.id, key)} /><span>{label}</span></label>)}</div>}
          {/* الحاقیهٔ ۲.۱۲.۰ — بخش اختصاصی حافظ قرآن: نوع مدرک + بارگذاری گواهی */}
          {item.code === "memorizer" && <div className="memorizer-block">
            <label>نوع مدرک حافظ<select name="memorizationCertType" value={memorizationCertType} onChange={(event) => setMemorizationCertType(event.target.value)}><option value="">انتخاب کنید</option>{Object.entries(memorizationCertTypeOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <SectionUpload section="memorization" slots={memorizationSlot} onChange={setMemorizationSlot} label="بارگذاری گواهی یا مدرک حفظ" />
          </div>}
          <SectionUpload section={`specialty:${item.code}`} slots={certSlots[item.id] || []} onChange={(next) => setCertSlots((current) => ({ ...current, [item.id]: next }))} label="بارگذاری گواهی تخصص" />
        </div>;
      })}
      {authorSpecialty && selectedSpecialties.has(authorSpecialty.id) && <div className="writings-block">
        <h3 className="form-subhead">آثار مؤلف</h3>
        {writingRows.length > 0 && <div className="education-rows">{writingRows.map((row, index) => <div className="education-row" key={index}><div className="writing-row-grid">
          <label>نوع اثر <i>*</i><select value={row.workType} onChange={(event) => setWritingRows((current) => current.map((item, i) => i === index ? { ...item, workType: event.target.value as WritingType } : item))}>{Object.entries(writingTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>نام کتاب / مقاله <i>*</i><input value={row.title} maxLength={180} onChange={(event) => setWritingRows((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label>
          <label>موضوع<input value={row.topic} maxLength={180} onChange={(event) => setWritingRows((current) => current.map((item, i) => i === index ? { ...item, topic: event.target.value } : item))} /></label>
        </div><button type="button" className="row-remove" onClick={() => setWritingRows((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
        <button type="button" className="secondary-button education-add" onClick={() => setWritingRows((current) => [...current, { workType: "book", title: "", topic: "" }])}><Plus size={16} /> افزودن اثر</button>
      </div>}
    </section>

    {/* ---------------- سوابق شغلی و همکاری ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>سوابق شغلی و همکاری</h2><p>نام سازمان یا مجموعه، نوع همکاری، سمت، مدت همکاری و توضیحات هر مورد را ثبت کنید و مدارک آن را در همان بخش بارگذاری کنید؛ این بخش اختیاری است.</p></div>
      {workRows.length > 0 && <div className="education-rows">{workRows.map((row, index) => <div className="education-row" key={index}><div className="work-row-grid">
        <label>عنوان یا محل اشتغال <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateWorkRow(index, { title: event.target.value })} placeholder="مثلاً دبیری آموزش و پرورش" /></label>
        <label>نام سازمان یا مجموعه<input value={row.employer} maxLength={180} onChange={(event) => updateWorkRow(index, { employer: event.target.value })} /></label>
        <label>نوع همکاری<select value={row.cooperationType} onChange={(event) => updateWorkRow(index, { cooperationType: event.target.value })}><option value="">انتخاب کنید</option>{Object.entries(cooperationTypeOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>سمت یا مسئولیت<input value={row.position} maxLength={120} onChange={(event) => updateWorkRow(index, { position: event.target.value })} /></label>
        <label>تاریخ شروع شمسی<JalaliDateInput value={row.startDate} onChange={(value) => updateWorkRow(index, { startDate: value })} ariaLabel="تاریخ شروع همکاری" /></label>
        <label>تاریخ پایان شمسی (خالی = تاکنون)<JalaliDateInput value={row.endDate} onChange={(value) => updateWorkRow(index, { endDate: value })} ariaLabel="تاریخ پایان همکاری" /></label>
        <label className="full-field">توضیحات تکمیلی<input value={row.description} maxLength={2000} onChange={(event) => updateWorkRow(index, { description: event.target.value })} /></label>
        <label className="full-field">مدارک همکاری<SectionUpload section={`work:${index}`} slots={workSlots[index] || []} onChange={(next) => setWorkSlots((current) => ({ ...current, [index]: next }))} label="بارگذاری مدرک این همکاری" /></label>
      </div><button type="button" className="row-remove" onClick={() => { setWorkRows((current) => current.filter((_, i) => i !== index)); setWorkSlots((current) => { const next = { ...current }; delete next[index]; return next; }); }}><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
      <button type="button" className="secondary-button education-add" onClick={() => setWorkRows((current) => [...current, { ...emptyWorkRow }])}><Plus size={16} /> افزودن سابقه همکاری یا شغلی</button>
    </section>

    {/* ---------------- دوره‌های گذرانده‌شده ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>دوره‌های گذرانده‌شده</h2><p>با انتخاب عنوان دوره، رشتهٔ مرتبط را از فهرست انتخاب کنید و گواهی دوره را در همان بخش بارگذاری کنید؛ این بخش اختیاری است.</p></div>
      {courseRows.length > 0 && <div className="education-rows">{courseRows.map((row, index) => <div className="education-row" key={index}><div className="course-row-grid">
        <label>عنوان دوره <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateCourseRow(index, { title: event.target.value })} placeholder="مثلاً دوره تجوید پیشرفته" /></label>
        <label>برگزارکننده<input value={row.provider} maxLength={180} onChange={(event) => updateCourseRow(index, { provider: event.target.value })} /></label>
        <label>رشته<select value={row.field} onChange={(event) => updateCourseRow(index, { field: event.target.value })}><option value="">انتخاب رشته</option>{Object.entries(courseFieldOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>تاریخ گذراندن شمسی<JalaliDateInput value={row.completedDate} onChange={(value) => updateCourseRow(index, { completedDate: value })} ariaLabel="تاریخ گذراندن دوره" /></label>
        <label>ساعت دوره<input value={row.hours} inputMode="numeric" maxLength={4} dir="ltr" onChange={(event) => updateCourseRow(index, { hours: event.target.value })} /></label>
        <label className="full-field">گواهی دوره<SectionUpload section={`course:${index}`} slots={courseSlots[index] || []} onChange={(next) => setCourseSlots((current) => ({ ...current, [index]: next }))} label="بارگذاری گواهی این دوره" /></label>
      </div><button type="button" className="row-remove" onClick={() => { setCourseRows((current) => current.filter((_, i) => i !== index)); setCourseSlots((current) => { const next = { ...current }; delete next[index]; return next; }); }}><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
      <button type="button" className="secondary-button education-add" onClick={() => setCourseRows((current) => [...current, { ...emptyCourseRow }])}><Plus size={16} /> افزودن دوره</button>
    </section>

    {/* ---------------- سوابق فعالیت قرآنی ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>سوابق فعالیت قرآنی</h2><p>نوع سابقه (فعالیت، تدریس، داوری، مسابقات، پژوهش) را انتخاب کنید؛ برای «تدریس» و «داوری» فهرست کشویی وابستهٔ رشته باز می‌شود.</p></div>
      {activityRows.length > 0 && <div className="education-rows">{activityRows.map((row, index) => <div className="education-row" key={index}><div className="work-row-grid">
        <label>نوع سابقه <i>*</i><select value={row.kind} onChange={(event) => updateActivityRow(index, { kind: event.target.value, field: "" })}><option value="">انتخاب کنید</option>{Object.entries(activityRecordKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {["teaching", "judging"].includes(row.kind) && <label>رشته<select value={row.field} onChange={(event) => updateActivityRow(index, { field: event.target.value })}><option value="">انتخاب رشته</option>{Object.entries(courseFieldOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <label>عنوان <i>*</i><input value={row.title} maxLength={180} onChange={(event) => updateActivityRow(index, { title: event.target.value })} /></label>
        <label>سازمان یا محل برگزاری<input value={row.organization} maxLength={180} onChange={(event) => updateActivityRow(index, { organization: event.target.value })} /></label>
        <label>سمت یا مسئولیت<input value={row.position} maxLength={120} onChange={(event) => updateActivityRow(index, { position: event.target.value })} /></label>
        <label>تاریخ شروع شمسی<JalaliDateInput value={row.startDate} onChange={(value) => updateActivityRow(index, { startDate: value })} ariaLabel="تاریخ شروع سابقه" /></label>
        <label>تاریخ پایان شمسی (خالی = تاکنون)<JalaliDateInput value={row.endDate} onChange={(value) => updateActivityRow(index, { endDate: value })} ariaLabel="تاریخ پایان سابقه" /></label>
        <label className="full-field">توضیحات<input value={row.description} maxLength={2000} onChange={(event) => updateActivityRow(index, { description: event.target.value })} /></label>
      </div><button type="button" className="row-remove" onClick={() => setActivityRows((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /> حذف ردیف</button></div>)}</div>}
      <button type="button" className="secondary-button education-add" onClick={() => setActivityRows((current) => [...current, { ...emptyActivityRow }])}><Plus size={16} /> افزودن سابقه فعالیت</button>
    </section>

    {/* ---------------- مدارک پشتیبان و تصویر پرسنلی ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>تصویر پرسنلی و مدارک پشتیبان</h2><p>تصویر پرسنلی و حداقل یک مدرک پشتیبان (مدرک تحصیلی، گواهی حفظ یا تخصص، کارت ملی یا هر مستند دیگر) برای ارسال پرونده الزامی است.</p></div>
      <div className="form-grid">
        <label className="full-field">تصویر پرسنلی <i>*</i><SectionUpload section="photo" slots={photoSlot} onChange={setPhotoSlot} label="بارگذاری تصویر پرسنلی" hint="PNG یا JPEG؛ حداکثر ۵۰۰ کیلوبایت" maxBytes={500 * 1024} /></label>
        <label className="full-field">مدرک پشتیبان (کارت ملی، صفحه شناسنامه یا سایر مستندات)<SectionUpload section="evidence" slots={evidenceSlots} onChange={setEvidenceSlots} label="بارگذاری مدرک پشتیبان" multiple /></label>
      </div>
      <div className="upload-status">{photoSlot.length && evidenceCount ? <><CheckCircle2 size={15} /> مدارک الزامی بارگذاری شده است.</> : <>تصویر پرسنلی و حداقل یک مدرک پشتیبان بارگذاری شود{photoSlot.length ? "" : " (تصویر پرسنلی ثبت نشده)"}{evidenceCount ? "" : " (مدرک پشتیبان ثبت نشده)"}.</>}</div>
    </section>

    {/* ---------------- توضیحات و ارسال ---------------- */}
    <section className="form-section">
      <div className="form-section-head"><h2>توضیحات تکمیلی و ارسال</h2></div>
      <div className="form-grid">
        <label className="full-field">توضیحات تکمیلی<textarea {...bind("notes")} maxLength={4000} rows={3} placeholder="در صورت نیاز" /></label>
      </div>
      <label className="register-confirm"><input type="checkbox" required /><span>صحت اطلاعات و مدارک واردشده را تأیید می‌کنم؛ پس از ثبت نهایی، پرونده برای بررسی کارشناسان ارسال می‌شود.</span></label>
    </section>

    <input type="hidden" name="specialtyDetails" value={JSON.stringify(specialtyDetailsPayload)} />
    <input type="hidden" name="specialtyCertKeys" value={JSON.stringify(specialtyCertKeysPayload)} />
    <input type="hidden" name="education" value={JSON.stringify(educationPayload)} />
    <input type="hidden" name="writings" value={JSON.stringify(writingRows.filter((row) => row.workType && row.title.trim().length >= 2))} />
    <input type="hidden" name="workHistory" value={JSON.stringify(workHistoryPayload)} />
    <input type="hidden" name="courses" value={JSON.stringify(coursesPayload)} />
    <input type="hidden" name="activityRecords" value={JSON.stringify(activityPayload)} />
    <input type="hidden" name="stagedDocs" value={JSON.stringify(allSlots)} />
    <div className="form-actions register-submit">
      <div><Link className="secondary-button" href="/login">قبلاً حساب دارم؛ ورود</Link></div>
      <div><button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} ثبت نهایی و ارسال برای بررسی</button></div>
    </div>
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