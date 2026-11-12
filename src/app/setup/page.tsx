import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { bootstrapCode } from "@/lib/local-secrets";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (admin) redirect("/login");
  await bootstrapCode();
  return <AuthShell mode="setup" />;
}
