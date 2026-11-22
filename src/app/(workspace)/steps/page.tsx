// الحاقیهٔ ۲.۲۵.۰ — صفحهٔ داشبورد «مدیریت مراحل ثبت پرونده». ورود با گارد مجوز
// forms.manage در سرور کنترل می‌شود؛ داده از دیتابیس واقعی (تعریف مراحل + فرم
// سفارشی هر مرحله + شمارش پاسخ‌ها) می‌آید و انتخاب مرحله با ?st= انجام می‌شود.
// مراحل پایهٔ سامانه فیلدهای ثابت خودشان را دارند (فهرست فقط‌خواندنی) و فیلدهای
// سفارشی هر مرحله با همان فرم‌ساز ۲.۲۳.۰ تعریف و نسخه‌بندی می‌شود.
import { redirect } from "next/navigation";
import { ListOrdered } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCaseStepsForAdmin } from "@/app/actions/case-steps-admin";
import { emptyFormConfig, type FormConfig } from "@/lib/form-config";
import { StepsManager, type ManagedCaseStepView } from "@/components/steps-manager";
import { FormBuilder } from "@/components/form-builder";

/** فیلدهای ثابت مراحل پایه — فقط برای نمایش در داشبورد؛ تغییر این فیلدها به
 *  ساختار رابطه‌ای دادهٔ پرونده‌ها وصل است و از UI حذف/ویرایش نمی‌شود. */
const SYSTEM_STEP_FIELDS: Record<string, string[]> = {
  identity: ["نام و نام خانوادگی", "نام پدر", "کد ملی", "شماره شناسنامه", "محل صدور", "تاریخ تولد", "جنسیت", "شماره همراه و همراه جایگزین", "ایمیل", "تحصیلات دانشگاهی / حوزوی با مدرک"],
  location: ["استان و شهرستان سکونت", "شهر", "کد پستی", "نشانی", "استان و شهرستان فعالیت قرآنی", "محل فعالیت", "همکاری سازمانی + افزودن سازمان جدید"],
  specialties: ["تخصص‌های قرآنی و جزئیات هر تخصص", "آثار (کتاب/مقاله)", "سوابق شغلی", "دوره‌های گذرانده‌شده", "سوابق فعالیت", "شغل", "توضیحات تکمیلی", "فرم‌های پویای تخصص‌های انتخاب‌شده"],
  documents: ["تصویر پرسنلی (الزامی)", "مدارک پشتیبان (حداقل یک)", "پاسخ مدارک درخواستی باز"],
  review: ["خلاصهٔ همهٔ مراحل با ویرایش مستقیم", "بررسی هوشمند آمادگی ارسال", "گارد باز اصلاح/مدارک درخواستی", "ارسال برای بررسی"],
};

export default async function StepsPage({ searchParams }: { searchParams: Promise<{ st?: string }> }) {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) redirect("/dashboard");
  const data = await listCaseStepsForAdmin();
  if (!data) redirect("/dashboard");
  const query = await searchParams;
  const selectedId = query.st ? Number.parseInt(query.st, 10) : null;
  const selected = data.rows.find((row) => row.id === selectedId) || null;
  const selectedDef = selected ? data.defMap.get(selected.id) : undefined;
  const initialConfig = (selectedDef ? (selectedDef.draftConfig || selectedDef.publishedConfig || emptyFormConfig) : emptyFormConfig) as FormConfig;
  const answersCount = selected && selectedDef ? data.usageMap.get(selectedDef.id) || 0 : 0;
  const rows: ManagedCaseStepView[] = data.rows.map((row) => {
    const def = data.defMap.get(row.id);
    return { id: row.id, code: row.code, title: row.title, description: row.description, kind: row.kind, required: row.required, active: row.active, formStatus: def ? def.status : "none", version: def?.version || 0, answersCount: def ? data.usageMap.get(def.id) || 0 : 0 };
  });
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>مدیریت مراحل ثبت پرونده</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> فرم‌ساز پویا</div><h1>مدیریت مراحل ثبت پرونده</h1><p>مراحل فرایند ثبت‌نام و تکمیل پرونده را بدون کدنویسی مدیریت کنید: افزودن مرحلهٔ سفارشی، ویرایش عنوان و توضیح، ترتیب نمایش با Drag &amp; Drop و فیلدهای سفارشی هر مرحله؛ تغییرات خودکار در ویزارد ثبت پرونده اعمال می‌شود و پاسخ‌ها با نسخه‌بندی فرم ذخیره می‌ماند.</p></div><ListOrdered size={20} /></div>
    <div className="forms-grid">
      <StepsManager key={rows.map((row) => `${row.id}:${row.title}:${row.active}:${row.formStatus}:${row.version}:${row.answersCount}`).join("|")} rows={rows} selectedId={selected?.id ?? null} />
      {selected ? <>
        {selected.kind === "system" && <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>مرحلهٔ پایهٔ سامانه</span><h2>فیلدهای ثابت «{selected.title}»</h2><p>این فیلدها ستون دادهٔ پرونده‌ها را می‌سازند و برای حفظ سازگاری سوابق، از همین‌جا قابل حذف یا ویرایش ساختاری نیستند؛ می‌توانید عنوان و توضیح مرحله را ویرایش کنید و با فرم‌ساز، فیلدهای تکمیلی سفارشی به انتهای همان مرحله اضافه کنید.</p></div></div>
          <ul className="county-list">{(SYSTEM_STEP_FIELDS[selected.code] || []).map((field) => <li key={field}><strong>{field}</strong></li>)}</ul></section>}
        <FormBuilder entityType="case_step" specialtyId={selected.id} specialtyTitle={selected.title} status={selectedDef ? selectedDef.status : "none"} version={selectedDef?.version || 0} answersCount={answersCount} initialConfig={initialConfig} />
      </> : <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>فرم‌ساز فیلدهای سفارشی</span><h2>انتخاب مرحله</h2><p>برای تعریف یا ویرایش فیلدهای سفارشی یک مرحله، از فهرست «فرم‌ساز» همان مرحله را انتخاب کنید. فیلدهای مراحل سفارشی، کل محتوای آن مرحله را می‌سازند و فیلدهای مراحل پایه، به‌عنوان بخش تکمیلی زیر فرم اصلی نمایش داده می‌شوند.</p></div></div>
        <p className="inline-empty">نمونه: مرحلهٔ سفارشی «مصاحبه و ارزیابی» با فیلد کشویی «وضعیت مصاحبه» و فیلد شرطی «توضیح ارزیاب» که فقط برای گزینهٔ «نیاز به بررسی مجدد» باز می‌شود؛ پاسخ هر پرونده با نسخهٔ فرم در لحظهٔ ثبت ذخیره می‌شود.</p></section>}
    </div></>;
}
