// الحاقیهٔ ۲.۱۹.۰ — پنل کلاس از دید مدرس: فقط کلاس اختصاص‌یافته به خودش؛
// جلسات، فهرست شرکت‌کنندگان و شبکهٔ حضور و غیاب (بدون اطلاعات مدیریتی).
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadClassView } from "@/lib/class-view";
import { ClassDetail } from "@/components/class-detail";

export const dynamic = "force-dynamic";

export default async function TeachingClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  if (!(await can(actor, "classes.teach")) && !(await can(actor, "classes.manage"))) redirect("/dashboard");
  const view = await loadClassView(actor, id);
  if (!view.ok) {
    return <div className="ws-page"><p className="cls-empty">{view.error} — <Link href="/teaching">بازگشت</Link></p></div>;
  }
  return <div className="ws-page">
    <header className="ws-page-head">
      <div>
        <h1>{view.props.title}</h1>
        <p>{view.props.topic} — نمای مدرس</p>
      </div>
      <div className="ws-page-actions"><Link className="ws-btn-secondary" href="/teaching">بازگشت</Link></div>
    </header>
    <ClassDetail {...view.props} />
  </div>;
}
