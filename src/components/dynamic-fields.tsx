"use client";
// الحاقیهٔ ۲.۲۳.۰ — رندرکنندهٔ مشترک فرم پویا: هم در ویزارد پرونده (مرحلهٔ تخصص‌ها)
// و هم در پیش‌نمایش فرم‌ساز استفاده می‌شود تا نمایش شرطی دقیقاً همان رفتاری باشد
// که سرور در اعتبارسنجی اجرا می‌کند (isFieldVisible از form-config مشترک).
import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { uploadFormFileAction } from "@/app/actions/cases";
import { initialActionState } from "@/lib/action-state";
import { formFileMimeHints, isFieldVisible, type FormAnswers, type FormConfig, type FormField } from "@/lib/form-config";

export type DynValues = Record<string, string | string[]>;

/** ورودی فایل فیلد پویا: آپلود بلافاصله، بازگشت شناسهٔ مدرک به والد.
 *  الحاقیهٔ ۲.۲۵.۰ — entityType: specialty (پیش‌فرض) یا case_step برای فیلدهای
 *  سفارشی مراحل ثبت پرونده. */
function FormFileInput({ applicationId, specialtyId, field, value, onChange, disabled, entityType = "specialty" }: { applicationId: string; specialtyId: number; field: FormField; value?: string; onChange: (documentId: string) => void; disabled?: boolean; entityType?: string }) {
  const [state, action, pending] = useActionState(uploadFormFileAction.bind(null, applicationId), initialActionState);
  useEffect(() => {
    if (state.data?.documentId) onChange(state.data.documentId);
    // onChange در رندرهای بعدی ثابت است؛ وابستگی اضافه باعث حلقهٔ ناخواسته نمی‌شود
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const rule = field.file;
  return <div className="dyn-file-box">
    <form action={action}>
      <input type="hidden" name="specialtyId" value={specialtyId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="fieldKey" value={field.key} />
      <input type="file" name="file" accept={rule?.accept === "audio" ? "audio/*" : rule?.accept === "image" ? "image/*" : rule?.accept === "pdf" ? "application/pdf" : undefined} disabled={disabled || pending} onChange={(event) => { if (event.target.form && (event.target.files as FileList)?.length) event.target.form.requestSubmit(); }} />
      {pending && <button type="submit" className="primary-button" disabled><LoaderCircle className="spin" size={16} /> در حال بارگذاری…</button>}
    </form>
    <small>حداکثر {rule?.maxSizeMb} مگابایت — {formFileMimeHints[rule?.accept || "any"]}</small>
    {value && <div className="dyn-file-done"><Paperclip size={14} /> فایل پیوست شد <button type="button" className="row-remove" title="حذف پیوست" onClick={() => onChange("")}><Trash2 size={14} /></button></div>}
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    {state.success && !state.error && <div className="form-success" role="status">{state.success}</div>}
  </div>;
}

/** رندر فیلدهای فرم پویا با نمایش شرطی؛ الحاقیهٔ ۲.۲۵.۰ — prefix: پیشوند نام
 *  ورودی‌ها (dyn برای فرم تخصص‌ها، cstep برای فیلدهای سفارشی مراحل ثبت پرونده)
 *  و entityType برای مسیر آپلود فایل همان فرم. */
export function DynamicFieldsRenderer({ config, applicationId, specialtyId, values, onValueChange, disabled, prefix = "dyn", entityType = "specialty" }: { config: FormConfig; applicationId?: string; specialtyId: number; values: DynValues; onValueChange?: (fieldKey: string, value: string | string[]) => void; disabled?: boolean; prefix?: string; entityType?: string }) {
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const set = (key: string, value: string | string[]) => onValueChange?.(key, value);
  const visible = config.fields.filter((field) => isFieldVisible(field, values as FormAnswers));
  if (!config.fields.length) return <p className="inline-empty">این فرم هنوز فیلدی ندارد.</p>;
  return <div className="dyn-fields">
    {visible.map((field) => {
      const name = `${prefix}__${specialtyId}__${field.key}`;
      const value = values[field.key];
      const requiredMark = field.required ? <i>*</i> : null;
      return <div className="dyn-field" key={field.key}>
        {field.type === "modal" ? <div className="dyn-modal-line">
          <span>{field.label}</span>
          <button type="button" className="secondary-button" onClick={() => setModalOpen(field.key)}>نمایش اطلاعات</button>
          {modalOpen === field.key && <div className="dyn-modal" role="dialog" aria-label={field.modal?.title}>
            <div className="dyn-modal-head"><strong>{field.modal?.title}</strong><button type="button" onClick={() => setModalOpen(null)}>بستن</button></div>
            <p>{field.modal?.body}</p>
          </div>}
        </div>
          : field.type === "file" ? <label className="dyn-label">مدرک / فایل: {field.label} {requiredMark}<FormFileInput applicationId={applicationId || ""} specialtyId={specialtyId} entityType={entityType} field={field} value={typeof value === "string" ? value : undefined} onChange={(documentId) => set(field.key, documentId)} disabled={disabled} /></label>
            : field.type === "checkbox" ? <div className="dyn-label">تک‌به‌تک انتخاب کنید: {field.label} {requiredMark}
              <div className="check-list">{(field.options || []).map((option) => <label key={option.key} className={Array.isArray(value) && value.includes(option.key) ? "checked" : ""}>
                <input type="checkbox" name={name} value={option.key} checked={Array.isArray(value) && value.includes(option.key)} disabled={disabled} onChange={(event) => {
                  const current = Array.isArray(value) ? value : [];
                  set(field.key, event.target.checked ? [...current, option.key] : current.filter((key) => key !== option.key));
                }} />
                <span>{option.label}{option.help && <small>{option.help}</small>}</span>
              </label>)}</div>
            </div>
              : field.type === "radio" ? <div className="dyn-label">{field.label} {requiredMark}
                <div className="check-list">{(field.options || []).map((option) => <label key={option.key} className={value === option.key ? "checked" : ""}>
                  <input type="radio" name={name} value={option.key} checked={value === option.key} disabled={disabled} onChange={() => set(field.key, option.key)} />
                  <span>{option.label}{option.help && <small>{option.help}</small>}</span>
                </label>)}</div>
              </div>
                : field.type === "select" || field.type === "multiselect" ? <label className="dyn-label">{field.label} {requiredMark}
                  {/* چندانتخابی با ورودی‌های پنهانِ هر گزینه ارسال می‌شود تا مقادیر تکراری پیش نیاید */}
                  <select name={field.type === "multiselect" ? undefined : name} value={Array.isArray(value) ? value[0] || "" : value || ""} disabled={disabled} onChange={(event) => set(field.key, event.target.value)}>
                    <option value="">انتخاب کنید</option>
                    {(field.options || []).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                  {field.type === "multiselect" && (field.options || []).map((option) => <input key={option.key} type="hidden" name={name} value={Array.isArray(value) && value.includes(option.key) ? option.key : ""} />)}
                  {field.help && <small>{field.help}</small>}
                </label>
                  : field.type === "textarea" ? <label className="dyn-label full">{field.label} {requiredMark}<textarea name={name} rows={3} maxLength={4000} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={(event) => set(field.key, event.target.value)} placeholder="توضیحات" />{field.help && <small>{field.help}</small>}</label>
                    : <label className="dyn-label">{field.label} {requiredMark}<input name={name} maxLength={500} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={(event) => set(field.key, event.target.value)} />{field.help && <small>{field.help}</small>}</label>}
      </div>;
    })}
  </div>;
}

/** نسخهٔ فقط‌نمایشی پاسخ‌های ذخیره‌شده برای جزئیات پرونده و بازبینی مدیران */
export function DynamicAnswersView({ config, answers }: { config: FormConfig; answers: FormAnswers }) {
  const rows = config.fields.filter((field) => field.type !== "modal" && answers[field.key] !== undefined && answers[field.key] !== "").map((field) => {
    const value = answers[field.key];
    if (field.type === "file") return { label: field.label, text: "مدرک پیوست‌شده" };
    const labels = new Map((field.options || []).map((option) => [option.key, option.label]));
    const picked = Array.isArray(value) ? value : [String(value)];
    return { label: field.label, text: picked.map((key) => labels.get(key) || key).join("، ") };
  });
  if (!rows.length) return null;
  return <div className="dyn-answers-view"><ul>{rows.map((row) => <li key={row.label}><strong>{row.label}:</strong> <span>{row.text}</span></li>)}</ul></div>;
}
