// الحاقیهٔ ۲.۲۳.۰ — صفحهٔ داشبورد «مدیریت تخصص‌های قرآنی و فرم‌ساز پویا».
// ورود با گارد مجوز forms.manage در سرور کنترل می‌شود؛ داده از دیتابیس واقعی
// (تخصص‌ها + تعریف فرم + شمارش پاسخ‌ها) می‌آید و انتخاب تخصص با ?sp= انجام می‌شود.
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSpecialtiesForForms } from "@/app/actions/forms";
import { emptyFormConfig, type FormConfig } from "@/lib/form-config";
import { SpecialtiesManager, type ManagedSpecialty } from "@/components/specialties-manager";
import { SpecialtyFieldsEditor } from "@/components/specialty-fields-editor";
import { FormBuilder } from "@/components/form-builder";

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ sp?: string }> }) {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) redirect("/dashboard");
  const data = await listSpecialtiesForForms();
  if (!data) redirect("/dashboard");
  const query = await searchParams;
  const selectedId = query.sp ? Number.parseInt(query.sp, 10) : null;
  const defFor = (id: number) => data.defMap.get(id);
  const rows: ManagedSpecialty[] = data.rows.map((row) => {
    const def = defFor(row.id);
    return { id: row.id, title: row.title, description: row.description, active: row.active, formStatus: def ? def.status : "none", version: def?.version || 0 };
  });
  const selected = data.rows.find((row) => row.id === selectedId) || null;
  const selectedDef = selected ? defFor(selected.id) : undefined;
  const initialConfig = (selectedDef ? (selectedDef.draftConfig || selectedDef.publishedConfig || emptyFormConfig) : emptyFormConfig) as FormConfig;
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>مدیریت تخصص‌ها و فرم‌ساز پویا</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> فرم‌ساز پویا</div><h1>مدیریت تخصص‌های قرآنی</h1><p>تخصص‌ها و فرم‌های پویا را بدون کدنویسی مدیریت کنید: فیلدها، گزینه‌ها، شرط نمایش، الزام پاسخ و مدارک هر تخصص؛ پاسخ‌ها در پروندهٔ هر فعال ذخیره می‌شود.</p></div></div>
    <div className="forms-grid">
      <SpecialtiesManager rows={rows} selectedId={selected?.id ?? null} />
      {selected ? <>
        {/* الحاقیهٔ ۲.۲۸.۰ — ویرایشگر پویای فیلد جزئیات تخصص انتخاب‌شده */}
        <SpecialtyFieldsEditor code={selected.code} title={selected.title} meta={data.detailMeta[selected.code] ?? { kind: "none", label: null, hint: null, maxOptions: null, options: [] }} savedAt={data.detailSavedAt[selected.code] || ""} />
        <FormBuilder specialtyId={selected.id} specialtyTitle={selected.title} status={selectedDef ? selectedDef.status : "none"} version={selectedDef?.version || 0} answersCount={data.usageMap.get(selected.id) || 0} initialConfig={initialConfig} />
      </>
        : <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>فرم‌ساز پویا</span><h2>انتخاب تخصص</h2><p>برای طراحی یا ویرایش فرم یک تخصص، از فهرست «فرم‌ساز» همان تخصص را انتخاب کنید. ساختار فرم به‌صورت نسخه‌بندی‌شده ذخیره می‌شود و پاسخ‌های ثبت‌شده با ویرایش‌های بعدی از بین نمی‌روند.</p></div><Layers size={19} /></div>
          <p className="inline-empty">دو نمونهٔ رایج: در فرم «قرائت قرآن» فیلد چندگزینه‌ای «نوع قرائت» بسازید (تحقیق، ترتیل، تقلیدی) و برای گزینهٔ «تقلیدی» دو فیلد شرطی «نام قاری موردنظر» (متن) و «نمونهٔ صوتی» (فایل صوتی) تعریف کنید.</p></section>}
    </div></>;
}
