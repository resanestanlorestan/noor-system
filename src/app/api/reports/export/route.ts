import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { audit, getCurrentUser } from "@/lib/auth";
import { isManager } from "@/lib/data";
import { getReportData, parseReportFilters, type ReportData } from "@/lib/report-data";
import { faDate, faNumber } from "@/lib/format";
import { roleLabels, sourceLabels, statusLabels, type AppStatus } from "@/lib/constants";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
const titleRows = (data: ReportData): [string, number][] => [
  ["کل پرونده‌ها", data.total], ["تأییدشده", data.statusMap.approved || 0], ["در انتظار بررسی", data.statusMap.pending || 0], ["پرونده ناقص", data.incomplete], ["نیازمند اصلاح", data.statusMap.needs_correction || 0], ["ردشده", data.statusMap.rejected || 0], ["کارشناسان فعال", data.activeExperts], ["پرونده معوق", data.overdue], ["درصد پیشرفت بررسی", data.completionRate],
];
async function excel(data: ReportData, date: string) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "سامانه نور"; workbook.created = new Date();
  const sheet = workbook.addWorksheet("گزارش آماری", { views: [{ state: "frozen", ySplit: 4, rightToLeft: true }] });
  sheet.columns = [{ width: 45 }, { width: 20 }];
  sheet.addRow(["گزارش آماری سامانه جامع فعالان قرآنی"]); sheet.addRow([`تاریخ تولید: ${date}`]); sheet.addRow([`فیلترها: ${data.selectedLabels.join(" · ") || "بدون فیلتر افزوده؛ محدود به سطح دسترسی"}`]); sheet.addRow([]);
  const heading = (name: string) => { const row = sheet.addRow([name, "تعداد"]); row.font = { bold: true, color: { argb: "FF145943" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4ED" } }; };
  const rows = (values: [string, number][]) => { for (const [name, total] of values) sheet.addRow([clean(name), total]); sheet.addRow([]); };
  heading("شاخص‌ها"); rows(titleRows(data));
  heading("وضعیت پرونده‌ها"); rows(Object.entries(data.statusMap).map(([key,total]) => [statusLabels[key as AppStatus], total || 0]));
  heading("استان‌ها"); rows(data.provinceStats.map((x)=>[x.name || "ثبت‌نشده",x.total]));
  heading("شهرستان‌ها"); rows(data.countyStats.map((x)=>[`${x.name || "ثبت‌نشده"}${x.province ? ` - ${x.province}` : ""}`,x.total]));
  heading("تخصص‌ها"); rows(data.specialtyStats.map((x)=>[x.name,x.total]));
  heading("منبع ثبت"); rows(data.sources.map((x)=>[sourceLabels[x.name],x.total]));
  heading("روند شش ماه شمسی"); rows(data.timeline.map((x)=>[x.name,x.total]));
  heading("رویدادهای کارشناسان"); rows(data.performance.map((x)=>[`${x.name} - ${roleLabels[x.role]}`,x.total]));
  sheet.addRow(["پرونده معوق: انتظار بررسی بیش از ۱۴ روز از آخرین تغییر. کارشناسان فعال فقط با فیلتر جغرافیا محاسبه می‌شوند. عملکرد کارشناسان بر اساس نقش فعلی آنان است."]);
  sheet.getRow(1).font = { bold:true, size:14, color:{argb:"FF145943"} };
  sheet.eachRow((row)=>{row.alignment={ horizontal:"right", vertical:"middle", readingOrder:"rtl", wrapText:true }; row.height = 22;});
  return workbook.xlsx.writeBuffer();
}
async function pdf(data: ReportData, date: string) {
  const font = await readFile(path.join(process.cwd(), "public/fonts/Vazirmatn-Regular.ttf"));
  const doc = new jsPDF({ unit:"mm", format:"a4", compress:true });
  doc.addFileToVFS("Vazirmatn-Regular.ttf", font.toString("base64")); doc.addFont("Vazirmatn-Regular.ttf", "Vazirmatn", "normal"); doc.setFont("Vazirmatn"); doc.setLanguage("fa-IR"); doc.setR2L(false);
  let y = 18; const pageWidth = doc.internal.pageSize.getWidth(); const right = pageWidth - 16;
  const ensure = (space = 9) => { if (y + space > 280) { doc.addPage(); y=18; } };
  const heading = (text: string) => { ensure(14); doc.setFontSize(12); doc.setTextColor(22,87,63); doc.text(text,right,y,{align:"right"}); y+=8; doc.setDrawColor(221,233,224); doc.line(16,y-3,right,y-3); };
  const line = (label:string,total:number) => { ensure(); doc.setFontSize(10); doc.setTextColor(67,88,74); doc.text(label,right,y,{align:"right"}); doc.text(faNumber(total),20,y,{align:"left"}); y+=7; };
  doc.setFontSize(16); doc.setTextColor(20,85,61); doc.text("گزارش آماری سامانه جامع فعالان قرآنی",right,y,{align:"right"}); y+=9;
  doc.setFontSize(9); doc.setTextColor(106,125,112); doc.text(`تاریخ تولید: ${date}`,right,y,{align:"right"}); y+=7;
  const filterText = `فیلترها: ${data.selectedLabels.join("، ") || "بدون فیلتر افزوده؛ محدود به سطح دسترسی"}`;
  for (const text of doc.splitTextToSize(filterText, 175)) { ensure(); doc.text(text,right,y,{align:"right"}); y+=6; }
  y+=3; heading("شاخص‌های اصلی"); titleRows(data).forEach(([name,total])=>line(name,total));
  heading("وضعیت پرونده‌ها"); Object.entries(data.statusMap).forEach(([name,total])=>line(statusLabels[name as AppStatus],total || 0));
  heading("آمار استان‌ها"); data.provinceStats.forEach((x)=>line(x.name || "ثبت‌نشده",x.total));
  heading("آمار شهرستان‌ها"); data.countyStats.forEach((x)=>line(`${x.name || "ثبت‌نشده"}${x.province ? ` - ${x.province}` : ""}`,x.total));
  heading("تخصص‌های قرآنی"); data.specialtyStats.forEach((x)=>line(x.name,x.total));
  heading("منبع ثبت اطلاعات"); data.sources.forEach((x)=>line(sourceLabels[x.name],x.total));
  heading("روند شش ماه شمسی"); data.timeline.forEach((x)=>line(x.name.replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)]),x.total));
  heading("رویدادهای کارشناسان"); data.performance.forEach((x)=>line(`${x.name} - ${roleLabels[x.role]}`,x.total));
  ensure(14); doc.setFontSize(9); doc.setTextColor(117,132,122); for (const text of doc.splitTextToSize("پرونده معوق: انتظار بررسی بیش از ۱۴ روز از آخرین تغییر. کارشناسان فعال فقط با فیلتر جغرافیا محاسبه می‌شوند. عملکرد کارشناسان بر اساس نقش فعلی آنان است.",175)) { ensure(); doc.text(text,right,y,{align:"right"}); y+=6; }
  return doc.output("arraybuffer");
}
export async function GET(request: Request) {
  const user = await getCurrentUser(); if (!user) return new Response("Unauthorized", { status:401 }); if (!isManager(user)) return new Response("Forbidden", { status:403 });
  const params = new URL(request.url).searchParams; const format = params.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response("Invalid format", { status:400 });
  const parsed = parseReportFilters({ provinceId:params.get("provinceId") || undefined, countyId:params.get("countyId") || undefined, specialtyId:params.get("specialtyId") || undefined, status:params.get("status") || undefined, from:params.get("from") || undefined, to:params.get("to") || undefined });
  if (parsed.error) return Response.json({ error:parsed.error }, { status:400 });
  try {
    const data = await getReportData(user, parsed.filters); const date = faDate(new Date(),true); const result = format === "xlsx" ? await excel(data,date) : await pdf(data,date);
    await audit(user.id, "export_report", "report", undefined, format);
    return new Response(new Uint8Array(result), { headers:{ "Content-Type":format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf", "Content-Disposition":`attachment; filename="noor-report.${format}"`, "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" } });
  } catch { return Response.json({ error:"تولید گزارش انجام نشد." }, { status:500 }); }
}
