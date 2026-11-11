"use client";

// (مرحله سوم) Read-only education rows on the case detail page with per-row
// removal through the profile actions.

import { useActionState } from "react";
import { removeEducationRowAction } from "@/app/actions/profile";
import { emptyState, type ActionState } from "@/lib/action-state";

export type EducationRowView = {
  id: string;
  type: "seminary" | "university";
  level: string;
  field: string | null;
  centerName: string | null;
  certificate: string | null;
};

export function EducationRowsSection({ activistId, caseId, rows, editable }: { activistId: string; caseId: string; rows: EducationRowView[]; editable: boolean }) {
  const [removeState, removeFormAction, removePending] = useActionState<ActionState, FormData>(removeEducationRowAction, emptyState);

  return (
    <div className="card p-4">
      <h2 className="mb-3 font-semibold">اطلاعات تحصیلی (حوزوی / دانشگاهی)</h2>
      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">هنوز سطر تحصیلی ثبت نشده است.</div>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div>
              <span className="badge bg-slate-100 text-slate-700">{row.type === "seminary" ? "حوزوی" : "دانشگاهی"}</span>
              <span className="ms-2 font-medium">{row.level}</span>
              {row.field && <span className="ms-2 text-slate-500">· {row.field}</span>}
              {row.centerName && <span className="ms-2 text-slate-500">· {row.centerName}</span>}
              {row.certificate && <span className="ms-2 text-slate-500">· مدرک: {row.certificate}</span>}
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
      {removeState.error && <div className="alert-error mt-3">{removeState.error}</div>}
    </div>
  );
}
