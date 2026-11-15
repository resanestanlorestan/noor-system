import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { counties, provinces, specialties } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ensureReferenceData } from "@/lib/data";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";

// الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای: صفحهٔ ثبت‌نام عمومی همهٔ اطلاعات و
// مدارک را در همان مرحله اول می‌گیرد؛ فهرست استان‌ها/شهرستان‌ها و تخصص‌ها از
// پایگاه داده خوانده می‌شود و ساختار کلی صفحه (پوستهٔ احراز هویت) ثابت می‌ماند.
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  await ensureReferenceData();
  const [provinceRows, countyRows, specialtyRows] = await Promise.all([
    db.select({ id: provinces.id, name: provinces.name }).from(provinces).orderBy(asc(provinces.id)),
    db.select({ id: counties.id, name: counties.name, provinceId: counties.provinceId }).from(counties).orderBy(asc(counties.id)),
    db.select({ id: specialties.id, title: specialties.title, code: specialties.code }).from(specialties).orderBy(asc(specialties.id)),
  ]);
  return <AuthShell mode="register" wide provinces={provinceRows} counties={countyRows} specialties={specialtyRows} />;
}
