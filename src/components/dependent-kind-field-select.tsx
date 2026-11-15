"use client";

// الحاقیهٔ ۲.۱۲.۰ — جفت فهرست کشویی وابسته «نوع سابقه ← رشته».
// با انتخاب «تدریس» یا «داوری»، فهرست رشته‌های مرتبط (هشت‌گانهٔ استاندارد
// سامانه) زیر آن باز می‌شود؛ برای انواع دیگر سابقه، فیلد رشته پنهان است.

import { useState } from "react";
import { activityRecordKindLabels, courseFieldOptions, type ActivityRecordKind } from "@/lib/constants";

const FIELD_KINDS: ActivityRecordKind[] = ["teaching", "judging"];

export function DependentKindFieldSelect({ defaults }: { defaults?: { kind?: string; field?: string } }) {
  const [kind, setKind] = useState(defaults?.kind || "");
  const showField = FIELD_KINDS.includes(kind as ActivityRecordKind);
  return <>
    <label>نوع سابقه<select name="kind" required value={kind} onChange={(event) => setKind(event.target.value)}><option value="">انتخاب کنید</option>{Object.entries(activityRecordKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {showField && <label>رشته (وابسته به نوع سابقه)<select name="field" defaultValue="">{Object.entries(courseFieldOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
  </>;
}
