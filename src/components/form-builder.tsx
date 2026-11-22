"use client";
// الحاقیهٔ ۲.۲۳.۰ — فرم‌ساز پویای داشبورد: مدیر بدون کدنویسی برای هر تخصص،
// فیلدها (متن/توضیح/کشویی/چندانتخاب/تیک‌دار/رادیو/مودال/فایل)، گزینه‌ها،
// متن راهنما، شرط نمایش، الزام و محدودیت فایل را تعریف می‌کند؛ ترتیب با
// Drag & Drop (و دکمه‌های بالا/پایین در موبایل)، پیش‌نمایش زنده، ذخیرهٔ
// پیش‌نویس، انتشار نسخهٔ تازه، غیرفعال‌سازی و حذف. اعتبارسنجی نهایی سمت سرور است.
import { useActionState, useState } from "react";
import { ChevronDown, ChevronUp, Eye, GripVertical, Layers, LoaderCircle, Plus, Save, Send, Trash2, X } from "lucide-react";
import { deleteFormAction, publishFormAction, saveFormDraftAction, setFormDisabledAction } from "@/app/actions/forms";
import { initialActionState } from "@/lib/action-state";
import { DynamicFieldsRenderer, type DynValues } from "@/components/dynamic-fields";
import { FORM_FIELD_TYPES, FORM_FILE_ACCEPTS, formFieldTypeLabels, formFileAcceptLabels, newFieldKey, newOptionKey, type FormConfig, type FormField, type FormFieldType } from "@/lib/form-config";

type BuilderProps = {
  specialtyId: number;
  specialtyTitle: string;
  status: "none" | "draft" | "published" | "disabled";
  version: number;
  answersCount: number;
  initialConfig: FormConfig;
};

const typeWithOptions = (type: FormFieldType) => type === "select" || type === "multiselect" || type === "checkbox" || type === "radio";

function newField(type: FormFieldType): FormField {
  const field: FormField = { key: newFieldKey(), type, label: "", required: false };
  if (typeWithOptions(type)) field.options = [{ key: newOptionKey(), label: "" }];
  if (type === "file") field.file = { accept: "audio", maxSizeMb: 5 };
  if (type === "modal") field.modal = { title: "", body: "" };
  return field;
}

