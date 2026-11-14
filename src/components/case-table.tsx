import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { statusLabels, type AppStatus } from "@/lib/constants";
import { faDate } from "@/lib/format";
import { DeleteCase, RestoreCase } from "@/components/management-forms";
// الحاقیهٔ ۲.۱۰.۴ — ستون deletedAt برای برچسب «حذف‌شده از فهرست فعال» و prop
// «admin» (فقط مدیر کل) برای نمایش کنش‌های حذف/بازیابی؛ گارد واقعی در سرور است.
export type CaseListRow = { id: string; firstName: string; lastName: string; nationalIdLast4: string | null; status: AppStatus; createdAt: Date; deletedAt?: Date | null; province: string | null; county: string | null };
export function StatusBadge({ status }: { status: AppStatus }) { return <span className={`status-badge status-${status}`}><i />{statusLabels[status]}</span>; }
export function CaseTable({ rows, empty = "هنوز پرونده‌ای در این فهرست وجود ندارد.", admin = false }: { rows: CaseListRow[]; empty?: string; admin?: boolean }) {
  if (!rows.length) return <div className="empty-state"><span><FileText size={22} /></span><strong>پرونده‌ای پیدا نشد</strong><p>{empty}</p></div>;
  return <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>نام و نام خانوادگی</th><th>کد ملی</th><th>استان / شهرستان</th><th>وضعیت پرونده</th><th>تاریخ ثبت</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="table-person"><span>{row.firstName.slice(0, 1)}</span><div><strong>{row.firstName} {row.lastName}</strong><small>پرونده الکترونیکی</small></div></div></td><td dir="ltr" className="masked-national">{row.nationalIdLast4 ? `••••••${row.nationalIdLast4}` : "—"}</td><td>{row.province || "—"}<span className="table-subtle"> {row.county ? ` / ${row.county}` : ""}</span></td><td>{row.deletedAt ? <span className="status-badge status-rejected"><i />حذف‌شده از فهرست فعال</span> : <StatusBadge status={row.status} />}</td><td>{faDate(row.createdAt)}</td><td><div className="user-actions">{admin && (row.deletedAt ? <><RestoreCase id={row.id} name={`${row.firstName} ${row.lastName}`} /><DeleteCase id={row.id} name={`${row.firstName} ${row.lastName}`} mode="total" /></> : <DeleteCase id={row.id} name={`${row.firstName} ${row.lastName}`} mode="bank" />)}<Link className="table-link" href={`/cases/${row.id}`}>مشاهده <ArrowLeft size={14} /></Link></div></td></tr>)}</tbody></table></div>;
}
