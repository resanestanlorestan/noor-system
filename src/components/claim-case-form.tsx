"use client";
import { useActionState, useState } from "react";
import { LoaderCircle, Link2 } from "lucide-react";
import { claimCaseAction } from "@/app/actions/claim";
import { initialActionState } from "@/lib/action-state";
export function ClaimCaseForm() {
  const [state, action, pending] = useActionState(claimCaseAction, initialActionState);
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [nationalId, setNationalId] = useState(""); const [phone, setPhone] = useState(""); const [birthDate, setBirthDate] = useState("");
  return <form action={action} className="management-form" noValidate>
    <div className="form-grid">
      <label>نام<input name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} required placeholder="همان نامی که در پرونده ثبت شده" /></label>
      <label>نام خانوادگی<input name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} required placeholder="همان نام خانوادگی ثبت‌شده" /></label>
      <label>کد ملی<input name="nationalId" value={nationalId} onChange={(e) => setNationalId(e.target.value)} inputMode="numeric" maxLength={10} required placeholder="کد ملی ۱۰ رقمی" /></label>
      <label>شماره همراه ثبت‌شده<input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={11} required placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>
      <label>تاریخ تولد شمسی<input name="birthDate" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required placeholder="۱۳۷۵/۰۱/۰۱" /></label>
    </div>
    <small>تمام موارد باید دقیقاً با اطلاعاتی که مدیر یا کارشناس ثبت کرده یکسان باشد؛ در غیر این صورت اتصال انجام نمی‌شود.</small>
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} اتصال پرونده به حساب من</button>
  </form>;
}
