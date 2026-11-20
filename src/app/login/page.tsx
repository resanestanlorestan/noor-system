import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; reason?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  const { reset, reason } = await searchParams;
  // الحاقیهٔ ۲.۱۸.۷ — پس از خروج خودکار بی‌فعالیتی، اعلان دلیل خروج در صفحهٔ ورود دیده می‌شود
  return <AuthShell mode="login" showSetup={!admin} resetDone={reset === "1"} idleLogout={reason === "idle"} />;
}