export function FormBuilder({ specialtyId, specialtyTitle, status, version, answersCount, initialConfig }: BuilderProps) {
  const [fields, setFields] = useState<FormField[]>(() => initialConfig.fields.map((field) => ({ ...field })));
  const [openField, setOpenField] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState<DynValues>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [draftState, draftAction, draftPending] = useActionState(saveFormDraftAction, initialActionState);
  const [publishState, publishAction, publishPending] = useActionState(publishFormAction, initialActionState);
  const [disableState, disableAction] = useActionState(async (_state: unknown, fd: FormData) => setFormDisabledAction(fd), initialActionState);
  const [deleteState, deleteAction] = useActionState(async (_state: unknown, fd: FormData) => deleteFormAction(fd), initialActionState);
  const payload = JSON.stringify({ fields } satisfies FormConfig);

  const update = (key: string, patch: Partial<FormField>) => setFields((current) => current.map((field) => (field.key === key ? { ...field, ...patch } : field)));
  const move = (index: number, delta: number) => setFields((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const dropOn = (index: number) => {
    if (dragIndex === null || dragIndex === index) return setDragIndex(null);
    setFields((current) => { const next = [...current]; const [moved] = next.splice(dragIndex, 1); next.splice(index, 0, moved); return next; });
    setDragIndex(null);
  };
  const precedingOptionFields = (index: number) => fields.slice(0, index).filter((field) => typeWithOptions(field.type));
  const canSave = fields.length > 0;

  return <section className="ws-panel detail-section builder-panel">
    <div className="detail-section-head"><div><span>فرم‌ساز پویا</span><h2>فرم تخصص «{specialtyTitle}»</h2><p>
      {status === "none" && "هنوز فرمی ساخته نشده است؛ فیلدها را اضافه و پیش‌نویس را ذخیره کنید."}
      {status === "draft" && "پیش‌نویس ذخیره‌شده دارد؛ تا انتشار، در پرونده‌ها نمایش داده نمی‌شود."}
      {status === "published" && `نسخهٔ منتشرشدهٔ ${version} فعال است${answersCount ? ` و ${answersCount} پاسخ ذخیره شده` : ""}؛ ویرایش‌ها فقط با انتشار نسخهٔ جدید اعمال می‌شوند.`}
      {status === "disabled" && "فرم غیرفعال است؛ پاسخ‌های قبلی محفوظ مانده‌اند."}
    </p></div><Layers size={19} /></div>

    <div className="builder-types">
      <span>افزودن فیلد:</span>
      {FORM_FIELD_TYPES.map((type) => <button key={type} type="button" className="secondary-button" onClick={() => { const field = newField(type); setFields((current) => [...current, field]); setOpenField(field.key); }}><Plus size={14} /> {formFieldTypeLabels[type]}</button>)}
    </div>

    <div className="builder-fields">
      {fields.map((field, index) => {
        const sources = precedingOptionFields(index);
        const isOpen = openField === field.key;
        return <div key={field.key} className={"builder-field" + (dragIndex === index ? " dragging" : "")} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(index)}>
          <div className="builder-field-head">
            <span className="builder-drag" title="جابه‌جایی با کشیدن"><GripVertical size={16} /></span>
            <strong>{field.label || `فیلد ${index + 1}`}</strong>
            <small>{formFieldTypeLabels[field.type]}{field.required ? " · الزامی" : " · اختیاری"}{field.showIf ? " · شرطی" : ""}</small>
            <span className="builder-field-tools">
              <button type="button" title="بالا" onClick={() => move(index, -1)} disabled={index === 0}><ChevronUp size={15} /></button>
              <button type="button" title="پایین" onClick={() => move(index, 1)} disabled={index === fields.length - 1}><ChevronDown size={15} /></button>
              <button type="button" onClick={() => setOpenField(isOpen ? null : field.key)}>{isOpen ? "بستن" : "ویرایش"}</button>
              <button type="button" className="row-remove" title="حذف فیلد" onClick={() => setFields((current) => current.filter((item) => item.key !== field.key))}><Trash2 size={15} /></button>
            </span>
          </div>
          {isOpen && <div className="builder-field-body">
            <label>عنوان فیلد<input value={field.label} maxLength={180} onChange={(event) => update(field.key, { label: event.target.value })} placeholder="مثلاً نوع قرائت" /></label>
            <label>متن راهنما (زیر فیلد)<input value={field.help || ""} maxLength={500} onChange={(event) => update(field.key, { help: event.target.value || undefined })} placeholder="اختیاری" /></label>
            <label className="builder-check"><input type="checkbox" checked={field.required} onChange={(event) => update(field.key, { required: event.target.checked })} /><span>پاسخ به این فیلد الزامی است</span></label>
            {typeWithOptions(field.type) && <div className="builder-options">
              <strong>گزینه‌ها</strong>
              {(field.options || []).map((option, optionIndex) => <div key={option.key} className="builder-option">
                <input value={option.label} maxLength={180} placeholder={`برچسب گزینهٔ ${optionIndex + 1}`} onChange={(event) => update(field.key, { options: (field.options || []).map((item) => (item.key === option.key ? { ...item, label: event.target.value } : item)) })} />
                <input value={option.help || ""} maxLength={300} placeholder="راهنمای زیر گزینه (اختیاری)" onChange={(event) => update(field.key, { options: (field.options || []).map((item) => (item.key === option.key ? { ...item, help: event.target.value || undefined } : item)) })} />
                <button type="button" className="row-remove" title="حذف گزینه" onClick={() => update(field.key, { options: (field.options || []).filter((item) => item.key !== option.key) })}><Trash2 size={14} /></button>
              </div>)}
              <button type="button" className="secondary-button" onClick={() => update(field.key, { options: [...(field.options || []), { key: newOptionKey(), label: "" }] })}><Plus size={14} /> افزودن گزینه</button>
            </div>}
            {field.type === "file" && <div className="builder-file-rule">
              <label>نوع فایل مجاز<select value={field.file?.accept || "any"} onChange={(event) => update(field.key, { file: { accept: event.target.value as typeof FORM_FILE_ACCEPTS[number], maxSizeMb: field.file?.maxSizeMb || 5 } })}>{FORM_FILE_ACCEPTS.map((accept) => <option key={accept} value={accept}>{formFileAcceptLabels[accept]}</option>)}</select></label>
              <label>حداکثر حجم (مگابایت)<input type="number" min={1} max={10} value={field.file?.maxSizeMb || 5} onChange={(event) => update(field.key, { file: { accept: field.file?.accept || "any", maxSizeMb: Math.min(10, Math.max(1, Number(event.target.value) || 1)) } })} /></label>
            </div>}
            {field.type === "modal" && <div className="builder-file-rule">
              <label>عنوان پنجره<input value={field.modal?.title || ""} maxLength={180} onChange={(event) => update(field.key, { modal: { title: event.target.value, body: field.modal?.body || "" } })} /></label>
              <label>متن پنجره<textarea rows={3} maxLength={4000} value={field.modal?.body || ""} onChange={(event) => update(field.key, { modal: { title: field.modal?.title || "", body: event.target.value } })} /></label>
            </div>}
            <div className="builder-condition">
              <strong>شرط نمایش (اختیاری)</strong>
              <small>این فیلد فقط وقتی نمایش داده شود که کاربر در فیلد دیگری گزینهٔ مشخصی را انتخاب کند؛ مثلاً «قرائت تقلیدی» → نمایش «نام قاری» و «نمونهٔ صوتی».</small>
              {field.showIf ? <div className="builder-condition-row">
                <select value={field.showIf.fieldKey} onChange={(event) => {
                  const source = sources.find((item) => item.key === event.target.value);
                  update(field.key, { showIf: source ? { fieldKey: source.key, optionKeys: [] } : null });
                }}>
                  <option value="">فیلد شرط…</option>
                  {sources.map((source) => <option key={source.key} value={source.key}>{source.label || formFieldTypeLabels[source.type]}</option>)}
                </select>
                <div className="check-list">{(sources.find((item) => item.key === field.showIf?.fieldKey)?.options || []).map((option) => <label key={option.key} className={field.showIf?.optionKeys.includes(option.key) ? "checked" : ""}>
                  <input type="checkbox" checked={field.showIf?.optionKeys.includes(option.key) || false} onChange={(event) => {
                    const current = field.showIf?.optionKeys || [];
                    update(field.key, { showIf: { fieldKey: field.showIf!.fieldKey, optionKeys: event.target.checked ? [...current, option.key] : current.filter((key) => key !== option.key) } });
                  }} /><span>{option.label || "(بدون برچسب)"}</span>
                </label>)}</div>
                <button type="button" className="row-remove" onClick={() => update(field.key, { showIf: null })}>حذف شرط</button>
              </div>
                : sources.length ? <button type="button" className="secondary-button" onClick={() => update(field.key, { showIf: { fieldKey: sources[sources.length - 1].key, optionKeys: [] } })}><Plus size={14} /> تعریف شرط نمایش</button>
                  : <small>برای شرط‌گذاری، ابتدا یک فیلد گزینه‌دار پیش از این فیلد تعریف کنید.</small>}
            </div>
          </div>}
        </div>;
      })}
      {!fields.length && <p className="inline-empty">هیچ فیلدی تعریف نشده است؛ از دکمه‌های بالا فیلد اضافه کنید.</p>}
    </div>

    <div className="builder-actions">
      <form action={draftAction}>
        <input type="hidden" name="entityType" value="specialty" />
        <input type="hidden" name="entityId" value={specialtyId} />
        <input type="hidden" name="config" value={payload} />
        <button className="secondary-button" disabled={draftPending || !canSave}>{draftPending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} ذخیرهٔ پیش‌نویس</button>
      </form>
      <form action={publishAction}>
        <input type="hidden" name="entityType" value="specialty" />
        <input type="hidden" name="entityId" value={specialtyId} />
        <button className="primary-button" disabled={publishPending || !canSave}>{publishPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} انتشار نسخهٔ تازه</button>
      </form>
      <button type="button" className="secondary-button" onClick={() => setPreview(true)} disabled={!canSave}><Eye size={16} /> پیش‌نمایش فرم</button>
      {(status === "published" || status === "disabled") && <form action={disableAction}>
        <input type="hidden" name="entityType" value="specialty" />
        <input type="hidden" name="entityId" value={specialtyId} />
        <input type="hidden" name="disabled" value={status === "published" ? "1" : "0"} />
        <button className="secondary-button">{status === "published" ? "غیرفعال‌سازی فرم" : "فعال‌سازی مجدد"}</button>
      </form>}
      {status !== "none" && answersCount === 0 && <form action={deleteAction}>
        <input type="hidden" name="entityType" value="specialty" />
        <input type="hidden" name="entityId" value={specialtyId} />
        <button className="secondary-button row-remove">حذف فرم</button>
      </form>}
    </div>
    {(draftState.error || publishState.error || disableState.error || deleteState.error) && <div className="form-error" role="alert">{draftState.error || publishState.error || disableState.error || deleteState.error}</div>}
    {(draftState.success || publishState.success || disableState.success || deleteState.success) && <div className="form-success" role="status">{draftState.success || publishState.success || disableState.success || deleteState.success}</div>}

    {preview && <div className="builder-preview-backdrop" onClick={() => setPreview(false)}>
      <div className="builder-preview" onClick={(event) => event.stopPropagation()}>
        <div className="builder-preview-head"><strong>پیش‌نمایش فرم «{specialtyTitle}»</strong><button type="button" onClick={() => setPreview(false)} aria-label="بستن پیش‌نمایش"><X size={18} /></button></div>
        <DynamicFieldsRenderer config={{ fields }} specialtyId={specialtyId} values={previewValues} onValueChange={(key, value) => setPreviewValues((current) => ({ ...current, [key]: value }))} />
        <p><small>پیش‌نمایش زنده است؛ با انتخاب گزینه‌ها، فیلدهای شرطی در همین‌جا باز و بسته می‌شوند.</small></p>
      </div>
    </div>}
  </section>;
}
