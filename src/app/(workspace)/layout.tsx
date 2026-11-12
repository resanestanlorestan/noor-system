import { and, count, eq, isNull } from "drizzle-orm";
import { WorkspaceShell } from "@/components/workspace-shell";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { faDate } from "@/lib/format";
import { effectivePermissions } from "@/lib/permissions";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unreadRows, grants] = await Promise.all([
    db.select({ total: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    effectivePermissions(user),
  ]);
  return <WorkspaceShell name={user.fullName} role={user.effectiveRole} customRoleLabel={user.customRoleLabel} permissions={[...grants]} today={faDate(new Date())} unread={unreadRows[0]?.total ?? 0}>{children}</WorkspaceShell>;
}
