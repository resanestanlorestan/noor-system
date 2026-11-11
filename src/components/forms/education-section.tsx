"use client";

// (مرحله سوم) Dynamic education rows: type (seminary/university) drives the
// level options. Submitted to the server as JSON in the "educationRecords" field.

import { useMemo, useState } from "react";
import { educationLevelOptions, educationTypeLabels, type EducationType } from "@/lib/constants";

type EducationRow = {
  type: EducationType;
  level: string;
  field: string;
  centerName: string;
  certificate: string;
};

const emptyRow = (): EducationRow => ({ type: "seminary", level: "", field: "", centerName: "", certificate: "" });

export function EducationSection() {
  const [rows, setRows] = useState<EducationRow[]>([]);

  const payload = useMemo(() => JSON.stringify(rows.filter((r) => r.type && r.level)), [rows]);

  function update(index: number, patch: Partial<EducationRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="card p-4">
      <input type="hidden" name="educationRecords" value={payload} />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">اطلاعات تحصیلی (حوزوی / دانشگاهی) <span className="req-star">*</span></h2>
        <button type="button" className="btn-ghost" onClick={() => setRows((prev) => [...prev, emptyRow()])}>+ افزودن ردیف</button>
      </div>
      <p className="mb-3 text-xs text-slate-500">حداقل یک ردیف تحصیلی الزامی است. ردیف‌های خالی هنگام ذخیره نادیده گرفته می‌شوند.</p>

      {rows.length === 0 && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">هنوز ردیفی اضافه نشده است.</div>}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <label className="label">نوع <span className="req-star">*</span></label>
                <select className="input" value={row.type} onChange={(e) => update(index, { type: e.target.value as EducationType, level: "" })}>
                  {Object.entries(educationTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">مقطع <span className="req-star">*</span></label>
                <select className="input" value={row.level} onChange={(e) => update(index, { level: e.target.value })}>
                  <option value="">انتخاب کنید</option>
                  {educationLevelOptions[row.type].map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">رشته / علوم</label>
                <input className="input" value={row.field} onChange={(e) => update(index, { field: e.target.value })} maxLength={120} />
              </div>
              <div>
                <label className="label">مرکز تحصیل</label>
                <input className="input" value={row.centerName} onChange={(e) => update(index, { centerName: e.target.value })} maxLength={180} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="label">مدرک دریافتی</label>
                  <input className="input" value={row.certificate} onChange={(e) => update(index, { certificate: e.target.value })} maxLength={180} />
                </div>
                <button type="button" className="btn-danger" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} title="حذف ردیف">حذف</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
