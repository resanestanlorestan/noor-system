// Overdue-cases Excel export (خروجی اکسل پرونده‌های معوق — Release 2.4، فاز ۱).
//
// Pure builders shared by the /api/exports/overdue route and the feature
// tests: column layout, responsible-person labels and the header meta rows.
// The route layer only handles auth, workbook assembly and the audit row.
import { maskPhone, resolveRecipient, type OverdueCaseRow } from "@/lib/reminders";
import { faDate, faNumber } from "@/lib/format";
import { statusLabels } from "@/lib/constants";

export const OVERDUE_EXPORT_COLUMNS = [
  "ردیف", "فعال قرآنی", "محدوده (استان / شهرستان)", "وضعیت پرونده", "روزهای انتظار",
  "مسئول یادآوری", "شماره تماس مسئول", "یادآور قبلی", "شناسه پرونده",
] as const;

export const responsibleSourceLabels = { expert: "کارشناس ارجاع‌شده", staff_creator: "ثبت‌کننده سازمانی", activist: "خودِ فعال قرآنی" } as const;

export function overdueFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `noor-overdue-cases-${stamp}.xlsx`;
}

export function overdueThresholdLabel(days: number): string {
  return `${faNumber(days)} روز`;
}

export type OverdueExportRow = (string | number)[];

/** One data row; mirrors the /reminders table (longest-waiting first). */
export function buildOverdueRow(row: OverdueCaseRow, index: number, now = new Date()): OverdueExportRow {
  const recipient = resolveRecipient(row);
  const waiting = Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / 86400000));
  return [
    index + 1,
    row.activistName,
    [row.province, row.county].filter(Boolean).join(" / ") || "—",
    statusLabels[row.status],
    waiting,
    recipient ? responsibleSourceLabels[recipient.source] : "—",
    recipient?.phone ? maskPhone(recipient.phone) : "—",
    row.lastReminderAt ? faDate(row.lastReminderAt, true) : "—",
    row.id,
  ];
}

/** Meta header rows printed above the table. */
export function overdueHeaderRows(thresholdDays: number, count: number, now = new Date()): string[] {
  return [
    "فهرست پرونده‌های معوق سامانه جامع فعالان قرآنی",
    `تاریخ تولید: ${faDate(now, true)}`,
    `تعریف معوق: بدون به‌روزرسانی بیش از ${overdueThresholdLabel(thresholdDays)} در کارتابل «در انتظار بررسی» یا «بررسی تخصصی»`,
    `تعداد ردیف‌ها: ${faNumber(count)}`,
  ];
}
