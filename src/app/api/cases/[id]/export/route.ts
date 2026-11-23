// الحاقیهٔ ۲.۲۷.۰ — خروجی اکسل کامل یک پرونده
// -----------------------------------------------------------
// هر فیلد ثبت‌شده در پرونده — ثابت (با برچسب override-آگاه مدیریت مراحل) یا
// سفارشی (فرم‌های پویای مراحل فعال) — بدون حذف یا جاافتادگی در شیت
// «مشخصات پرونده» به ترتیب فرم ثبت درج می‌شود؛ سپس شیت‌های تخصص‌ها،
// رکوردهای ثبت‌شده و مدارک بارگذاری‌شده جزئیات کامل را می‌آورند.
//
// گارد دسترسی: getCaseForUser همان محدودهٔ صفحهٔ جزئیات را اعمال می‌کند
// (فعال قرآنی فقط پروندهٔ خودش، کارشناس بررسی پروندهٔ ارجاعی، کارشناس
// تخصصی ارجاع تخصصی و مدیران در محدودهٔ استانی/شهرستانی). کد ملی کامل
// فقط برای مدیران رمزگشایی می‌شود و برای بقیه همان پوشش ۴ رقم آخر است.

import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { activityRecords, activistSpecialties, activistSpecialtyDetails, activistWritings, certificates, counties, documents, educationRecords, educationalCourses, provinces, specialties, users, workHistory } from "@/db/schema";
import { audit, getCurrentUser } from "@/lib/auth";
import { getCaseForUser, isManager } from "@/lib/data";
import { exportJalali, exportValue, formAnswerText, loadPublishedStepForms, loadStepAnswers } from "@/lib/case-export-model";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import { resolvedCaseField } from "@/lib/case-field-catalog";
import { isFieldVisible, type FormAnswers } from "@/lib/form-config";
import { faDate } from "@/lib/format";
import { decryptSecret } from "@/lib/local-secrets";
import {
  activityRecordKindLabels, cooperationTypeOptions, courseFieldOptions, documentTypeLabels,
  formatSpecialtyDetail, juzPartsFa, memorizationCertTypeOptions, sourceLabels, statusLabels,
} from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** سرستون بولد با پس‌زمینهٔ سبز سازمانی — هم‌منظور با خروجی فهرست. */
function styleHeader(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const head = sheet.getRow(rowNumber);
  head.font = { bold: true, color: { argb: "FF145943" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4ED" } };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const row = await getCaseForUser(user, id);
  if (!row) return new Response("Not Found", { status: 404 });
  try {
    const { application: app, activist: person } = row;
    const manager = isManager(user);
    const activityProvince = alias(provinces, "activity_province");
    const activityCounty = alias(counties, "activity_county");
    const [meta, stepForms, specRows, educationRows, workRows, courseRows, activityRows, writingRows, certificateRows, docRows, provinceRows, countyRows, activityProvinceRows, activityCountyRows, expertRows] = await Promise.all([
      loadCaseFieldMeta(),
      loadPublishedStepForms(),
      db.select({ specialtyId: activistSpecialties.specialtyId, title: specialties.title, code: specialties.code, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions, juzParts: activistSpecialtyDetails.juzParts })
        .from(activistSpecialties)
        .innerJoin(specialties, eq(specialties.id, activistSpecialties.specialtyId))
        .leftJoin(activistSpecialtyDetails, and(eq(activistSpecialtyDetails.specialtyId, activistSpecialties.specialtyId), eq(activistSpecialtyDetails.activistId, activistSpecialties.activistId)))
        .where(eq(activistSpecialties.activistId, person.id)),
      db.select().from(educationRecords).where(eq(educationRecords.activistId, person.id)),
      db.select().from(workHistory).where(eq(workHistory.activistId, person.id)),
      db.select().from(educationalCourses).where(eq(educationalCourses.activistId, person.id)),
      db.select().from(activityRecords).where(eq(activityRecords.activistId, person.id)),
      db.select().from(activistWritings).where(eq(activistWritings.activistId, person.id)),
      db.select().from(certificates).where(eq(certificates.activistId, person.id)),
      db.select().from(documents).where(eq(documents.applicationId, id)),
      person.provinceId ? db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, person.provinceId)).limit(1) : Promise.resolve([] as { name: string }[]),
      person.countyId ? db.select({ name: counties.name }).from(counties).where(eq(counties.id, person.countyId)).limit(1) : Promise.resolve([] as { name: string }[]),
      person.activityProvinceId ? db.select({ name: activityProvince.name }).from(activityProvince).where(eq(activityProvince.id, person.activityProvinceId)).limit(1) : Promise.resolve([] as { name: string }[]),
      person.activityCountyId ? db.select({ name: activityCounty.name }).from(activityCounty).where(eq(activityCounty.id, person.activityCountyId)).limit(1) : Promise.resolve([] as { name: string }[]),
      app.assignedExpertId ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, app.assignedExpertId)).limit(1) : Promise.resolve([] as { fullName: string }[]),
    ]);
    const specs = specRows;
    const answersByDef = (await loadStepAnswers([id], stepForms)).get(id) ?? new Map<number, FormAnswers>();
    const docTitleById = new Map(docRows.map((item) => [item.id, `${item.title} (${item.originalName})`]));
    const label = (key: string) => resolvedCaseField(meta, key).label;
    const fullNationalId = manager && person.nationalIdCipher ? await decryptSecret(person.nationalIdCipher, "national-id-encryption-v1") : null;
    const nationalIdCell = fullNationalId || (person.nationalIdLast4 ? `••••••${person.nationalIdLast4}` : "—");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "سامانه نور"; workbook.created = new Date();

    /* ---------------- شیت ۱: مشخصات پرونده ---------------- */
    const sheet = workbook.addWorksheet("مشخصات پرونده", { views: [{ state: "frozen", ySplit: 4, rightToLeft: true }] });
    sheet.columns = [{ width: 30 }, { width: 70 }];
    sheet.addRow(["خروجی کامل پرونده — سامانه جامع فعالان قرآنی"]);
    sheet.addRow([`${label("identity.firstName")} و ${label("identity.lastName")}: ${person.firstName} ${person.lastName}`.trim()]);
    sheet.addRow([`شناسه پرونده: ${id}`, `تاریخ تولید گزارش: ${faDate(new Date(), true)}`]);
    const head = sheet.addRow(["عنوان فیلد", "مقدار ثبت‌شده"]);
    styleHeader(sheet, sheet.rowCount);
    const addSection = (title: string) => {
      const sectionRow = sheet.addRow([title, ""]);
      const cell = sectionRow.getCell(1);
      cell.font = { bold: true, color: { argb: "FF0E2148" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F4" } };
      sectionRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F4" } };
    };
    const addField = (field: string, value: string | number | null | undefined) => sheet.addRow([field, exportValue(value)]);

    // مرحلهٔ ۱ فرم — هویتی (برچسب‌ها از override مدیریت مراحل)
    addSection(label("identity.section.identity") || "اطلاعات هویتی و تماس");
    addField(label("identity.firstName"), person.firstName);
    addField(label("identity.lastName"), person.lastName);
    addField(label("identity.fatherName"), person.fatherName);
    addField(label("identity.nationalId"), nationalIdCell);
    addField(label("identity.idCardNumber"), person.idCardNumber);
    addField(label("identity.idIssuePlace"), person.idIssuePlace);
    addField(label("identity.birthDate"), exportJalali(person.birthDate));
    addField(label("identity.gender"), person.gender === "female" ? "زن" : person.gender === "male" ? "مرد" : null);
    addField(label("identity.phone"), person.phone);
    addField(label("identity.alternatePhone"), person.alternatePhone);
    addField(label("identity.contactEmail"), person.email);
    addField(label("identity.source"), sourceLabels[app.source]);

    // تحصیلات — رکوردهای ثبت‌شده با fallback ستون‌های کهن
    addSection(label("identity.section.university") || "تحصیلات دانشگاهی");
    const university = educationRows.find((item) => item.type === "university") || null;
    addField(label("identity.universityLevel"), university?.level || person.universityLevel);
    addField(label("identity.universityField"), university?.field);
    addField(label("identity.universityType"), university?.universityType);
    addField(label("identity.universityCenterName"), university?.centerName);
    addField(label("identity.universityDoc"), university?.documentId ? "مدرک پیوست‌شده" : null);
    addSection(label("identity.section.seminary") || "تحصیلات حوزوی");
    const seminary = educationRows.find((item) => item.type === "seminary") || null;
    addField(label("identity.seminaryLevel"), seminary?.level || person.seminaryLevel);
    addField(label("identity.seminaryDoc"), seminary?.documentId ? "مدرک پیوست‌شده" : null);

    // مرحلهٔ ۲ فرم — سکونت و محل فعالیت
    addSection(label("location.section.residence") || "محل سکونت");
    addField(label("location.provinceId"), provinceRows[0]?.name);
    addField(label("location.countyId"), countyRows[0]?.name);
    addField(label("location.city"), person.city);
    addField(label("location.postalCode"), person.postalCode);
    addField(label("location.address"), person.address);
    addSection(label("location.section.activity") || "محل فعالیت قرآنی");
    addField(label("location.activityProvinceId"), activityProvinceRows[0]?.name);
    addField(label("location.activityCountyId"), activityCountyRows[0]?.name);
    addField(label("location.activityPlace"), person.activityPlace);
    addField(label("location.organization"), person.organization);

    // مرحلهٔ ۳ فرم — تخصص‌ها و سوابق
    addSection(label("specialties.section.grid") || "تخصص‌های قرآنی");
    addField("تخصص‌های قرآنی", specs.map((item) => item.title).join("، "));
    addField(label("specialties.details"), specs.filter((item) => formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts)).map((item) => { const detail = formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts); return detail ? `${item.title}: ${detail}` : item.title; }).join(" | "));
    const memorizeRow = specs.find((item) => item.code === "memorizer");
    addField("میزان حفظ", memorizeRow ? formatSpecialtyDetail("memorizer", memorizeRow.detailValue, memorizeRow.detailOptions, memorizeRow.juzParts) : null);
    addField("نوع مدرک حفظ", person.memorizationCertType && person.memorizationCertType in memorizationCertTypeOptions ? memorizationCertTypeOptions[person.memorizationCertType] : null);
    addField(label("specialties.job"), person.job);
    addField(label("specialties.notes"), person.notes);

    // فیلدهای سفارشی هر مرحلهٔ فعال (الحاقیهٔ ۲.۲۵.۰) — پاسخ‌ها با برچسب فارسی گزینه‌ها
    for (const form of stepForms) {
      addSection(`فیلدهای سفارشی مرحلهٔ «${form.stepTitle}»`);
      const answers = answersByDef.get(form.definitionId) || {};
      for (const field of form.fields) {
        const visible = isFieldVisible(field, answers);
        addField(field.label, visible ? formAnswerText(field, answers[field.key], docTitleById) : null);
      }
    }

    // مدارک و وضعیت پرونده
    addSection("مدارک و وضعیت پرونده");
    addField(label("documents.photo"), person.photoDocumentId ? "بارگذاری‌شده" : null);
    addField(label("documents.evidence"), `${docRows.filter((item) => item.kind === "evidence").length} مدرک`);
    addField("وضعیت پرونده", statusLabels[app.status]);
    addField("تاریخ ثبت", faDate(app.createdAt, true));
    addField("تاریخ ارسال برای بررسی", app.submittedAt ? faDate(app.submittedAt, true) : null);
    addField("کارشناس مسئول", expertRows[0]?.fullName);
    sheet.eachRow((current) => { current.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });

    /* ---------------- شیت ۲: تخصص‌ها و جزئیات ---------------- */
    const specSheet = workbook.addWorksheet("تخصص‌ها و جزئیات", { views: [{ state: "frozen", ySplit: 2, rightToLeft: true }] });
    specSheet.columns = [{ width: 24 }, { width: 40 }, { width: 22 }];
    specSheet.addRow(["تخصص‌های ثبت‌شده پرونده با جزئیات کامل"]);
    const specHead = specSheet.addRow(["تخصص", "جزئیات (سطح / حوزه‌ها / رشته‌ها)", "اجزای حفظ"]);
    styleHeader(specSheet, specSheet.rowCount);
    specs.forEach((item) => specSheet.addRow([item.title, exportValue(formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts)), exportValue(juzPartsFa(item.juzParts))]));
    specSheet.eachRow((current) => { current.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });

    /* ---------------- شیت ۳: رکوردهای ثبت‌شده ---------------- */
    const recordSheet = workbook.addWorksheet("رکوردهای ثبت‌شده", { views: [{ state: "frozen", ySplit: 2, rightToLeft: true }] });
    recordSheet.columns = [{ width: 18 }, { width: 26 }, { width: 44 }, { width: 20 }];
    recordSheet.addRow(["همهٔ رکوردهای ثبت‌شده پرونده: تحصیلات، سوابق شغلی، دوره‌ها، فعالیت‌ها، آثار و گواهینامه‌ها"]);
    const recordHead = recordSheet.addRow(["نوع رکورد", "عنوان / مقطع", "جزئیات", "تاریخ"]);
    styleHeader(recordSheet, recordSheet.rowCount);
    educationRows.forEach((item) => recordSheet.addRow([educationTypeLabel(item.type), joinText([item.level, item.field]), joinText([item.universityType, item.centerName, item.certificate, item.documentId ? "مدرک پیوست‌شده" : null]), "—"]));
    workRows.forEach((item) => recordSheet.addRow(["سابقه شغلی", item.title, joinText([item.employer, item.cooperationType && item.cooperationType in cooperationTypeOptions ? cooperationTypeOptions[item.cooperationType] : null, item.position, item.description]), item.startDate ? `${exportJalali(item.startDate)} تا ${item.endDate ? exportJalali(item.endDate) : "اکنون"}` : "—"]));
    courseRows.forEach((item) => recordSheet.addRow(["دورهٔ آموزشی", item.title, joinText([item.provider, item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field] : null, item.hours ? `${item.hours} ساعت` : null]), exportJalali(item.completedDate)]));
    activityRows.forEach((item) => recordSheet.addRow([activityRecordKindLabels[item.kind], item.title, joinText([item.field && item.field in courseFieldOptions ? courseFieldOptions[item.field] : null, item.organization, item.position]), item.startDate ? `${exportJalali(item.startDate)} تا ${item.endDate ? exportJalali(item.endDate) : "اکنون"}` : "—"]));
    writingRows.forEach((item) => recordSheet.addRow([item.workType === "book" ? "کتاب" : "مقاله", item.title, item.topic || "—", "—"]));
    certificateRows.forEach((item) => recordSheet.addRow(["گواهینامه / افتخار", item.title, item.issuer || "—", exportJalali(item.issuedDate)]));
    if (recordSheet.rowCount === 3) recordSheet.addRow(["—", "رکوردی ثبت نشده است", "—", "—"]);
    recordSheet.eachRow((current) => { current.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });

    /* ---------------- شیت ۴: مدارک بارگذاری‌شده ---------------- */
    const docSheet = workbook.addWorksheet("مدارک بارگذاری‌شده", { views: [{ state: "frozen", ySplit: 2, rightToLeft: true }] });
    docSheet.columns = [{ width: 26 }, { width: 18 }, { width: 28 }, { width: 14 }, { width: 20 }];
    docSheet.addRow(["همهٔ فایل‌های بارگذاری‌شده در این پرونده"]);
    const docHead = docSheet.addRow(["عنوان مدرک", "نوع مدرک", "نام فایل", "حجم (کیلوبایت)", "تاریخ بارگذاری"]);
    styleHeader(docSheet, docSheet.rowCount);
    docRows.forEach((item) => docSheet.addRow([item.title, exportValue(item.docType && item.docType in documentTypeLabels ? documentTypeLabels[item.docType as keyof typeof documentTypeLabels] : null), item.originalName, Math.ceil(item.size / 1024), faDate(item.createdAt)]));
    if (docSheet.rowCount === 3) docSheet.addRow(["—", "مدرکی بارگذاری نشده است", "—", "—", "—"]);
    docSheet.eachRow((current) => { current.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });

    const buffer = await workbook.xlsx.writeBuffer();
    await audit(user.id, "export_case_detail", "case", id, `${person.firstName} ${person.lastName} — ${manager ? "کد ملی کامل" : "کد ملی پوشانده"}`);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="noor-case-${id.slice(0, 8)}.xlsx"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "تولید خروجی انجام نشد." }, { status: 500 }); }
}

function educationTypeLabel(type: "seminary" | "university"): string {
  return type === "university" ? "تحصیل دانشگاهی" : "تحصیل حوزوی";
}
function joinText(parts: Array<string | number | null | undefined>): string {
  return parts.filter(Boolean).join(" — ") || "—";
}
