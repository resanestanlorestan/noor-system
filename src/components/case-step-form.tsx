"use client";
// الحاقیهٔ ۲.۲۵.۰ — فرم فیلدهای سفارشی یک مرحلهٔ ثبت پرونده: برای مراحل سفارشی
// کل محتوای مرحله است و برای مراحل پایه، بخش «فیلدهای تکمیلی» زیر فرم اصلی.
// نمایش شرطی با همان موتور مشترک سرور اجرا و پاسخ‌ها با نسخهٔ منتشرشدهٔ فرم
// ذخیره می‌شود؛ انتشار نسخهٔ تازه هرگز پاسخ‌های تاریخی را تغییر نمی‌دهد.
import { useActionState, useState } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { saveCaseStepAnswersAction } from "@/app/actions/case-steps";
import { initialActionState } from "@/lib/action-state";
import { carryOverAnswers, type FormAnswers, type FormConfig } from "@/lib/form-config";
import { DynamicFieldsRenderer, type DynValues } from "@/components/dynamic-fields";

export function CaseStepDynamicForm({ caseId, definitionId, title, description, config, saved, complete, variant = "custom" }: { caseId: string; definitionId: number; title: string; description?: string | null; config: FormConfig; saved: FormAnswers; complete?: boolean; variant?: "custom" | "extra" }) {
  const [state, action, pending] = useActionState(saveCaseStepAnswersAction, initialActionState);
  const [values, setValues] = useState<DynValues>(() => carryOverAnswers(config, saved) as DynValues);
  return <section className={variant === "custom" ? "ws-panel form-panel" : "ws-panel detail-section"}>
    <div className="detail-section-head"><div>
      {variant === "custom"
        ? <><span>مرحلهٔ سفارشی</span><h2>{title}</h2><p>{description || "فیلدهای این مرحله از بخش مدیریت مراحل تعریف شده است؛ فیلدهای ستاره‌دار الزامی‌اند."}</p></>
        : <><span>فیلدهای تکمیلی</span><h2>{title}</h2><p>{description || "فیلدهای افزوده‌شده از بخش مدیریت مراحل؛ پاسخ‌ها همراه همین فرم ذخیره می‌شود."}</p></>}
    </div>{complete ? <CheckCircle2 size={19} /> : null}</div>
    <form action={action}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="caseStepId" value={definitionId} />
      <DynamicFieldsRenderer config={config} applicationId={caseId} specialtyId={definitionId} prefix="cstep" entityType="case_step" values={values} onValueChange={(fieldKey, value) => setValues((current) => ({ ...current, [fieldKey]: value }))} />
      {state.error && <div className="form-error" role="alert">{state.error}</div>}
      {state.success && <div className="form-success" role="status">{state.success}</div>}
      <div className="form-actions">
        <button className="primary-button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} ذخیرهٔ پاسخ‌ها</button>
        <p className="side-description">پاسخ‌ها با نسخهٔ فعلی فرم ثبت می‌شود؛ ویرایش فرم توسط مدیر، پاسخ‌های قبلی را تغییر نمی‌دهد.</p>
      </div>
    </form>
  </section>;
}
