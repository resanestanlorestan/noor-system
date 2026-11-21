import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSiteSettings } from "@/lib/site-settings";
import { LogoManager } from "@/components/logo-manager";

export const dynamic = "force-dynamic";

// الحاقیهٔ ۲.۱۸.۵ — بخش «لوگوی سایت» داشبورد؛ فقط با مجوز cms.manage
export default async function LogoPage() {
  const user = await requireUser();
  if (!(await can(user, "cms.manage"))) redirect("/dashboard");
  const settings = await getSiteSettings();
  let updatedByName: string | null = null;
  if (settings.logoUpdatedAt) {
    const [row] = await db.select({ name: users.fullName })
      .from(siteSettings).leftJoin(users, eq(siteSettings.logoUpdatedBy, users.id)).limit(1);
    updatedByName = row?.name ?? null;
  }
  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>لوگوی سایت</b></div>
    <div className="ws-page-head"><div><h1>لوگوی سایت</h1><p>آپلود، پیش‌نمایش و تغییر لوگوی سایت؛ لوگوی جدید خودکار در منو، صفحات ورود و آیکن مرورگر جایگزین می‌شود.</p></div></div>
    <LogoManager logoUrl={settings.logoUrl} logoMime={settings.logoMime} logoName={settings.logoName} logoSize={settings.logoSize} logoUpdatedAt={settings.logoUpdatedAt} logoWidth={settings.logoWidth} logoHeight={settings.logoHeight} updatedByName={updatedByName} />
  </>;
}
