"use client";
import { useActionState, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { addCountyAction, addOrganizationAction, addSpecialtyAction, createStaffAction, toggleUserAction } from "@/app/actions/management";
import { initialActionState } from "@/lib/action-state";
import { roleLabels, type UserRole } from "@/lib/constants";
type Province = { id:number; name:string }; type County = { id:number; name:string; provinceId:number }; type Specialty = { id:number; title:string };
export function StaffForm({ provinces, counties, specialties, role, provinceId }: { provinces:Province[]; counties:County[]; specialties:Specialty[]; role:UserRole; provinceId:number | null }) {
  const [state, action, pending] = useActionState(createStaffAction, initialActionState);
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [province, setProvince] = useState(String(provinceId || "")); const [county, setCounty] = useState(""); const [selectedRole, setSelectedRole] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<Set<number>>(new Set());
  const allowed: UserRole[] = role === "super_admin" ? ["province_admin", "county_admin", "reviewer", "specialist"] : ["county_admin", "reviewer", "specialist"];
  const toggleSpecialty = (id: number) => setSelectedSpecialties((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <form action={action} className="management-form"><div className="form-grid"><label>نام<input name="firstName" required maxLength={80} placeholder="نام" /></label><label>نام خانوادگی<input name="lastName" required maxLength={100} placeholder="نام خانوادگی" /></label><label>شماره موبایل<input type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required maxLength={20} placeholder="09123456789" /><small>ورود کاربر با همین شماره انجام می‌شود؛ باید یکتا باشد.</small></label><label>ایمیل (اختیاری)<input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" maxLength={254} placeholder="اختیاری" /></label><label>گذرواژه اولیه<input type="password" name="password" minLength={8} maxLength={128} dir="ltr" required /><small>حداقل ۸ نویسه با حروف بزرگ، کوچک انگلیسی و عدد؛ گذرواژه را از مسیر امن به کاربر برسانید.</small></label><label>نقش<select name="role" required value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">انتخاب نقش</option>{allowed.map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}</select></label><label>استان<select name="provinceId" value={province} onChange={(event) => {setProvince(event.target.value);setCounty("");}} required><option value="">انتخاب استان</option>{provinces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>شهرستان<select name="countyId" value={county} onChange={(event) => setCounty(event.target.value)}><option value="">همه شهرستان‌های استان</option>{counties.filter((item) => String(item.provinceId) === province).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{selectedRole === "specialist" && <label className="full-field">حوزه‌های تخصصی کارشناس<div className="specialty-grid">{specialties.map((item) => <label key={item.id}><input type="checkbox" name="specialtyIds" value={item.id} checked={selectedSpecialties.has(item.id)} onChange={() => toggleSpecialty(item.id)} /><span>{item.title}</span></label>)}</div><small>کارشناس می‌تواند بیش از یک حوزه داشته باشد و فقط ارجاع‌های همان حوزه‌ها و محدوده مجاز خود را می‌بیند.</small></label>}</div>{state.error && <div className="form-error" role="alert">{state.error}</div>}<button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} ایجاد کاربر</button></form>;
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
