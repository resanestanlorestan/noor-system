import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { History, ShieldAlert } from "lucide-react";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { auditActionLabels } from "@/lib/constants";
import { faDate, faNumber, jalaliToIso } from "@/lib/format";

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; from?: string; to?: string; page?: string }> }) {
  const user = await requireUser(); if (!(await can(user, "audit.view"))) redirect("/dashboard");
  const params = await searchParams; const q = (params.q || "").trim().slice(0, 100); const action = (params.action || "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page || "1", 10) || 1));
  const conditions: SQL[] = [];
  if (q) conditions.push(or(ilike(users.fullName, `%${q}%`), ilike(users.email, `%${q}%`))!);
  if (action) conditions.push(eq(auditLogs.action, action));
  const localDate = sql<string>`(${auditLogs.createdAt} at time zone 'Asia/Tehran')::date`;
  let dateError = "";
  const fromIso = params.from ? jalaliToIso(params.from) : null; const toIso = params.to ? jalaliToIso(params.to) : null;
  if (params.from && !fromIso) dateError = "تاریخ شروع شمسی معتبر نیست."; if (params.to && !toIso) dateError = "تاریخ پایان شمسی معتبر نیست.";
  if (!dateError && fromIso && toIso && fromIso > toIso) dateError = "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.";
  if (!dateError) { if (fromIso) conditions.push(sql`${localDate} >= ${fromIso}::date`); if (toIso) conditions.push(sql`${localDate} <= ${toIso}::date`); }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, totals, actions] = dateError ? [[], [{ total: 0 }], []] : await Promise.all([
    db.select({ log: auditLogs, actorName: users.fullName, actorEmail: users.email }).from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id)).where(where).orderBy(desc(auditLogs.createdAt)).limit(25).offset((page - 1) * 25),
    db.select({ total: count() }).from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id)).where(where),
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
  ]);
  const pages = Math.max(1, Math.ceil((totals[0]?.total || 0) / 25));
  const pageLink = (n: number) => { const p = new URLSearchParams(); if (q) p.set("q", q); if (action) p.set("action", action); if (params.from) p.set("from", params.from); if (params.to) p.set("to", params.to); p.set("page", String(n)); return `/audit?${p}`; };
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>رویدادهای حساس</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پایش امنیتی</div><h1>رویدادهای حساس سامانه</h1><p>ثبت ورود، خروج و اقدامات مهم برای پیگیری و حسابرسی</p></div></div>
    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>سوابق سیستمی</span><h2>فهرست رویدادها</h2><p>{faNumber(totals[0]?.total || 0)} رویداد در نتایج</p></div><span className="panel-outline-icon"><ShieldAlert size={18} /></span></div>
      <form className="case-filters audit-filters" action="/audit"><div className="filter-search"><input name="q" defaultValue={q} placeholder="نام یا ایمیل کاربر" aria-label="جست‌وجوی کاربر" /></div><select name="action" defaultValue={action} aria-label="نوع رویداد"><option value="">همه رویدادها</option>{actions.map((item) => <option key={item.action} value={item.action}>{auditActionLabels[item.action] || item.action}</option>)}</select><input name="from" defaultValue={params.from || ""} placeholder="از تاریخ شمسی" /><input name="to" defaultValue={params.to || ""} placeholder="تا تاریخ شمسی" /><button className="secondary-button">اعمال فیلتر</button>{(q || action || params.from || params.to) && <Link href="/audit" className="clear-filter">پاک کردن</Link>}</form>
      {dateError && <div className="form-error report-filter-error" role="alert">{dateError}</div>}
      <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>نوع هدف</th><th>جزئیات</th></tr></thead><tbody>{rows.map(({ log, actorName, actorEmail }) => <tr key={log.id}><td>{faDate(log.createdAt, true)}</td><td>{actorName ? <div className="table-person"><span>{actorName.slice(0, 1)}</span><div><strong>{actorName}</strong><small dir="ltr">{actorEmail}</small></div></div> : <span className="table-subtle">نامشخص</span>}</td><td>{auditActionLabels[log.action] || log.action}</td><td>{log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}</td><td className="break-text">{log.detail || "—"}</td></tr>)}</tbody></table></div>
      {!rows.length && !dateError && <div className="empty-state"><span><History size={22} /></span><strong>رویدادی پیدا نشد</strong><p>با تغییر فیلترها دوباره بررسی کنید.</p></div>}
      <div className="ws-pagination"><span>صفحه {faNumber(page)} از {faNumber(pages)}</span><div>{page > 1 && <Link href={pageLink(page - 1)}>صفحه قبل</Link>}{page < pages && <Link href={pageLink(page + 1)}>صفحه بعد</Link>}</div></div>
    </section>
  </>;
}
