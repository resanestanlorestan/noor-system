import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, roleDefaultPermissions } from "@/lib/permissions";
import { loadMatrix } from "@/app/actions/permissions";
import { PermissionMatrix, type MatrixData } from "@/components/permission-matrix";
import { getContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const content = await getContent();
  const user = await requireUser();
  if (!(await can(user, "permissions.manage"))) redirect("/dashboard");
  const matrix = await loadMatrix();
  if (!matrix) redirect("/dashboard");
  const data: MatrixData = {
    catalogue: matrix.catalogue,
    systemRoles: matrix.systemRoles,
    systemGrants: matrix.systemGrants,
    roleDefaults: roleDefaultPermissions,
    customRoles: matrix.customRoles,
    viewerEffectiveRole: matrix.viewerEffectiveRole,
  };
  return <>
    <div className="ws-breadcrumb">صفحه اصلی <span> / </span> <b>نقش‌ها و مجوزها</b></div>
    <div className="ws-page-head"><div><div className="ws-eyebrow"><span /> کنترل دسترسی ریزدانه</div><h1>{content.text("pages.permissions.title")}</h1><p>{content.text("pages.permissions.sub")}</p></div><ShieldCheck size={22} /></div>
    <PermissionMatrix data={data} />
  </>;
}
