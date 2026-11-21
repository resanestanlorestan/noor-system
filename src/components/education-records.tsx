"use client";

// الحاقیهٔ ۲.۱۹.۲ — بخش «سوابق تحصیلی حوزوی و دانشگاهی» صفحهٔ پرونده (بخش هویتی)
// از activity-records.tsx جدا شد و مؤلفهٔ کلاینت با دکمه‌های دسته‌بندی
// «دانشگاهی / حوزه‌ای» (مطابق طرح) روی فهرست شد؛ ثبت هم‌زمان هر دو نوع سابقه،
// حذف و اتصال مدرک دقیقاً با همان اکشن‌ها و ساختار قبلی کار می‌کند.
import { useState } from "react";
import { Plus, School } from "lucide-react";
import { educationLevelOptions, educationTypeLabels, type EducationType } from "@/lib/constants";
import { addEducationRecordAction, deleteEducationRecordAction } from "@/app/actions/records";
import { ConfirmButton } from "@/components/case-controls";
import { RecordDocumentLink, type DocOption } from "@/components/activity-records";

type EducationRecordRow = { id: string; type: EducationType; level: string; field: string | null; centerName: string | null; certificate: string | null; documentId: string | null };

export function EducationRecordsSection({ caseId, records, editable, availableDocuments = [] }: { caseId: string; records: EducationRecordRow[]; editable: boolean; availableDocuments?: DocOption[] }) {
  const [tab, setTab] = useState<EducationType>("university");
  const visible = records.filter((item) => item.type === tab);
  return <section className="ws-panel detail-section"><div className="detail-section-head"><div><span>تحصیلات</span><h2>سوابق تحصیلی حوزوی و دانشگاهی</h2><p>برای هر مدرک یک سابقه با نوع، مقطع، رشته، نام مرکز و مدرک ثبت کنید؛ در صورت وجود فایل، سابقه به مدرک بارگذاری‌شده متصل می‌شود.</p></div><School size={19} /></div>
    <div className="edu-tabs" role="tablist" aria-label="دسته‌بندی سوابق تحصیلی">
      {(Object.entries(educationTypeLabels) as [EducationType, string][]).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "edu-tab active" : "edu-tab"} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {visible.length ? <div className="record-list">{visible.map((item) => <div className="record-item" key={item.id}><div className="record-item-head"><span className="record-kind-badge">{educationTypeLabels[item.type]}</span><strong>{item.level}</strong>{editable && <form action={deleteEducationRecordAction} className="record-delete"><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="recordId" value={item.id} /><ConfirmButton className="small-action" name="confirm" value="yes" confirmText="این سابقه تحصیلی حذف شود؟">حذف</ConfirmButton></form>}</div>{(item.field || item.centerName) && <small>{[item.field, item.centerName].filter(Boolean).join(" · ")}</small>}{item.certificate && <small>مدرک: {item.certificate}</small>}<RecordDocumentLink caseId={caseId} recordId={item.id} editable={editable} targetType="education_record" documentId={item.documentId} docTitle={availableDocuments.find((doc) => doc.id === item.documentId)?.title ?? null} availableDocuments={availableDocuments} /></div>)}</div> : <div className="inline-empty">{records.length ? "در این دسته سابقه‌ای ثبت نشده است؛ دستهٔ دیگر را از دکمه‌های بالا ببینید." : "هنوز سابقه تحصیلی ثبت نشده است."}</div>}
    {editable && <form action={addEducationRecordAction} className="record-form"><input type="hidden" name="caseId" value={caseId} /><div className="form-grid"><label>نوع تحصیل<select name="type" defaultValue="" required><option value="">انتخاب کنید</option>{Object.entries(educationTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>مقطع<select name="level" defaultValue="" required>{Object.entries(educationLevelOptions).map(([type, levels]) => <optgroup key={type} label={educationTypeLabels[type as EducationType]}>{levels.map((level) => <option key={level} value={level}>{level}</option>)}</optgroup>)}</select></label><label>رشته<input name="field" maxLength={120} placeholder="اختیاری؛ مثلاً علوم قرآنی" /></label><label>نام مرکز<input name="centerName" maxLength={180} placeholder="اختیاری؛ نام دانشگاه یا حوزه" /></label><label>مدرک<input name="certificate" maxLength={180} placeholder="اختیاری؛ مثلاً گواهی سطح ۲" /></label>{availableDocuments.length > 0 && <label>فایل مدرک<select name="documentId" defaultValue=""><option value="">هیچ‌کدام</option>{availableDocuments.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>}</div><button className="secondary-button"><Plus size={16} /> افزودن سابقه تحصیلی</button></form>}
  </section>;
}
