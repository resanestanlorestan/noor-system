import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { counties, provinces, specialties } from "@/db/schema";
import { CaseForm } from "@/components/forms/case-form";

export default async function NewCasePage() {
  await requireUser();
  const [provinceRows, countyRows, specialtyRows] = await Promise.all([
    db.select({ id: provinces.id, name: provinces.name }).from(provinces).orderBy(provinces.id),
    db.select({ id: counties.id, name: counties.name }).from(counties).orderBy(counties.id),
    db.select({ id: specialties.id, title: specialties.title }).from(specialties).orderBy(specialties.id),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ثبت پرونده جدید</h1>
      <CaseForm provinces={provinceRows} counties={countyRows} specialties={specialtyRows} />
    </div>
  );
}
