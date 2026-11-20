import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { History, PhoneCall, Settings2, UserPlus } from "lucide-react";
import { db } from "@/db";
import { managerSmsEvents, managerSmsRecipients, managerSmsSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { currentSmsSource } from "@/lib/messaging";
import { syncManagerRecipients } from "@/lib/manager-sms";
import { syncManagersAction, restoreManagerRecipientAction } from "@/app/actions/manager-sms";
import { resendManagerEventAction } from "@/app/actions/manager-sms";
import { AddRecipientForm, AutoSettingsForm, DeleteRecipient, EditRecipient, ManagerTestSmsForm, ToggleRecipient } from "@/components/manager-sms-forms";
import { FlashNotice } from "@/components/flash-notice";
import { popFlash } from "@/lib/flash";
import { faDate, faNumber } from "@/lib/format";
import { getContent } from "@/lib/site-content";

// الحاقیهٔ ۲.۱۶.۰ — داشبورد «اطلاع‌رسانی پیامکی مدیران»: فهرست مدیران
// (همگام‌شده از سامانهٔ کاربران + دستی)، کلید ارسال خودکار هنگام ثبت پرونده،
// پیامک آزمایشی و گزارش رویدادها با ارسال مجدد ناموفق‌ها.
const statusClass = { queued: "status-pending", sent: "status-approved", failed: "status-rejected", local: "status-draft" } as const;
const statusLabel = { queued: "در صف", sent: "موفق", failed: "ناموفق", local: "محلی" } as const;

export default async function ManagerSmsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const content = await getContent();
  const user = await requireUser();
  if (!(await can(user, "sms.manage"))) redirect("/dashboard");
  // همگام‌سازی خودکار و ایدم‌پوتنت با هر باز شدن صفحه؛ مدیر تازهٔ سامانهٔ
  // کاربران بدون هیچ کنشی وارد فهرست پیامک می‌شود و اطلاعات تغییرکرده به‌روز می‌شود.
  await syncManagerRecipients(user.id).catch(() => {});
  const query = await searchParams;
  const flash = popFlash(query.m);
  const [allRecipients, events, settingsRow, source] = await Promise.all([
    db.select().from(managerSmsRecipients).orderBy(desc(managerSmsRecipients.createdAt)),
    db.select({
      id: managerSmsEvents.id, phone: managerSmsEvents.phone, message: managerSmsEvents.message,
      status: managerSmsEvents.status, error: managerSmsEvents.error, attempts: managerSmsEvents.attempts,
      createdAt: managerSmsEvents.createdAt, sentAt: managerSmsEvents.sentAt, recipientName: managerSmsRecipients.fullName,
      eventType: managerSmsEvents.eventType,
    }).from(managerSmsEvents).leftJoin(managerSmsRecipients, eq(managerSmsEvents.recipientId, managerSmsRecipients.id)).orderBy(desc(managerSmsEvents.createdAt)).limit(60),
    db.select().from(managerSmsSettings).where(eq(managerSmsSettings.id, "default")).limit(1),
    currentSmsSource(),
  ]);
  const autoCaseCreated = settingsRow[0]?.autoCaseCreated ?? true;
  // الحاقیهٔ ۲.۱۶.۱ — حذف مدیر همگام‌شده یعنی کنارگذاشتن؛ این‌ها در جدول جداگانه با امکان بازگردانی می‌آیند
  const recipients = allRecipients.filter((item) => !item.excluded);
  const excludedRows = allRecipients.filter((item) => item.excluded);
  const activeCount = recipients.filter((item) => item.smsEnabled).length;
  const failedCount = events.filter((item) => item.status === "failed").length;
  const sourceText = source ? `${source.label} — تنظیمات ${source.source === "database" ? "پنل مدیریت" : "متغیرهای محیطی"}` : "حالت محلی: پیامک‌ها فقط در صندوق پیام‌ها ذخیره می‌شوند";

  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>اطلاع‌رسانی پیامکی مدیران</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> اطلاع‌رسانی خودکار</div><h1>{content.text("pages.manager_sms.title")}</h1><p>{content.text("pages.manager_sms.sub")}</p></div></div>
    {flash && <FlashNotice message={flash} />}

    <section className="ws-panel sms-status-panel">
      <div className="ws-panel-head"><div><span>وضعیت اطلاع‌رسانی</span><h2>{autoCaseCreated ? "ارسال خودکار هنگام ثبت پرونده فعال است" : "ارسال خودکار موقتاً خاموش است"}</h2><p>{faNumber(recipients.length)} مدیر در فهرست · {faNumber(activeCount)} دریافت فعال{excludedRows.length > 0 && <> · {faNumber(excludedRows.length)} کنارگذاشته</>} · وضعیت پنل پیامکی: {sourceText}</p></div><span className="panel-outline-icon"><PhoneCall size={18} /></span></div>
    </section>

    <section className="ws-panel detail-section">
      <div className="ws-panel-head"><div><span>مدیران دریافت‌کننده</span><h2>فهرست مدیران سامانهٔ کاربران</h2><p>با هر باز شدن این صفحه فهرست به‌طور خودکار از کاربران سامانه همگام می‌شود؛ کاربران دارای نقش مدیریتی یا سمت سفارشی حاوی «مدیر» اضافه می‌شوند، اطلاعات تغییرکرده به‌روز می‌شود و شمارهٔ تکراری ثبت نمی‌شود. پیامک فقط برای مدیران با وضعیت «فعال» ارسال می‌شود. حذفِ مدیرِ همگام‌شده یعنی کنار گذاشتن او — در همگام‌سازی‌های بعدی دوباره اضافه نمی‌شود و از بخش «مدیران کنارگذاشته» قابل بازگردانی است.</p></div>
        <form action={syncManagersAction}><button className="secondary-button"><UserPlus size={16} /> دریافت و به‌روزرسانی مدیران</button></form></div>
      <AddRecipientForm />
      {recipients.length > 0 && <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>مدیر</th><th>سمت</th><th>شمارهٔ موبایل</th><th>منبع</th><th>دریافت پیامک</th><th>عملیات</th></tr></thead><tbody>
        {recipients.map((item) => <tr key={item.id}>
          <td><strong>{item.fullName}</strong></td>
          <td>{item.position || "—"}</td>
          <td dir="ltr">{item.phone}</td>
          <td><span className="table-subtle">{item.source === "auto" ? "همگام‌شده از کاربران" : "ثبت دستی"}</span></td>
          <td><span className={`status-badge ${item.smsEnabled ? "status-approved" : "status-rejected"}`}><i />{item.smsEnabled ? "فعال" : "غیرفعال"}</span></td>
          <td><div className="sms-actions-row">
            <ToggleRecipient id={item.id} enabled={item.smsEnabled} name={item.fullName} />
            <EditRecipient recipient={{ id: item.id, fullName: item.fullName, position: item.position, phone: item.phone, source: item.source }} />
            <DeleteRecipient id={item.id} name={item.fullName} source={item.source} />
          </div></td>
        </tr>)}
      </tbody></table></div>}
      {excludedRows.length > 0 && <>
        <div className="ws-panel-head" style={{ marginTop: 18 }}><div><span>مدیران کنارگذاشته</span><h2>از فهرست پیامک کنار گذاشته‌شده‌ها</h2><p>این مدیران با «حذف» از فهرست بالا کنار گذاشته شده‌اند؛ در همگام‌سازی‌ها دوباره اضافه نمی‌شوند و پیامکی دریافت نمی‌کنند. برای بازگشت به فهرست، بازگردانی کنید.</p></div></div>
        <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>مدیر</th><th>سمت</th><th>شمارهٔ موبایل</th><th>عملیات</th></tr></thead><tbody>
          {excludedRows.map((item) => <tr key={item.id}>
            <td><strong>{item.fullName}</strong></td>
            <td>{item.position || "—"}</td>
            <td dir="ltr">{item.phone}</td>
            <td><form action={restoreManagerRecipientAction}><input type="hidden" name="recipientId" value={item.id} /><button className="table-link">بازگردانی</button></form></td>
          </tr>)}
        </tbody></table></div>
      </>}
    </section>

    <section className="ws-panel detail-section">
      <div className="ws-panel-head"><div><span>تنظیمات سامانهٔ پیامکی</span><h2>ارسال خودکار و پیامک آزمایشی</h2><p>اعتبار اتصال پنل پیامکی (کلید API) به‌صورت رمزنگاری‌شده در «مدیریت پیامک‌ها» نگه داشته می‌شود و این بخش از همان اتصال استفاده می‌کند.</p></div><span className="panel-outline-icon"><Settings2 size={18} /></span></div>
      <AutoSettingsForm autoCaseCreated={autoCaseCreated} />
      <ManagerTestSmsForm />
      <p className="side-description">ویرایش اطلاعات اتصال پنل (سرویس‌دهنده، نام کاربری، کلید API و شمارهٔ فرستنده): <Link href="/sms?tab=settings" className="table-link">مدیریت پیامک‌ها ← تنظیمات ارسال و تست</Link></p>
    </section>

    <section className="ws-panel detail-section">
      <div className="ws-panel-head"><div><span>گزارش پیامک‌ها</span><h2>رویدادهای اطلاع‌رسانی مدیران</h2><p>۶۰ رویداد آخر: زمان ارسال، گیرنده، متن پیامک، وضعیت و خطای پنل پیامکی؛ پیامک‌های ناموفق قابل تلاش دوباره هستند.</p></div><span className="panel-outline-icon"><History size={18} /></span></div>
      {failedCount > 0 && <p className="side-description">{faNumber(failedCount)} پیامک ناموفق در این فهرست است؛ با «تلاش دوباره» پیامک از طریق پنل دوباره ارسال می‌شود.</p>}
      {events.length === 0 && <p className="side-description">هنوز رویدادی ثبت نشده است؛ با ثبت (ارسال برای بررسی) اولین پرونده، پیامک مدیران در همین جدول دیده می‌شود.</p>}
      {events.length > 0 && <div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>زمان</th><th>مدیر</th><th>شماره</th><th>متن پیامک</th><th>وضعیت</th><th>خطا / تلاش</th><th>عملیات</th></tr></thead><tbody>
        {events.map((item) => <tr key={item.id}>
          <td><strong>{faDate(item.sentAt ?? item.createdAt, true)}</strong><small className="table-subtle">{item.sentAt ? "زمان ارسال" : "زمان ثبت رویداد"}</small></td>
          <td>{item.recipientName ?? "—"}</td>
          <td dir="ltr">{item.phone}</td>
          <td><span className="break-text">{item.message}</span></td>
          <td><span className={`status-badge ${statusClass[item.status]}`}><i />{statusLabel[item.status]}</span></td>
          <td><small className="table-subtle break-text">{item.error ?? "—"}</small><small className="table-subtle">تلاش: {faNumber(item.attempts)}</small></td>
          <td>{item.status === "failed" && <form action={resendManagerEventAction}><input type="hidden" name="eventId" value={item.id} /><button className="table-link">تلاش دوباره</button></form>}</td>
        </tr>)}
      </tbody></table></div>}
      <p className="side-description">تاریخچهٔ کامل همهٔ پیامک‌های سامانه (با فیلتر وضعیت و شماره): <Link href="/sms?tab=history" className="table-link">مدیریت پیامک‌ها ← تاریخچهٔ پیامک‌ها</Link></p>
    </section>
  </>;
}
