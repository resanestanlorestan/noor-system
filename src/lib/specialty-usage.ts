// الحاقیهٔ ۲.۲۴.۰ — گارد مشترک حذف تخصص: شمارش همهٔ وابستگی‌های معنادار یک
// تخصص در یک جا، تا هر دو مسیر حذف (/forms با مجوز forms.manage و /settings با
// مجوز settings.references) عیناً یک منطق داشته باشند. علاوه بر پنج جدول ۲.۲۱.۰،
// تعریف فرم پویا و پاسخ‌های ثبت‌شدهٔ ۲.۲۳.۰ هم شمرده می‌شوند تا حذف هیچ‌گاه
// سوابق تاریخی را یتیم نکند. خروجی: متن شمارش برای پیام ردِ حذف؛ رشتهٔ خالی
// یعنی هیچ وابستگی وجود ندارد و حذف مجاز است.
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { activistSpecialties, activistSpecialtyDetails, classesSpecialties, expertReferrals, formAnswers, formDefinitions, userSpecialties } from "@/db/schema";
import { faNumber } from "@/lib/format";

export async function specialtyUsageParts(id: number): Promise<string> {
  const [ap] = await db.select({ n: count() }).from(activistSpecialties).where(eq(activistSpecialties.specialtyId, id));
  const [ad] = await db.select({ n: count() }).from(activistSpecialtyDetails).where(eq(activistSpecialtyDetails.specialtyId, id));
  const [us] = await db.select({ n: count() }).from(userSpecialties).where(eq(userSpecialties.specialtyId, id));
  const [er] = await db.select({ n: count() }).from(expertReferrals).where(eq(expertReferrals.specialtyId, id));
  const [cs] = await db.select({ n: count() }).from(classesSpecialties).where(eq(classesSpecialties.specialtyId, id));
  const [fa] = await db.select({ n: count() }).from(formAnswers).where(eq(formAnswers.specialtyId, id));
  const [fd] = await db.select({ n: count() }).from(formDefinitions).where(and(eq(formDefinitions.entityType, "specialty"), eq(formDefinitions.entityId, id)));
  const rows: Array<[number, string]> = [
    [ap.n, "رکورد تخصص فعالان"], [ad.n, "جزئیات تخصص"], [us.n, "حساب کارشناس"],
    [er.n, "ارجاع کارشناسی"], [cs.n, "دورهٔ آموزشی"], [fa.n, "پاسخ فرم پویا"], [fd.n, "تعریف فرم پویا"],
  ];
  return rows.filter(([n]) => n > 0).map(([n, label]) => `${faNumber(n)} ${label}`).join("، ");
}
