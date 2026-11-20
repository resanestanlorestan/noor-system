import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { MessageSquareText, RotateCcw, Send, Settings2, History, MailWarning } from "lucide-react";
import { db } from "@/db";
import { smsSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { currentSmsSource } from "@/lib/messaging";
import { listSmsHistory, listSmsTemplates, smsCategoryTitle, smsHistoryTotals, smsStatusLabels, smsTemplateTitle, type SmsHistoryStatus } from "@/lib/sms-admin";
import { smsCategoryLabels } from "@/lib/sms-templates";
import { resetSmsTemplateAction, resendSmsAction, toggleSmsTemplateAction } from "@/app/actions/sms";
import { SmsSettingsForm, SmsTemplateEditor, SmsTestForm } from "@/components/sms-forms";
import { FlashNotice } from "@/components/flash-notice";
import { popFlash } from "@/lib/flash";
import { faDate, faNumber } from "@/lib/format";
import { getContent } from "@/lib/site-content";

const statusClass = { queued: "status-pending", sent: "status-approved", failed: "status-rejected", local: "status-draft" } as const;
const tabs = [
  { key: "templates", label: "قالب‌های پیامک", icon: MessageSquareText },
  { key: "settings", label: "تنظیمات ارسال و تست", icon: Settings2 },
  { key: "history", label: "تاریخچهٔ پیامک‌ها", icon: History },
] as const;
const tabKeys = tabs.map((tab) => tab.key);

export default async function SmsManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string; m?: string; status?: string; category?: string; phone?: string; page?: string }> }) {
  const content = await getContent();
  const user = await requireUser();
  if (!(await can(user, "sms.manage"))) redirect("/dashboard");
  const query = await searchParams;
  const tab = tabKeys.includes(query.tab as (typeof tabKeys)[number]) ? (query.tab as (typeof tabKeys)[number]) : "templates";
  const flash = popFlash(query.m);
  const [source, templates, totals] = await Promise.all([currentSmsSource(), tab === "templates" || tab === "settings" ? listSmsTemplates() : Promise.resolve([]), smsHistoryTotals()]);
  const settings = tab === "settings" ? await (async () => {
    const [row] = await db.select().from(smsSettings).where(eq(smsSettings.id, "default")).limit(1);
    return { provider: row?.provider ?? "", username: row?.username ?? "", sender: row?.sender ?? "", enabled: row?.enabled ?? false, hasSecret: !!row?.secretCipher };
  })() : null;
  const sourceText = source ? `${source.label} — تنظیمات ${source.source === "database" ? "پنل مدیریت" : "متغیرهای محیطی"}` : "حالت محلی: پیامک‌ها فقط در صندوق پیام‌ها ذخیره می‌شوند";

  const history = tab === "history" ? await (async () => {
    const status = query.status && Object.hasOwn(smsStatusLabels, query.status) ? query.status as SmsHistoryStatus : undefined;
    const category = query.category && Object.hasOwn(smsCategoryLabels, query.category) ? query.category as keyof typeof smsCategoryLabels : undefined;
    const page = Math.max(1, Math.min(200, Number(query.page || "1") || 1));
    const data = await listSmsHistory({ status, category, phone: query.phone }, 50, (page - 1) * 50);
    return { status, category, phone: query.phone || "", page, ...data };
  })() : null;

  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>مدیریت پیامک‌ها</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پیام‌های سامانه</div><h1>{content.text("pages.sms.title")}</h1><p>{content.text("pages.sms.sub")}</p></div></div>
    {flash && <FlashNotice message={flash} />}
    <section className="ws-panel sms-status-panel">
      <div className="ws-panel-head"><div><span>وضعیت فعلی ارسال</span><h2>{source ? `ارسال واقعی فعال است: ${sourceText}` : "حالت محلی — پنل پیامکی متصل نیست"}</h2><p>{faNumber(totals.total)} پیامک ثبت‌شده · {faNumber(totals.sent)} موفق · {faNumber(totals.failed)} ناموفق · {faNumber(totals.queued)} در صف · {faNumber(totals.local)} محلی</p></div><span className="panel-outline-icon"><MessageSquareText size={18} /></span></div>
      <nav className="sms-tabs">{tabs.map((item) => { const Icon = item.icon; return <Link key={item.key} href={`/sms?tab=${item.key}`} className={`sms-tab ${tab === item.key ? "active" : ""}`}><Icon size={16} /> {item.label}</Link>; })}</nav>
    </section>

    {tab === "templates" && <section className="ws-panel ws-list-panel">
      <div className="ws-panel-head"><div><span>قالب‌های متن و متغیرهای پویا</span><h2>قالب‌های پیامک سامانه</h2><p>متن هر قالب با متغیرهای پویا (مانند نام کاربر یا کد تأیید) ساخته می‌شود؛ ویرایش شما بدون تغییر کد از همان لحظه اعمال می‌شود.</p></div></div>
      <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>دسته</th><th>قالب</th><th>وضعیت</th><th>متن</th><th>عملیات</th></tr></thead><tbody>
        {templates.map((item) => <tr key={item.key}>
          <td><span className="table-subtle">{smsCategoryLabels[item.category]}</span></td>
          <td><strong>{item.label}</strong><small className="table-subtle break-text">{item.hint}</small><small className="table-subtle" dir="ltr">{item.key}</small></td>
          <td><span className={`status-badge ${item.enabled ? "status-approved" : "status-rejected"}`}><i />{item.enabled ? "فعال" : "غیرفعال"}</span><small className="table-subtle">{item.custom ? "متن دلخواه مدیر" : "متن پیش‌فرض"}</small>{item.updatedAt && <small className="table-subtle">{faDate(item.updatedAt, true)}</small>}</td>
          <td><details className="outbox-body"><summary>نمایش متن</summary><pre>{item.body}</pre></details></td>
          <td><div className="user-actions">
            <SmsTemplateEditor def={{ key: item.key, category: item.category, label: item.label, hint: item.hint, variables: item.variables, defaultBody: item.body }} body={item.body} />
            <form action={toggleSmsTemplateAction}><input type="hidden" name="templateKey" value={item.key} /><button className="table-link">{item.enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>
            {item.custom && <form action={resetSmsTemplateAction}><input type="hidden" name="templateKey" value={item.key} /><button className="table-link" title="بازگشت به متن پیش‌فرض"><RotateCcw size={13} /> پیش‌فرض</button></form>}
          </div></td>
        </tr>)}
      </tbody></table></div>
      <p className="table-footnote">قالب غیرفعال مثل «ویرایش‌نشده» رفتار می‌شود و سامانه متن پیش‌فرض رجیستری را می‌فرستد؛ افزودن نوع پیامک جدید فقط با افزودن یک ورودی به رجیستری در کد انجام می‌شود و بقیه از همین‌جا مدیریت می‌شود.</p>
    </section>}

    {tab === "settings" && <section className="case-detail-grid">
      <div className="ws-panel"><div className="ws-panel-head"><div><span>اتصال به سرویس‌دهنده</span><h2>تنظیمات پنل پیامکی</h2><p>پیامک‌پنل و کاوه‌نگار پشتیبانی می‌شوند؛ این تنظیمات در صورت فعال‌سازی بر متغیرهای محیطی اولویت دارد.</p></div><span className="panel-outline-icon"><Settings2 size={18} /></span></div>
        {settings && <SmsSettingsForm provider={settings.provider} username={settings.username} sender={settings.sender} enabled={settings.enabled} hasSecret={settings.hasSecret} />}
      </div>
      <div className="ws-panel"><div className="ws-panel-head"><div><span>ارسال آزمایشی</span><h2>تست ارسال پیامک</h2><p>درستی تنظیمات و متن را با یک ارسال واقعی بسنجید؛ نتیجه (موفق/ناموفق/محلی) همان‌جا نمایش داده می‌شود.</p></div><span className="panel-outline-icon"><Send size={18} /></span></div>
        <SmsTestForm templates={templates.length ? templates.map((item) => ({ key: item.key, label: item.label })) : []} />
      </div>
    </section>}

    {tab === "history" && history && <section className="ws-panel ws-list-panel">
      <div className="ws-panel-head"><div><span>همهٔ پیامک‌های ارسالی سامانه</span><h2>تاریخچهٔ پیامک‌ها</h2><p>{faNumber(history.total)} پیامک در نتایج — شماره گیرنده، متن، زمان و وضعیت ارسال</p></div><span className="panel-outline-icon"><History size={18} /></span></div>
      <form className="case-filters audit-filters" action="/sms">
        <input type="hidden" name="tab" value="history" />
        <select name="status" defaultValue={history.status || ""} aria-label="وضعیت ارسال"><option value="">همهٔ وضعیت‌ها</option>{Object.entries(smsStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select name="category" defaultValue={history.category || ""} aria-label="دستهٔ کاربرد"><option value="">همهٔ دسته‌ها</option>{Object.entries(smsCategoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input name="phone" defaultValue={history.phone} maxLength={15} dir="ltr" placeholder="جست‌وجوی شماره" aria-label="جست‌وجوی شماره گیرنده" />
        <button className="secondary-button">اعمال فیلتر</button>
        <Link href="/sms?tab=history" className="clear-filter">پاک کردن</Link>
      </form>
      <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>گیرنده</th><th>دسته / قالب</th><th>وضعیت</th><th>متن پیام</th><th /></tr></thead><tbody>
        {history.rows.map((row) => <tr key={row.id}>
          <td>{faDate(row.createdAt, true)}</td>
          <td dir="ltr">{row.recipient}</td>
          <td><span className="table-subtle">{smsCategoryTitle(row.category)}</span><small className="table-subtle">{smsTemplateTitle(row.templateKey)}</small></td>
          <td><span className={`status-badge ${statusClass[row.status]}`}>{smsStatusLabels[row.status]}</span>{row.error && <small className="table-subtle break-text" dir="ltr">{row.error}</small>}</td>
          <td><details className="outbox-body"><summary>نمایش</summary><pre>{row.body}</pre></details></td>
          <td>{row.status === "failed" && <form action={resendSmsAction}><input type="hidden" name="messageId" value={row.id} /><button className="table-link" title="قرار دادن در صف و تلاش دوباره"><MailWarning size={13} /> ارسال مجدد</button></form>}</td>
        </tr>)}
      </tbody></table></div>
      {!history.rows.length && <div className="empty-state"><span><History size={22} /></span><strong>پیامکی در نتایج نیست</strong><p>با تغییر فیلترها دوباره بررسی کنید یا از تب تنظیمات یک پیامک آزمایشی بفرستید.</p></div>}
      {history.total > 50 && <p className="table-footnote">صفحهٔ {faNumber(history.page)} از {faNumber(Math.ceil(history.total / 50))} — {history.page < Math.ceil(history.total / 50) && <Link href={`/sms?tab=history&page=${history.page + 1}${history.status ? `&status=${history.status}` : ""}${history.category ? `&category=${history.category}` : ""}`}>صفحهٔ بعد</Link>}</p>}
    </section>}
  </>;
}
