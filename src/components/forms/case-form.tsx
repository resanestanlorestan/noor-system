"use client";

// Case creation form: identity section (stage 3 required-star rules), address,
// specialties picker and the education rows section.

import { useActionState } from "react";
import { saveCaseAction } from "@/app/actions/cases";
import { EducationSection } from "@/components/forms/education-section";
import { emptyState, type ActionState } from "@/lib/action-state";

type Option = { id: number; name: string };
type Specialty = { id: number; title: string };

export function CaseForm({ provinces, counties, specialties }: { provinces: Option[]; counties: Option[]; specialties: Specialty[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveCaseAction, emptyState);

  return (
    <form action={formAction} className="space-y-6">
      {state.error && <div className="alert-error">{state.error}</div>}
      {state.warning && state.duplicates && (
        <div className="alert-warn">
          <div className="mb-2 font-semibold">احتمال ثبت پرونده تکراری</div>
          <ul className="list-inside list-disc space-y-1 text-xs">
            {state.duplicates.map((d) => (
              <li key={d.caseId}>{d.name} ({d.location ?? "—"}) — {d.status} — {d.reason}</li>
            ))}
            {state.globalIdDuplicate && <li>کد ملی در پرونده دیگری خارج از محدوده شما ثبت شده است.</li>}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="dupAck" value="yes" />
            با علم به موارد بالا، ثبت پرونده جدید را تأیید می‌کنم.
          </label>
        </div>
      )}

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">بخش هویتی</h2>
        <p className="mb-4 text-xs text-slate-500">همه فیلدهای ستاره‌دار اجباری هستند؛ فقط ایمیل اختیاری است. <span className="req-star">*</span></p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><label className="label">نام <span className="req-star">*</span></label><input name="firstName" className="input" required /></div>
          <div><label className="label">نام خانوادگی <span className="req-star">*</span></label><input name="lastName" className="input" required /></div>
          <div><label className="label">نام پدر <span className="req-star">*</span></label><input name="fatherName" className="input" required /></div>
          <div><label className="label">کد ملی <span className="req-star">*</span></label><input name="nationalId" className="input" inputMode="numeric" maxLength={10} required /></div>
          <div><label className="label">شماره شناسنامه <span className="req-star">*</span></label><input name="idCardNumber" className="input" inputMode="numeric" maxLength={10} required /></div>
          <div><label className="label">محل صدور شناسنامه <span className="req-star">*</span></label><input name="idIssuePlace" className="input" required /></div>
          <div><label className="label">تاریخ تولد (شمسی) <span className="req-star">*</span></label><input name="birthDate" className="input" placeholder="۱۳۷۵/۰۱/۰۱" required /></div>
          <div>
            <label className="label">جنسیت <span className="req-star">*</span></label>
            <select name="gender" className="input" required>
              <option value="">انتخاب کنید</option>
              <option value="female">زن</option>
              <option value="male">مرد</option>
            </select>
          </div>
          <div><label className="label">شماره همراه <span className="req-star">*</span></label><input name="phone" className="input" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required /></div>
          <div><label className="label">شماره همراه جایگزین <span className="req-star">*</span></label><input name="alternatePhone" className="input" placeholder="۰۹۱۲۳۴۵۶۷۸۹" required /></div>
          <div><label className="label">ایمیل (اختیاری)</label><input name="contactEmail" type="email" className="input" /></div>
          <div><label className="label">شغل <span className="badge bg-sky-100 text-sky-700">مرحله ۳</span></label><input name="job" className="input" placeholder="دانشجو، معلم، کارمند..." /></div>
          <div>
            <label className="label">استان <span className="req-star">*</span></label>
            <select name="provinceId" className="input" required>
              <option value="">انتخاب کنید</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">شهرستان</label>
            <select name="countyId" className="input">
              <option value="">انتخاب کنید</option>
              {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">شهر</label><input name="city" className="input" /></div>
          <div><label className="label">کد پستی</label><input name="postalCode" className="input" inputMode="numeric" maxLength={10} /></div>
          <div className="col-span-2 md:col-span-4"><label className="label">نشانی</label><textarea name="address" className="input" rows={2} /></div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">محل و حوزه فعالیت</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="label">استان فعالیت</label>
            <select name="activityProvinceId" className="input">
              <option value="">انتخاب کنید</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">شهرستان فعالیت</label>
            <select name="activityCountyId" className="input">
              <option value="">انتخاب کنید</option>
              {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">محل فعالیت</label><input name="activityPlace" className="input" /></div>
          <div><label className="label">سازمان قرآنی</label><input name="organization" className="input" /></div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">تخصص‌های قرآنی</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {specialties.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" name="specialties" value={s.id} />
              {s.title}
            </label>
          ))}
        </div>
      </section>

      <EducationSection />

      <div className="flex justify-end gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "در حال ذخیره..." : "ذخیره پرونده"}</button>
      </div>
    </form>
  );
}
