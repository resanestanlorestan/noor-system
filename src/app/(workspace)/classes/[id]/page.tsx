// الحاقیهٔ ۲.۱۹.۰ — صفحهٔ مدیریت یک کلاس: برای ادمین همهٔ تب‌ها، برای مدرسِ
// اختصاص‌یافته فقط جلسات، ثبت‌نام‌کنندگان و حضور و غیاب (بدون اطلاعات مدیریتی).
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadClassView } from "@/lib/class-view";
import { ClassDetail } from "@/components/class-detail";

export const dynamic = "force-dynamic";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  if (!(await can(actor, "classes.manage")) && !(await can(actor, "classes.teach"))) redirect("/dashboard");
  const view = await loadClassView(actor, id);
  if (!view.ok) {
    return <div className="ws-page"><p className="cls-empty">{view.error} — <Link href="/classes">بازگشت به فهرست کلاس‌ها</Link></p></div>;
  }
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1>{view.props.title}</h1>
        <p>{view.props.topic}{view.isAdmin ? ` — ایجادکننده: ${view.props.creatorName || "—"}` : " — نمای مدرس"}</p>
      </div>
      <div className="ws-page-actions"><Link className="ws-btn-secondary" href="/classes">بازگشت</Link></div>
    </header>
    <ClassDetail {...view.props} />
  </div>;
}
