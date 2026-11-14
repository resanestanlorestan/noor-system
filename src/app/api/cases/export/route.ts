import ExcelJS from "exceljs";
import { audit, getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/data";
import { parseCaseFilters, searchCasesForExport, sortLabels } from "@/lib/case-search";
import { faDate } from "@/lib/format";
import { sourceLabels, statusLabels } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

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
    const workbook = new ExcelJS.Workbook(); workbook.creator = "سامانه نور"; workbook.created = new Date();
    const sheet = workbook.addWorksheet("فهرست پرونده‌ها", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
    sheet.addRow(["فهرست پرونده‌های سامانه جامع فعالان قرآنی"]);
    sheet.addRow([`تاریخ تولید: ${faDate(new Date(), true)}`]);
    const f = parsed.filters;
    const filterParts = [f.q && `جست‌وجو: ${f.q}`, f.status && `وضعیت: ${statusLabels[f.status]}`, f.expertId && "کارشناس مسئول: انتخاب‌شده", f.source && `منبع: ${sourceLabels[f.source]}`, f.institution && `مؤسسه: ${f.institution}`, f.from && `از: ${f.from}`, f.to && `تا: ${f.to}`, `مرتب‌سازی: ${sortLabels[f.sort]}`].filter(Boolean);
    sheet.addRow([`فیلترها: ${filterParts.join(" · ") || "بدون فیلتر افزوده؛ محدود به سطح دسترسی"}`]);
    sheet.addRow([`تعداد ردیف‌ها: ${rows.length}${truncated ? ` (محدود به ${rows.length} ردیف نخست؛ برای فهرست کامل فیلتر دقیق‌تری اعمال کنید)` : ""}`]);
    sheet.addRow([]);
    const header = sheet.addRow(["ردیف", "نام", "نام خانوادگی", "کد ملی (۴ رقم)", "شماره شناسنامه", "محل صدور", "شماره تماس", "کد پستی", "استان", "شهرستان", "استان فعالیت", "شهرستان فعالیت", "تخصص‌ها", "وضعیت پرونده", "منبع ثبت", "تاریخ ثبت"]);
    header.font = { bold: true, color: { argb: "FF145943" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4ED" } };
    sheet.columns = [{ width: 7 }, { width: 15 }, { width: 17 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 26 }, { width: 15 }, { width: 15 }, { width: 17 }];
    rows.forEach((row, index) => {
      sheet.addRow([index + 1, clean(row.firstName), clean(row.lastName), row.nationalIdLast4 ? `••••••${row.nationalIdLast4}` : "—", row.idCardNumber || "—", row.idIssuePlace || "—", row.phone || "—", row.postalCode || "—", row.province || "—", row.county || "—", row.activityProvince || "—", row.activityCounty || "—", row.specialty || "—", statusLabels[row.status], sourceLabels[row.source], faDate(row.createdAt)]);
    });
    sheet.eachRow((row) => { row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });
    const buffer = await workbook.xlsx.writeBuffer();
    await audit(user.id, "export_case_list", "report", undefined, `${rows.length} rows`);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="noor-cases.xlsx"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "تولید خروجی انجام نشد." }, { status: 500 }); }
}
