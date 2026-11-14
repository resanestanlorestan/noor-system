import { redirect } from "next/navigation";
import { getCaseForUser } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { computeCaseSteps, loadCaseStepFacts } from "@/lib/case-steps";

const EDITABLE_STATUSES = ["draft", "completing", "needs_correction"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];

// الحاقیهٔ ۲.۱۰.۰ — ویرایش تک‌صفحه‌ای قدیمی با ویزارد مرحله‌ای جایگزین شده است؛
// لینک‌ها و نشانی‌های قدیمی به مرحلهٔ جاری همان پرونده هدایت می‌شوند.
export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); const { id } = await params;
  const row = await getCaseForUser(user, id);
  if (!row) redirect("/cases");
  if (!EDITABLE_STATUSES.includes(row.application.status as EditableStatus) || !(await can(user, "cases.edit"))) redirect(`/cases/${id}`);
  const facts = await loadCaseStepFacts(row.activist, row.application.status, id);
  const plan = computeCaseSteps(facts);
  redirect(`/cases/${id}/steps/${plan.activeIndex + 1}`);
}
