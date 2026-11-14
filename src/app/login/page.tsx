import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  const { reset } = await searchParams;
  return <AuthShell mode="login" showSetup={!admin} resetDone={reset === "1"} />;
}
