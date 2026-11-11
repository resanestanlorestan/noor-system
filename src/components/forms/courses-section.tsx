"use client";

// (مرحله پنجم) Courses/trainings section with jalali completion date + hours.

import { useActionState, useRef } from "react";
import { addCourseAction, removeCourseAction } from "@/app/actions/profile";
import { emptyState, type ActionState } from "@/lib/action-state";
import { isoToJalali } from "@/lib/format";

export type CourseRow = {
  id: string;
  title: string;
  provider: string | null;
  completedDate: string | null;
  hours: number | null;
};

export function CoursesSection({ activistId, caseId, rows, editable }: { activistId: string; caseId: string; rows: CourseRow[]; editable: boolean }) {
  const [addState, addFormAction, addPending] = useActionState<ActionState, FormData>(addCourseAction, emptyState);
  const [removeState, removeFormAction, removePending] = useActionState<ActionState, FormData>(removeCourseAction, emptyState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="card p-4">
      <h2 className="mb-1 font-semibold">دوره‌ها و کارگاه‌های گذرانده‌شده <span className="badge bg-sky-100 text-sky-700">مرحله ۵</span></h2>
      <p className="mb-3 text-xs text-slate-500">دوره‌های آموزشی، کارگاه‌ها و مهارت‌افزایی با تعداد ساعت و گواهینامه.</p>

      <div className="mb-4 space-y-2">
        {rows.length === 0 && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">هنوز دوره‌ای ثبت نشده است.</div>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">{row.title}</div>
              <div className="text-xs text-slate-500">
                {row.provider ? `${row.provider} · ` : ""}
                {row.completedDate ? `${isoToJalali(row.completedDate)}` : ""}{row.hours ? ` · ${row.hours} ساعت` : ""}
              </div>
            </div>
            {editable && (
              <form action={removeFormAction}>
                <input type="hidden" name="rowId" value={row.id} />
                <input type="hidden" name="activistId" value={activistId} />
                <input type="hidden" name="caseId" value={caseId} />
                <button type="submit" className="btn-danger" disabled={removePending}>حذف</button>
              </form>
            )}
          </div>
        ))}
      </div>

      {removeState.error && <div className="alert-error mb-3">{removeState.error}</div>}

      {editable && (
        <form ref={formRef} action={async (data: FormData) => { await addFormAction(data); formRef.current?.reset(); }} className="space-y-3">
          <input type="hidden" name="activistId" value={activistId} />
          <input type="hidden" name="caseId" value={caseId} />
          {addState.error && <div className="alert-error">{addState.error}</div>}
          {addState.success && <div className="alert-success">{addState.success}</div>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="label">عنوان دوره <span className="req-star">*</span></label>
              <input name="title" className="input" maxLength={180} required />
            </div>
            <div>
              <label className="label">برگزارکننده</label>
              <input name="provider" className="input" maxLength={180} />
            </div>
            <div>
              <label className="label">تاریخ تکمیل (شمسی)</label>
              <input name="completedDate" className="input" placeholder="۱۴۰۳/۰۷/۱۵" />
            </div>
            <div>
              <label className="label">ساعت</label>
              <input name="hours" className="input" inputMode="numeric" maxLength={4} />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={addPending}>{addPending ? "در حال ثبت..." : "افزودن دوره"}</button>
        </form>
      )}
    </div>
  );
}
