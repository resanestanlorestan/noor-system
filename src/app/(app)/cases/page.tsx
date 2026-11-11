import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { scopeCondition } from "@/lib/data";
import { db } from "@/db";
import { activists, applications } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { statusLabels, statusColors } from "@/lib/constants";

export default async function CasesPage() {
  const user = await requireUser();
  const rows = await db
    .select({ id: applications.id, status: applications.status, createdAt: applications.createdAt, firstName: activists.firstName, lastName: activists.lastName, countyId: activists.countyId })
    .from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .where(scopeCondition(user))
    .orderBy(desc(applications.updatedAt))
    .limit(100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">پرونده‌ها</h1>
        <Link href="/cases/new" className="btn-primary">ثبت پرونده جدید</Link>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-right">نام متقاضی</th>
              <th className="px-4 py-2 text-right">وضعیت</th>
              <th className="px-4 py-2 text-right">تاریخ ایجاد</th>
              <th className="px-4 py-2 text-left">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">پرونده‌ای یافت نشد.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.firstName} {row.lastName}</td>
                <td className="px-4 py-2"><span className={`badge ${statusColors[row.status]}`}>{statusLabels[row.status]}</span></td>
                <td className="px-4 py-2 text-slate-500">{row.createdAt.toLocaleDateString("fa-IR")}</td>
                <td className="px-4 py-2 text-left"><Link href={`/cases/${row.id}`} className="text-indigo-600 hover:underline">مشاهده</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
