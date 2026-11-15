import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";

// الحاقیهٔ ۲.۱۴.۰ — بازگشت /register به وظیفهٔ اصلی خودش: فقط ایجاد حساب کاربری
// (نام، نام خانوادگی، شماره موبایل، گذرواژه) با همان جریان پیامک تأیید. تمام
// اطلاعات تکمیلی پرونده (هویتی، تحصیلات، تخصص‌ها، حفظ قرآن، سوابق، مدارک) در
// بخش «پرونده‌ها» و از مسیر ویزارد مرحله‌ای /cases/new تکمیل می‌شود؛ هیچ داده
// یا قابلیتی حذف نشده و همهٔ ستون‌ها و جداول همان‌های قبلی هستند.
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthShell mode="register" />;
}
