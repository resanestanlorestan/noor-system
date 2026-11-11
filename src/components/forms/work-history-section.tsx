"use client";

// (مرحله پنجم) Work-history section: add/remove rows via server actions with
// useActionState feedback. Jalali dates are validated server-side too.

import { useActionState, useRef } from "react";
import { addWorkHistoryAction, removeWorkHistoryAction } from "@/app/actions/profile";
import { emptyState, type ActionState } from "@/lib/action-state";
import { isoToJalali } from "@/lib/format";

export type WorkRow = {
  id: string;
  title: string;
  employer: string | null;
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

export function WorkHistorySection({ activistId, caseId, rows, editable }: { activistId: string; caseId: string; rows: WorkRow[]; editable: boolean }) {
  const [addState, addFormAction, addPending] = useActionState<ActionState, FormData>(addWorkHistoryAction, emptyState);
  const [removeState, removeFormAction, removePending] = useActionState<ActionState, FormData>(removeWorkHistoryAction, emptyState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="card p-4">
      <h2 className="mb-1 font-semibold">سوابق کاری و شغلی <span className="badge bg-sky-100 text-sky-700">مرحله ۵</span></h2>
      <p className="mb-3 text-xs text-slate-500">شغل‌های قبلی، سمت، کارفرما و بازه زمانی — مستقل از سوابق فعالیت قرآنی.</p>

      <div className="mb-4 space-y-2">
        {rows.length === 0 && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">هنوز سابقه کاری ثبت نشده است.</div>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">{row.title}{row.position ? ` — ${row.position}` : ""}</div>
              <div className="text-xs text-slate-500">
                {row.employer ? `${row.employer} · ` : ""}
                {row.startDate ? `از ${isoToJalali(row.startDate)}` : ""}{row.endDate ? ` تا ${isoToJalali(row.endDate)}` : row.startDate ? " تاکنون" : ""}
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
            <div>
              <label className="label">عنوان شغل / سمت <span className="req-star">*</span></label>
              <input name="title" className="input" maxLength={180} required />
            </div>
            <div>
              <label className="label">کارفرما / سازمان</label>
              <input name="employer" className="input" maxLength={180} />
            </div>
            <div>
              <label className="label">تاریخ شروع (شمسی)</label>
              <input name="startDate" className="input" placeholder="۱۳۹۵/۰۴/۰۱" />
            </div>
            <div>
              <label className="label">تاریخ پایان (شمسی)</label>
              <input name="endDate" className="input" placeholder="۱۳۹۸/۰۶/۳۱" />
            </div>
          </div>
          <div>
            <label className="label">توضیحات</label>
            <textarea name="description" className="input" rows={2} maxLength={2000} />
          </div>
          <button type="submit" className="btn-primary" disabled={addPending}>{addPending ? "در حال ثبت..." : "افزودن سابقه کاری"}</button>
        </form>
      )}
    </div>
  );
}
