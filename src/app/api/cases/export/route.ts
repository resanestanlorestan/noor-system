import ExcelJS from "exceljs";
import { audit, getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/data";
import { loadExportDetails, parseCaseFilters, searchCasesForExport, sortLabels } from "@/lib/case-search";
import { isoToJalali, faDate } from "@/lib/format";
import { decryptSecret } from "@/lib/local-secrets";
import { courseFieldOptions, cooperationTypeOptions, documentTypeLabels, educationTypeLabels, formatSpecialtyDetail, memorizationCertTypeOptions, sourceLabels, statusLabels, activityRecordKindLabels } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
const value = (input: string | number | null | undefined) => input === null || input === undefined || input === "" ? "—" : clean(String(input));
const jalali = (iso: string | null) => iso ? isoToJalali(iso).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]) : "—";
const faOption = (map: Record<string, string>, key: string | null | undefined) => key && key in map ? map[key] : null;

/** ساخت یک شیت با ردیف عنوان، سرستون بولد و تراز راست‌به‌چپ. */
function addSheet(workbook: ExcelJS.Workbook, name: string, title: string, header: string[], widths: number[], rows: Array<Array<string | number>>) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2, rightToLeft: true }] });
  sheet.addRow([title]);
  const head = sheet.addRow(header);
  head.font = { bold: true, color: { argb: "FF145943" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4ED" } };
  sheet.columns = widths.map((width) => ({ width }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.eachRow((row) => { row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });
  return sheet;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isManager(user)) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const parsed = parseCaseFilters({
    q: params.get("q") || undefined, status: params.get("status") || undefined, provinceId: params.get("provinceId") || undefined,
    countyId: params.get("countyId") || undefined, specialtyId: params.get("specialtyId") || undefined, expertId: params.get("expertId") || undefined,
    source: params.get("source") || undefined, institution: params.get("institution") || undefined,
    from: params.get("from") || undefined, to: params.get("to") || undefined, sort: params.get("sort") || undefined,
  });
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const { rows, truncated } = await searchCasesForExport(user, parsed.filters);
    const details = await loadExportDetails(rows);
    // الحاقیهٔ ۲.۱۴.۲ — این مسیر فقط برای مدیران باز است؛ کد ملی کامل (رمزگشایی‌شده)
    // در خروجی می‌آید و در نبود رمز یا شکست رمزگشایی، همان ۴ رقم آخر پوشانده می‌ماند.
    const fullNationalIds = new Map<string, string>();
    for (const row of rows) {
      if (!row.nationalIdCipher) continue;
      const full = await decryptSecret(row.nationalIdCipher, "national-id-encryption-v1");
      if (full) fullNationalIds.set(row.id, full);
    }
    const idCell = (rowId: string, last4: string | null) => fullNationalIds.get(rowId) ?? (last4 ? `••••••${last4}` : "—");
    const workbook = new ExcelJS.Workbook(); workbook.creator = "سامانه نور"; workbook.created = new Date();
    const sheet = workbook.addWorksheet("فهرست پرونده‌ها", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
    sheet.addRow(["فهرست پرونده‌های سامانه جامع فعالان قرآنی"]);
    sheet.addRow([`تاریخ تولید: ${faDate(new Date(), true)}`]);
    const f = parsed.filters;
    const filterParts = [f.q && `جست‌وجو: ${f.q}`, f.status && `وضعیت: ${statusLabels[f.status]}`, f.expertId && "کارشناس مسئول: انتخاب‌شده", f.source && `منبع: ${sourceLabels[f.source]}`, f.institution && `مؤسسه: ${f.institution}`, f.from && `از: ${f.from}`, f.to && `تا: ${f.to}`, `مرتب‌سازی: ${sortLabels[f.sort]}`].filter(Boolean);
    sheet.addRow([`فیلترها: ${filterParts.join(" · ") || "بدون فیلتر افزوده؛ محدود به سطح دسترسی"}`]);
    sheet.addRow([`تعداد ردیف‌ها: ${rows.length}${truncated ? ` (محدود به ${rows.length} ردیف نخست؛ برای فهرست کامل فیلتر دقیق‌تری اعمال کنید)` : ""}`]);
    sheet.addRow([]);
    const header = sheet.addRow(["ردیف", "نام", "نام خانوادگی", "کد ملی", "شماره شناسنامه", "محل صدور", "شماره تماس", "کد پستی", "استان", "شهرستان", "استان فعالیت", "شهرستان فعالیت", "تخصص‌ها", "وضعیت پرونده", "منبع ثبت", "تاریخ ثبت"]);
    header.font = { bold: true, color: { argb: "FF145943" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4ED" } };
    sheet.columns = [{ width: 7 }, { width: 15 }, { width: 17 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 26 }, { width: 15 }, { width: 15 }, { width: 17 }];
    rows.forEach((row, index) => {
      sheet.addRow([index + 1, clean(row.firstName), clean(row.lastName), idCell(row.id, row.nationalIdLast4), row.idCardNumber || "—", row.idIssuePlace || "—", row.phone || "—", row.postalCode || "—", row.province || "—", row.county || "—", row.activityProvince || "—", row.activityCounty || "—", row.specialty || "—", statusLabels[row.status], sourceLabels[row.source], faDate(row.createdAt)]);
    });
    sheet.eachRow((row) => { row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });

    /* ---------------- الحاقیهٔ ۲.۱۲.۰ — شیت «اطلاعات کامل پرونده‌ها» ---------------- */
    addSheet(workbook, "اطلاعات کامل", "اطلاعات کامل هر پرونده — همهٔ فیلدهای ثبت‌شده",
      ["ردیف", "نام", "نام خانوادگی", "نام پدر", "کد ملی", "شماره شناسنامه", "محل صدور", "تاریخ تولد", "جنسیت", "شماره تماس", "همراه جایگزین", "ایمیل", "استان سکونت", "شهرستان", "شهر", "کد پستی", "نشانی", "استان فعالیت", "شهرستان فعالیت", "محل فعالیت", "مؤسسه قرآنی", "شغل", "تحصیلات دانشگاهی", "تحصیلات حوزوی", "میزان حفظ", "نوع مدرک حفظ", "تخصص‌ها و جزئیات", "رشته‌های معلمی و مدرسی", "سوابق همکاری", "دوره‌های گذرانده‌شده", "فعالیت‌های قرآنی", "آثار مؤلف", "گواهینامه‌ها", "تعداد مدارک بارگذاری‌شده", "وضعیت بررسی پرونده", "منبع ثبت", "تاریخ ثبت", "تاریخ ارسال برای بررسی"],
      Array(38).fill(14),
      rows.map((row, index) => {
        const educationFor = details.education.filter((item) => item.activistId === row.activistId);
        const universityText = educationFor.filter((item) => item.type === "university").map((item) => [item.level, item.field, item.centerName, item.certificate].filter(Boolean).join(" — ")).join(" | ") || (row.universityLevel || "");
        const seminaryText = educationFor.filter((item) => item.type === "seminary").map((item) => [item.level, item.field, item.centerName, item.certificate].filter(Boolean).join(" — ")).join(" | ") || (row.seminaryLevel || "");
        const specialtyFull = details.specialtyDetails.filter((item) => item.activistId === row.activistId)
          .map((item) => {
            const detail = formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts);
            return detail ? `${item.title}: ${detail}` : item.title;
          }).join(" | ");
        const memorizationText = details.specialtyDetails.find((item) => item.activistId === row.activistId && item.code === "memorizer");
        // الحاقیهٔ ۲.۱۴.۲ — ستون مستقل رشته‌های معلمی (معلم قرآن) و مدرسی (مدرس قرآن)
        const teachText = details.specialtyDetails.filter((item) => item.activistId === row.activistId && (item.code === "teacher" || item.code === "trainer"))
          .map((item) => {
            const detail = formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions, item.juzParts);
            return detail ? `${item.title}: ${detail}` : item.title;
          }).join(" | ");
        const workText = details.work.filter((item) => item.activistId === row.activistId).map((item) => [item.title, item.employer, faOption(cooperationTypeOptions, item.cooperationType), item.position, item.startDate ? `${isoToJalali(item.startDate)} تا ${item.endDate ? isoToJalali(item.endDate) : "اکنون"}` : null].filter(Boolean).join(" — ")).join(" | ");
        const courseText = details.courses.filter((item) => item.activistId === row.activistId).map((item) => [item.title, item.provider, faOption(courseFieldOptions, item.field), item.completedDate ? isoToJalali(item.completedDate) : null, item.hours ? `${item.hours} ساعت` : null].filter(Boolean).join(" — ")).join(" | ");
        const activityText = details.activities.filter((item) => item.activistId === row.activistId).map((item) => [activityRecordKindLabels[item.kind], item.title, faOption(courseFieldOptions, item.field), item.organization, item.position].filter(Boolean).join(" — ")).join(" | ");
        const writingsText = details.writings.filter((item) => item.activistId === row.activistId).map((item) => `${item.workType === "book" ? "کتاب" : "مقاله"}: ${item.title}${item.topic ? ` (${item.topic})` : ""}`).join(" | ");
        const certificateText = details.certificates.filter((item) => item.activistId === row.activistId).map((item) => [item.title, item.issuer, item.issuedDate ? isoToJalali(item.issuedDate) : null].filter(Boolean).join(" — ")).join(" | ");
        const documentCount = details.documents.filter((item) => item.applicationId === row.id).length;
        return [
          index + 1, clean(row.firstName), clean(row.lastName), value(row.fatherName), idCell(row.id, row.nationalIdLast4),
          value(row.idCardNumber), value(row.idIssuePlace), jalali(row.birthDate), row.gender === "female" ? "زن" : row.gender === "male" ? "مرد" : "—",
          value(row.phone), value(row.alternatePhone), value(row.email), value(row.province), value(row.county), value(row.city), value(row.postalCode), value(row.address),
          value(row.activityProvince), value(row.activityCounty), value(row.activityPlace), value(row.organization), value(row.job),
          value(universityText), value(seminaryText),
          value(memorizationText ? formatSpecialtyDetail("memorizer", memorizationText.detailValue, memorizationText.detailOptions, memorizationText.juzParts) : null),
          value(faOption(memorizationCertTypeOptions, row.memorizationCertType)),
          value(specialtyFull), value(teachText),
          value(workText), value(courseText), value(activityText), value(writingsText), value(certificateText),
          documentCount, statusLabels[row.status], sourceLabels[row.source], faDate(row.createdAt), row.submittedAt ? faDate(row.submittedAt) : "—",
        ];
      }));

    /* ---------------- شیت‌های تفصیلی: یک ردیف به‌ازای هر رکورد ---------------- */
    addSheet(workbook, "تحصیلات", "همهٔ سوابق تحصیلی حوزوی و دانشگاهی ثبت‌شده",
      ["فعال قرآنی", "نوع تحصیل", "مقطع", "رشته", "نام مرکز", "مدرک یا گواهی"], [24, 12, 14, 16, 20, 20],
      details.education.map((item) => [value(details.nameByActivist.get(item.activistId)), educationTypeLabels[item.type], item.level, value(item.field), value(item.centerName), value(item.certificate)]));
    addSheet(workbook, "سوابق همکاری", "همهٔ سوابق همکاری و شغلی ثبت‌شده",
      ["فعال قرآنی", "عنوان", "سازمان یا مجموعه", "نوع همکاری", "سمت", "تاریخ شروع", "تاریخ پایان", "توضیحات"], [24, 20, 20, 12, 16, 13, 13, 24],
      details.work.map((item) => [value(details.nameByActivist.get(item.activistId)), item.title, value(item.employer), value(faOption(cooperationTypeOptions, item.cooperationType)), value(item.position), jalali(item.startDate), jalali(item.endDate), value(item.description)]));
    addSheet(workbook, "دوره‌ها", "همهٔ دوره‌های گذرانده‌شده ثبت‌شده",
      ["فعال قرآنی", "عنوان دوره", "برگزارکننده", "رشته", "تاریخ گذراندن", "ساعت"], [24, 22, 18, 14, 13, 8],
      details.courses.map((item) => [value(details.nameByActivist.get(item.activistId)), item.title, value(item.provider), value(faOption(courseFieldOptions, item.field)), jalali(item.completedDate), item.hours ?? "—"]));
    addSheet(workbook, "فعالیت‌های قرآنی", "همهٔ سوابق فعالیت، تدریس، داوری، مسابقات و پژوهش",
      ["فعال قرآنی", "نوع سابقه", "رشته", "عنوان", "سازمان", "سمت", "بازه زمانی"], [24, 14, 14, 22, 18, 16, 20],
      details.activities.map((item) => [value(details.nameByActivist.get(item.activistId)), activityRecordKindLabels[item.kind], value(faOption(courseFieldOptions, item.field)), item.title, value(item.organization), value(item.position), item.startDate ? `${isoToJalali(item.startDate)} تا ${item.endDate ? isoToJalali(item.endDate) : "اکنون"}` : "—"]));
    addSheet(workbook, "آثار و گواهینامه‌ها", "آثار مؤلف و گواهینامه‌های ثبت‌شده",
      ["فعال قرآنی", "نوع", "عنوان", "موضوع / صادرکننده", "تاریخ"], [24, 10, 26, 24, 13],
      [
        ...details.writings.map((item) => [value(details.nameByActivist.get(item.activistId)), item.workType === "book" ? "کتاب" : "مقاله", item.title, value(item.topic), "—"] as Array<string | number>),
        ...details.certificates.map((item) => [value(details.nameByActivist.get(item.activistId)), "گواهینامه", item.title, value(item.issuer), jalali(item.issuedDate)] as Array<string | number>),
      ]);
    addSheet(workbook, "مدارک بارگذاری‌شده", "همهٔ فایل‌های بارگذاری‌شده در بخش‌های مربوط",
      ["فعال قرآنی", "عنوان مدرک", "نوع مدرک", "نام فایل", "حجم (کیلوبایت)", "تاریخ بارگذاری"], [24, 22, 18, 26, 14, 18],
      details.documents.map((item) => [value(details.nameByActivist.get(item.activistId)), item.title, value(faOption(documentTypeLabels, item.docType)), item.originalName, Math.ceil(item.size / 1024), faDate(item.createdAt)]));

    const buffer = await workbook.xlsx.writeBuffer();
    await audit(user.id, "export_case_list", "report", undefined, `${rows.length} rows + full sheets`);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="noor-cases.xlsx"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "تولید خروجی انجام نشد." }, { status: 500 }); }
}
