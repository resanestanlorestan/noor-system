import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default async function RegisterPage() { if (await getCurrentUser()) redirect("/dashboard"); return <AuthShell mode="register" />; }
