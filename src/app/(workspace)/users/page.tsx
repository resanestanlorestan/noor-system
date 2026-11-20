import Link from "next/link";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Plus, UsersRound } from "lucide-react";
import { db } from "@/db";
import { activists, applications, counties, customRoles, provinces, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { roleLabels } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/format";
import { DeleteStaleUser, DeleteUser, SweepStale, ToggleUser } from "@/components/management-forms";
import { FlashNotice } from "@/components/flash-notice";
import { popFlash } from "@/lib/flash";
import { getContent } from "@/lib/site-content";
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ m?:string }> }) {
  const content = await getContent();
  const actor=await requireUser(); if (!(await can(actor, "users.manage"))) redirect("/dashboard"); const query=await searchParams; const flash=popFlash(query.m);
  const list=await db.select({id:users.id,fullName:users.fullName,email:users.email,phone:users.phone,role:users.role,customRole:customRoles.label,active:users.active,lastLoginAt:users.lastLoginAt,province:provinces.name,county:counties.name}).from(users).leftJoin(provinces,eq(users.provinceId,provinces.id)).leftJoin(counties,eq(users.countyId,counties.id)).leftJoin(customRoles,eq(users.customRoleId,customRoles.id)).where(and(isNull(users.deletedAt), actor.effectiveRole === "province_admin" && actor.provinceId ? eq(users.provinceId,actor.provinceId) : actor.effectiveRole === "province_admin" ? eq(users.id,actor.id) : undefined)).orderBy(desc(users.createdAt));
  // الحاقیهٔ ۲.۱۷.۱ — حساب‌های حذف‌شده با کد قدیمی که رکورد فعالِ جامانده دارند
  // (کد ملی‌شان قفل مانده) + رکوردهای فعالِ بدون مالکِ زنده و بدون پروندهٔ فعال.
  const staleAccounts = actor.effectiveRole === "super_admin"
    ? await db.select({
        id: users.id, fullName: users.fullName, role: users.role, deletedAt: users.deletedAt,
        leftovers: sql<number>`(select count(*)::int from ${activists} qa where qa.user_id = ${users.id})`,
      }).from(users)
        .where(and(isNotNull(users.deletedAt), sql`exists (select 1 from ${activists} qa where qa.user_id = ${users.id})`))
        .orderBy(desc(users.deletedAt))
    : [];
  const orphanRows = actor.effectiveRole === "super_admin"
    ? await db.select({
        id: activists.id, firstName: activists.firstName, lastName: activists.lastName,
        last4: activists.nationalIdLast4, ownerDeletedAt: users.deletedAt,
      }).from(activists)
        .leftJoin(users, eq(activists.userId, users.id))
        .where(and(
          isNull(activists.deletedAt),
          or(isNull(activists.userId), isNotNull(users.deletedAt)),
          sql`not exists (select 1 from ${applications} app where app.activist_id = ${activists.id} and app.deleted_at is null)`,
        ))
        .orderBy(desc(activists.createdAt))
    : [];
  // الحاقیهٔ ۲.۱۷.۱ — بخش «داده‌های جامانده» فقط برای مدیر ارشد: حساب‌های
  // حذف‌شدهٔ کد قدیمی با رکورد فعالِ جامانده + رکوردهای بدون مالکِ زنده.
  const staleSection = actor.effectiveRole === "super_admin" && (staleAccounts.length > 0 || orphanRows.length > 0)
    ? (<section className="ws-panel ws-list-panel">
        <div className="ws-panel-head">
          <div>
            <span>بازمانده‌های حذف‌های قدیمی</span>
            <h2>داده‌های جامانده</h2>
            <p>حساب‌ها و رکوردهایی که با کد پیش از الحاقیهٔ ۲.۱۷.۰ حذف شده‌اند ولی دادهٔ فعالشان باقی مانده و کد ملی را قفل کرده است.</p>
          </div>
          {orphanRows.length > 0 && <SweepStale />}
        </div>
        {staleAccounts.length > 0 && (
          <div className="ws-table-scroll">
            <table className="ws-table">
              <thead><tr><th>حساب حذف‌شده</th><th>نقش</th><th>زمان حذف</th><th /></tr></thead>
              <tbody>
                {staleAccounts.map((item) => (
                  <tr key={item.id}>
                    <td><div className="table-person"><span>{item.fullName.slice(0, 1)}</span><div><strong>{item.fullName}</strong><small>دادهٔ جامانده: {faNumber(item.leftovers)} رکورد فعال</small></div></div></td>
                    <td>{roleLabels[item.role]}</td>
                    <td>{item.deletedAt ? faDate(item.deletedAt, true) : "—"}</td>
                    <td><DeleteStaleUser id={item.id} name={item.fullName} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orphanRows.length > 0 && (
          <div className="ws-table-scroll">
            <table className="ws-table">
              <thead><tr><th>رکورد فعال بدون مالکِ زنده</th><th>کد ملی</th><th>وضعیت</th></tr></thead>
              <tbody>
                {orphanRows.map((item) => (
                  <tr key={item.id}>
                    <td><div className="table-person"><span>{(item.lastName || item.firstName || "؟").slice(0, 1)}</span><div><strong>{[item.firstName, item.lastName].filter(Boolean).join(" ") || "بدون نام"}</strong></div></div></td>
                    <td dir="ltr">{item.last4 ? `••••${item.last4}` : "—"}</td>
                    <td>{item.ownerDeletedAt ? "مالک حذف‌شده" : "بدون حساب مالک"} — بدون پروندهٔ فعال</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>)
    : null;
  return <>  <div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>مدیریت کاربران</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> دسترسی و نقش‌ها</div><h1>{content.text("pages.users.title")}</h1><p>{content.text("pages.users.sub")}</p></div><Link href="/users/new" className="primary-button"><Plus size={17} /> ایجاد کاربر</Link></div>{flash && <FlashNotice message={flash} />}<section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>کاربران سامانه</span><h2>فهرست کاربران</h2><p>{faNumber(list.length)} کاربر در محدوده مجاز</p></div><span className="panel-outline-icon"><UsersRound size={18} /></span></div><div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>نام کاربر</th><th>نقش</th><th>محدوده</th><th>همراه</th><th>آخرین ورود</th><th>وضعیت</th><th /></tr></thead><tbody>{list.map((item)=><tr key={item.id}><td><div className="table-person"><span>{item.fullName.slice(0,1)}</span><div><strong>{item.fullName}</strong><small dir="ltr">{item.email}</small></div></div></td><td>{item.customRole ? <span className="custom-role-chip" title={`نقش پایه: ${roleLabels[item.role]}`}>{item.customRole}</span> : roleLabels[item.role]}</td><td>{item.province || "کشوری"}{item.county ? ` / ${item.county}` : ""}</td><td dir="ltr">{item.phone || "—"}</td><td>{item.lastLoginAt ? faDate(item.lastLoginAt,true) : "—"}</td><td><span className={`status-badge ${item.active ? "status-approved" : "status-rejected"}`}><i />{item.active ? "فعال" : "غیرفعال"}</span></td><td><div className="user-actions">{item.id !== actor.id && ["province_admin","county_admin","reviewer","specialist"].includes(item.role) && !(actor.effectiveRole === "province_admin" && item.role === "province_admin") && <Link className="table-link" href={`/users/${item.id}/edit`}>ویرایش</Link>}{item.id !== actor.id && item.role !== "super_admin" && !(actor.effectiveRole === "province_admin" && item.role === "province_admin") && <ToggleUser id={item.id} active={item.active} />}{actor.effectiveRole === "super_admin" && item.id !== actor.id && item.role !== "super_admin" && <DeleteUser id={item.id} name={item.fullName} />}</div></td></tr>)}</tbody></table></div></section>{staleSection}</>;
}
