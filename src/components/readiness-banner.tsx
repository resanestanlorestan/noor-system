// الحاقیهٔ ۲.۱۹.۳ — بنر راهنمای بررسی هوشمند آمادگی ارسال.
// Server Component؛ پس از ریدایرکت ?check=1 روی مرحلهٔ مشکل‌دار رندر
// می‌شود و برای هر مورد ناقص، راهنمای دقیق همان فیلد/بخش را نشان می‌دهد.
// موارد ناقص از موتور همان مرحله می‌آید (requested.missing) تا هیچ مسیر
// موازی‌ای با گارد سرور هم‌خوان نباشد.

import { ShieldCheck } from "lucide-react";
import { faNumber } from "@/lib/format";
import { CASE_STEPS, readinessHint } from "@/lib/case-steps";

export function ReadinessBanner({ stepNumber, items }: { stepNumber: number; items: string[] }) {
  if (!items.length) return null;
  const isReview = stepNumber === CASE_STEPS.length;
  return <div className="readiness-banner" role="alert">
    <strong><ShieldCheck size={15} /> بررسی آمادگی ارسال — {faNumber(items.length)} مورد در این مرحله نیازمند اصلاح است</strong>
    <ul>{items.map((label) => <li key={label}><b>{label}:</b><span>{readinessHint(label)}</span></li>)}</ul>
    <small>پس از اصلاح و ذخیرهٔ همین مرحله، به مرحلهٔ «بازبینی و ارسال» برگردید و دوباره دکمهٔ «بررسی آمادگی ارسال» را بزنید تا همهٔ مراحل از نو کنترل شود.{isReview ? " پاسخ درخواست اصلاح از صفحهٔ جزئیات پرونده ثبت می‌شود." : ""}</small>
  </div>;
}
