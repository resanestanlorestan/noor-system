import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { siteContent, siteContentRevisions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { siteContentGroups } from "@/lib/site-content";
import { CmsManager } from "@/components/cms-manager";

export const dynamic = "force-dynamic";

// الحاقیهٔ ۲.۱۸.۴ — بخش «مدیریت محتوای سایت» داشبورد؛ فقط با مجوز cms.manage
export default async function CmsPage() {
  const user = await requireUser();
  if (!(await can(user, "cms.manage"))) redirect("/dashboard");
  const [rows, revisions] = await Promise.all([
    db.select().from(siteContent),
    db.select().from(siteContentRevisions).orderBy(desc(siteContentRevisions.changedAt), desc(siteContentRevisions.id)),
  ]);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const history: Record<string, { id: number; value: string; changedAt: string }[]> = {};
  for (const row of revisions) {
    (history[row.key] ??= []).push({ id: row.id, value: row.value, changedAt: row.changedAt.toISOString() });
  }
  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>مدیریت محتوای سایت</b></div>
    <div className="ws-page-head"><div><h1>مدیریت محتوای سایت</h1><p>ویرایش عنوان‌ها، متن‌ها و پیام‌های نمایشی صفحات؛ با پیش‌نمایش زنده، انتشار خودکار و تاریخچهٔ بازگردانی.</p></div></div>
    <CmsManager groups={siteContentGroups} values={values} history={history} />
  </>;
}
