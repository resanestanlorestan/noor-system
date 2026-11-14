import { and, count, eq, isNull } from "drizzle-orm";
import { WorkspaceShell } from "@/components/workspace-shell";
import { db } from "@/db";
import { activists, notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { effectivePermissions } from "@/lib/permissions";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unreadRows, grants, photoRows] = await Promise.all([
    db.select({ total: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    effectivePermissions(user),
    // الحاقیهٔ ۲.۹.۳: تصویر پرسنلیِ پروندهٔ کاربرِ فعال، به‌عنوان آواتار نوار بالا و منو
    db.select({ photoDocumentId: activists.photoDocumentId }).from(activists).where(eq(activists.userId, user.id)).limit(1),
  ]);
  const photoDocumentId = photoRows[0]?.photoDocumentId ?? null;
  return <WorkspaceShell name={user.fullName} role={user.effectiveRole} customRoleLabel={user.customRoleLabel} permissions={[...grants]} today={faDate(new Date())} unread={unreadRows[0]?.total ?? 0} photoUrl={photoDocumentId ? `/api/documents/${photoDocumentId}` : null}>{children}</WorkspaceShell>;
}
