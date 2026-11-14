import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Bell, Check, CheckCheck, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { faDate, faNumber } from "@/lib/format";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100);
  const unread = items.filter((item) => !item.readAt).length;
  return <><div className="ws-breadcrumb">صفحه اصلی <span> / </span><b>اعلان‌ها</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> پیام‌های سامانه</div><h1>اعلان‌ها</h1><p>پیگیری رویدادها و تغییرات مربوط به پرونده‌های مجاز</p></div>{unread > 0 && <form action={markAllNotificationsReadAction}><button className="secondary-button"><CheckCheck size={16} /> علامت‌گذاری همه به‌عنوان خوانده‌شده</button></form>}</div><section className="ws-panel ws-list-panel"><div className="ws-panel-head"><div><span>صندوق اعلان</span><h2>آخرین اعلان‌ها</h2><p>{faNumber(unread)} اعلان خوانده‌نشده از ۱۰۰ مورد آخر</p></div><span className="panel-outline-icon"><Bell size={18} /></span></div>{items.length ? <div className="notification-list">{items.map((item) => <div className={`notification-row ${item.readAt ? "" : "unread"}`} key={item.id}><span className="notification-icon"><Bell size={18} /></span><div className="notification-copy"><div><strong>{item.title}</strong>{!item.readAt && <span className="notification-new">جدید</span>}</div><p>{item.body}</p><small>{faDate(item.createdAt, true)}</small><div className="notification-actions">{item.applicationId && <Link href={`/cases/${item.applicationId}`}>مشاهده پرونده <ArrowLeft size={14} /></Link>}{!item.readAt && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={item.id} /><button><Check size={14} /> علامت‌گذاری به‌عنوان خوانده‌شده</button></form>}</div></div></div>)}</div> : <div className="empty-state"><span><Bell size={22} /></span><strong>اعلانی وجود ندارد</strong><p>رویدادهای پرونده‌های مجاز در اینجا نمایش داده می‌شوند.</p></div>}</section></>;
}
