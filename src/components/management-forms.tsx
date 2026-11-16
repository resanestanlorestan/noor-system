"use client";
import { useActionState, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { addCountyAction, addOrganizationAction, addSpecialtyAction, createStaffAction, deleteUserAction, sweepStaleActivistsAction, toggleUserAction } from "@/app/actions/management";
import { deleteCaseAction, restoreCaseAction } from "@/app/actions/cases";
import { initialActionState } from "@/lib/action-state";
import { roleLabels, type UserRole } from "@/lib/constants";
type Province = { id:number; name:string }; type County = { id:number; name:string; provinceId:number }; type Specialty = { id:number; title:string }; type CustomRoleOption = { id:string; label:string; baseRole:UserRole };
export function StaffForm({ provinces, counties, specialties, role, provinceId, canAssignCustomRole, customRoles }: { provinces:Province[]; counties:County[]; specialties:Specialty[]; role:UserRole; provinceId:number | null; canAssignCustomRole?:boolean; customRoles?:CustomRoleOption[] }) {
  const [state, action, pending] = useActionState(createStaffAction, initialActionState);
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [province, setProvince] = useState(String(provinceId || "")); const [county, setCounty] = useState(""); const [selectedRole, setSelectedRole] = useState(""); const [customRoleId, setCustomRoleId] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<number>>(new Set());
  const allowed: UserRole[] = role === "super_admin" ? ["province_admin", "county_admin", "reviewer", "specialist"] : ["county_admin", "reviewer", "specialist"];
  const toggleSpecialty = (id: number) => setSelectedSpecialties((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <form action={action} className="management-form"><div className="form-grid"><label>نام<input name="firstName" required maxLength={80} placeholder="نام" /></label><label>نام خانوادگی<input name="lastName" required maxLength={100} placeholder="نام خانوادگی" /></label><label>شماره موبایل<input type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required maxLength={20} placeholder="09123456789" /><small>ورود کاربر با همین شماره انجام می‌شود؛ باید یکتا باشد.</small></label><label>ایمیل (اختیاری)<input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" maxLength={254} placeholder="اختیاری" /></label><label>گذرواژه اولیه<input type="password" name="password" minLength={8} maxLength={128} dir="ltr" required /><small>حداقل ۸ نویسه با حروف بزرگ، کوچک انگلیسی و عدد؛ گذرواژه را از مسیر امن به کاربر برسانید.</small></label><label>نقش<select name="role" required value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">انتخاب نقش</option>{allowed.map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}</select></label>{canAssignCustomRole && customRoles ? <label>نقش سفارشی (اختیاری)<select name="customRoleId" value={customRoleId} onChange={(event) => setCustomRoleId(event.target.value)}><option value="">بدون نقش سفارشی — مجوزهای نقش بالا</option>{customRoles.map((item) => <option value={item.id} key={item.id}>{item.label} (مبنای محدوده: {roleLabels[item.baseRole]})</option>)}</select><small>نقش‌های سفارشی در صفحه «نقش‌ها و مجوزها» ساخته می‌شوند؛ با انتخاب آن‌ها مجوزها از نقش سفارشی و محدوده جغرافیایی از نقش بالا گرفته می‌شود.</small></label> : null}<label>استان<select name="provinceId" value={province} onChange={(event) => {setProvince(event.target.value);setCounty("");}} required><option value="">انتخاب استان</option>{provinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>شهرستان<select name="countyId" value={county} onChange={(event) => setCounty(event.target.value)}><option value="">همه شهرستان‌های استان</option>{counties.filter((item) => String(item.provinceId) === province).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{selectedRole === "specialist" && <label className="full-field">حوزه‌های تخصصی کارشناس<div className="specialty-grid">{specialties.map((item) => <label key={item.id}><input type="checkbox" name="specialtyIds" value={item.id} checked={selectedSpecialties.has(item.id)} onChange={() => toggleSpecialty(item.id)} /><span>{item.title}</span></label>)}</div><small>کارشناس می‌تواند بیش از یک حوزه داشته باشد و فقط ارجاع‌های همان حوزه‌ها و محدوده مجاز خود را می‌بیند.</small></label>}</div>{state.error && <div className="form-error" role="alert">{state.error}</div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} ایجاد کاربر</button></form>;
}
export function CountyForm({ provinces }: { provinces:Province[] }) {
  const [state, action, pending] = useActionState(addCountyAction, initialActionState);
  const [provinceId, setProvinceId] = useState(""); const [name, setName] = useState("");
  return <form action={action} className="management-form"><div className="form-grid"><label>استان<select name="provinceId" value={provinceId} onChange={(e) => setProvinceId(e.target.value)} required><option value="">انتخاب استان</option>{provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>نام شهرستان<input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="نام شهرستان" /></label></div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}<button className="primary-button" disabled={pending}><Plus size={16} /> افزودن شهرستان</button></form>;
}
export function SpecialtyForm() {
  const [state, action, pending] = useActionState(addSpecialtyAction, initialActionState);
  const [title, setTitle] = useState("");
  return <form action={action} className="management-form"><div className="form-grid"><label className="full-field">عنوان تخصص جدید<input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder="مثلاً مجری محافل قرآنی" /></label></div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} افزودن تخصص</button></form>;
}
export function OrganizationForm({ provinces, counties }: { provinces: Province[]; counties: County[] }) {
  const [state, action, pending] = useActionState(addOrganizationAction, initialActionState);
  const [name, setName] = useState(""); const [type, setType] = useState("");
  const [phone, setPhone] = useState(""); const [managerName, setManagerName] = useState("");
  const [provinceId, setProvinceId] = useState(""); const [countyId, setCountyId] = useState("");
  return <form action={action} className="management-form"><div className="form-grid">
    <label>نام سازمان<input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={180} required placeholder="مثلاً اداره کل فرهنگ و ارشاد اسلامی" /></label>
    <label>نوع سازمان<input name="type" value={type} onChange={(e) => setType(e.target.value)} maxLength={120} placeholder="اختیاری؛ مثلاً دولتی، مؤسسه قرآنی" /></label>
    <label>استان<select name="provinceId" value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setCountyId(""); }}><option value="">انتخاب استان (اختیاری)</option>{provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>شهرستان<select name="countyId" value={countyId} onChange={(event) => setCountyId(event.target.value)}><option value="">انتخاب شهرستان (اختیاری)</option>{counties.filter((item) => String(item.provinceId) === provinceId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>تلفن تماس مؤسسه<input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} dir="ltr" placeholder="اختیاری؛ ۰۲۱۱۲۳۴۵۶۷۸" /></label>
    <label>نام مدیر مؤسسه<input name="managerName" value={managerName} onChange={(e) => setManagerName(e.target.value)} maxLength={140} placeholder="اختیاری" /></label>
    <label className="full-field">نشانی مؤسسه<input name="address" maxLength={250} placeholder="اختیاری؛ نشانی کامل دفتر مؤسسه" /></label>
  </div>{state.error && <div className="form-error" role="alert">{state.error}</div>}{state.success && <div className="form-success" role="status">{state.success}</div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} افزودن سازمان</button></form>;
}
export function ToggleUser({ id, active }: { id:string; active:boolean }) {
  return <form action={toggleUserAction}><input type="hidden" name="userId" value={id} /><button className="small-action" onClick={(event) => {if (!window.confirm(active ? "این حساب غیرفعال شود؟" : "این حساب دوباره فعال شود؟")) event.preventDefault();}}>{active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>;
}
/** الحاقیهٔ ۲.۱۷.۰ — حذف یکپارچه از سمت سرور: همهٔ داده‌های متعلق به کاربر
 *  (پرونده، مدارک، رکوردها و فایل‌ها) در یک تراکنش کامل حذف و کد ملی/موبایل
 *  آزاد می‌شود؛ اگر کاربر در پروندهٔ دیگران نقش داشته باشد فقط ردپای ممیزی
 *  او با نام محو می‌ماند. نمایش دکمه فقط برای مدیر کل است و سرور هم همان گارد را دارد. */
export function DeleteUser({ id, name }: { id:string; name:string }) {
  return <form action={deleteUserAction}><input type="hidden" name="userId" value={id} /><button className="table-link danger" onClick={(event) => {if (!window.confirm(`حساب «${name}» و همهٔ اطلاعات وابسته به آن حذف شود؟\n\nبا تأیید: پروندهٔ او در بخش مدیریت پرونده‌ها، اطلاعات هویتی و تحصیلی، تخصص‌ها و فعالیت‌های قرآنی، سوابق همکاری و شغلی، دوره‌ها، مدارک و گواهی‌های بارگذاری‌شده و فایل‌های پیوست به‌طور کامل و برگشت‌ناپذیر حذف می‌شوند و کد ملی و شمارهٔ موبایل او برای ثبت‌نام مجدد آزاد می‌شود.\n\nاگر این کاربر در روند کاری پروندهٔ کاربران دیگر نقش داشته باشد، آن رکوردها حفظ می‌شوند و فقط ردپای ممیزی حساب با نام محو می‌ماند.`)) event.preventDefault();}}>حذف</button></form>;
}
/** الحاقیهٔ ۲.۱۷.۱ — پاکسازی دادهٔ جاماندهٔ حسابی که با کد پیش از ۲.۱۷.۰ حذف/
 *  گمنام شده ولی رکورد فعال و پروندهٔ او باقی مانده و کد ملی‌اش را قفل کرده است. */
export function DeleteStaleUser({ id, name }: { id:string; name:string }) {
  return <form action={deleteUserAction}><input type="hidden" name="userId" value={id} /><button className="table-link danger" onClick={(event) => {if (!window.confirm(`حساب «${name}» پیش‌تر حذف شده ولی دادهٔ جاماندهٔ او (رکورد فعال و پرونده) باقی مانده و کد ملی‌اش را قفل کرده است.\n\nبا تأیید، همان حذف یکپارچهٔ کامل روی دادهٔ جامانده اجرا می‌شود و کد ملی و شمارهٔ موبایل برای ثبت‌نام مجدد آزاد می‌شود.`)) event.preventDefault();}}>پاکسازی دادهٔ جامانده</button></form>;
}
/** الحاقیهٔ ۲.۱۷.۱ — جاروب همهٔ رکوردهای فعالِ بدون مالک یا بدون پروندهٔ فعال؛
 *  بازمانده‌های کد قدیمی که کد ملی را قفل کرده‌اند — نرم‌حذفِ قابل بازیابی. */
export function SweepStale() {
  return <form action={sweepStaleActivistsAction}><button className="small-action" onClick={(event) => {if (!window.confirm("همهٔ رکوردهای فعالِ بدون مالک یا بدون پروندهٔ فعال، نرم‌حذفِ قابل بازیابی شوند؟\n\nاین رکوردها بازماندهٔ حذف‌های کد قدیمی‌اند و کد ملی را قفل کرده‌اند؛ پس از جاروب در بانک حذف‌شده‌ها قابل بازیابی‌اند. رکوردهای دارای پروندهٔ فعال یا مالک زنده دست‌نخورده می‌مانند.")) event.preventDefault();}}>جاروب رکوردهای جامانده</button></form>;
}
/** الحاقیهٔ ۲.۱۰.۴ — حذف پرونده در بانک پرونده‌ها با دو گزینه از سمت سرور:
 *  «حذف با ماندگاری در بانک» (برگشت‌پذیر با بازیابی) و «حذف کلی» (قطعی).
 *  نمایش دکمه فقط برای مدیر کل است و سرور هم همان گارد را دارد. */
export function DeleteCase({ id, name, mode }: { id:string; name:string; mode:"bank"|"total" }) {
  const confirmBank = `پرونده «${name}» از فهرست فعال حذف شود؟\n\nپرونده در بانک با برچسب «حذف‌شده» باقی می‌ماند و مدیر کل می‌تواند آن را بعداً بازیابی یا حذف کلی کند.`;
  const confirmTotal = `پرونده «${name}» به‌طور کامل حذف شود؟\n\nهمهٔ داده‌های وابسته — مدارک، تاریخچهٔ وضعیت، ارجاع‌ها، یادداشت‌های کارشناسی و نسخه‌ها — برای همیشه پاک می‌شوند و فقط ردپای ممیزی در لاگ سامانه می‌ماند. این کار برگشت‌پذیر نیست.`;
  return <form action={deleteCaseAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="mode" value={mode} /><button className={mode === "total" ? "table-link danger" : "table-link"} onClick={(event) => {if (!window.confirm(mode === "bank" ? confirmBank : confirmTotal)) event.preventDefault();}}>{mode === "bank" ? "حذف از فهرست" : "حذف کلی"}</button></form>;
}
export function RestoreCase({ id, name }: { id:string; name:string }) {
  return <form action={restoreCaseAction}><input type="hidden" name="caseId" value={id} /><button className="table-link" onClick={(event) => {if (!window.confirm(`پرونده «${name}» بازیابی شود و به فهرست فعال بانک پرونده‌ها برگردد؟`)) event.preventDefault();}}>بازیابی</button></form>;
}
