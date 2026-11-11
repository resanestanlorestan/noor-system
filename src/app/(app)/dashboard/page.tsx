import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { statusCountsForScope, scopeCondition } from "@/lib/data";
import { db } from "@/db";
import { activists, applications, notifications, users } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { statusLabels, statusColors } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await requireUser();
  const counts = await statusCountsForScope(user);
  const unread = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  const recent = await db
    .select({ id: applications.id, status: applications.status, updatedAt: applications.updatedAt, firstName: activists.firstName, lastName: activists.lastName, owner: users.fullName })
    .from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .innerJoin(users, eq(applications.createdBy, users.id))
    .where(scopeCondition(user))
    .orderBy(desc(applications.updatedAt))
    .limit(8);

  const total = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">داشبورد</h1>
        <Link href="/cases/new" className="btn-primary">ثبت پرونده جدید</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-sm text-slate-500">کل پرونده‌های محدوده شما</div>
          <div className="mt-1 text-3xl font-bold">{total}</div>
        </div>
        {counts.slice(0, 3).map((c) => (
          <div key={c.status} className="card p-4">
            <div className="text-sm text-slate-500">{statusLabels[c.status]}</div>
            <div className="mt-1 text-3xl font-bold">{c.count}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-sm text-slate-500">اعلان‌های خوانده‌نشده</div>
          <div className="mt-1 text-3xl font-bold">{Number(unread[0]?.count || 0)}</div>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">آخرین پرونده‌ها</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-right">نام متقاضی</th>
              <th className="px-4 py-2 text-right">ثبت‌کننده</th>
              <th className="px-4 py-2 text-right">وضعیت</th>
              <th className="px-4 py-2 text-left">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">هنوز پرونده‌ای در محدوده شما ثبت نشده است.</td></tr>
            )}
            {recent.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.firstName} {row.lastName}</td>
                <td className="px-4 py-2 text-slate-500">{row.owner}</td>
                <td className="px-4 py-2"><span className={`badge ${statusColors[row.status]}`}>{statusLabels[row.status]}</span></td>
                <td className="px-4 py-2 text-left"><Link href={`/cases/${row.id}`} className="text-indigo-600 hover:underline">مشاهده</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
