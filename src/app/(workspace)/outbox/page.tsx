import { count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Inbox, Mail, MessageSquare } from "lucide-react";
import { db } from "@/db";
import { messageOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { currentSmsSource, emailConfigured } from "@/lib/messaging";
import { faDate, faNumber } from "@/lib/format";
import { getContent } from "@/lib/site-content";

const statusLabels = { queued: "در صف ارسال", sent: "ارسال شد", failed: "ارسال ناموفق", local: "ذخیره محلی" } as const;
const statusClass = { queued: "status-pending", sent: "status-approved", failed: "status-rejected", local: "status-draft" } as const;

export default async function OutboxPage() {
  const content = await getContent();
  const user = await requireUser();
  if (!(await can(user, "outbox.view"))) redirect("/dashboard");
  const [rows, totals] = await Promise.all([
    db.select().from(messageOutbox).orderBy(desc(messageOutbox.createdAt)).limit(100),
    db.select({ total: count() }).from(messageOutbox),
  ]);
  const smsSource = await currentSmsSource();
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>صندوق پیام‌ها</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> اعلان‌های خروجی</div><h1>{content.text("pages.outbox.title")}</h1><p>{content.text("pages.outbox.sub")}</p></div></div>
    <section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>حالت ارسال کنونی</span><h2>{emailConfigured() ? "ارسال واقعی ایمیل فعال است" : "حالت محلی: پیام‌ها فقط همینجا ذخیره می‌شوند"}</h2><p>{emailConfigured() ? "ایمیل از طریق SMTP تنظیم‌شده ارسال می‌شود." : "برای ارسال واقعی، متغیرهای SMTP_ را در .env تنظیم کنید."}{smsSource ? ` پیامک از طریق ${smsSource.label} فعال است (${smsSource.source === "database" ? "تنظیمات پنل" : "متغیرهای محیطی"}).` : " پیامک در حالت محلی است."}</p></div><span className="panel-outline-icon"><Inbox size={18} /></span></div>
      <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>کانال</th><th>گیرنده</th><th>موضوع</th><th>وضعیت</th><th>متن پیام</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{faDate(row.createdAt, true)}</td><td><span className="table-channel">{row.channel === "email" ? <><Mail size={14} /> ایمیل</> : <><MessageSquare size={14} /> پیامک</>}</span></td><td dir="ltr">{row.recipient}</td><td>{row.subject || "—"}</td><td><span className={`status-badge ${statusClass[row.status]}`}>{statusLabels[row.status]}</span>{row.error && <small className="table-subtle break-text" dir="ltr">{row.error}</small>}</td><td><details className="outbox-body"><summary>نمایش</summary><pre>{row.body}</pre></details></td></tr>)}</tbody></table></div>
      {!rows.length && <div className="empty-state"><span><Inbox size={22} /></span><strong>پیامی ثبت نشده</strong><p>به‌محض وقوع رویدادهای اعلانی (تغییر وضعیت پرونده، بازیابی گذرواژه و...) پیام‌ها اینجا دیده می‌شوند.</p></div>}
      <p className="table-footnote">{faNumber(totals[0]?.total || 0)} پیام (۱۰۰ مورد آخر) · پیام‌های قدیمی‌تر از ۳۰ روز به‌صورت خودکار حذف می‌شوند.</p>
    </section>
  </>;
}
