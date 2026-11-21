// الحاقیهٔ ۲.۱۹.۰ — خروجی اکسل داشبورد کلاس‌ها: ردیف هر کلاس با شمارنده‌ها
// (واجد شرایط/ثبت‌نام/لیست انتظار/پیامک/ظرفیت) + آمار حضور و تجمیع به تفکیک
// شهرستان و گروه — در محدودهٔ دسترسی کاربر.
import ExcelJS from "exceljs";
import { audit, getCurrentUser } from "@/lib/auth";
import { classDashboard, classFormatLabels, classStatusLabels } from "@/lib/classes";
import { faDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => /^[=+\-@\t\r]/.test(String(value ?? "")) ? `'${String(value)}` : String(value ?? "");
const value = (input: string | number | null | undefined) => input === null || input === undefined || input === "" ? "—" : clean(String(input));

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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(user, "classes.manage"))) return new Response("forbidden", { status: 403 });
  const stats = await classDashboard(user);

  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, "کلاس‌ها", `داشبورد کلاس‌ها — ${faDate(new Date(), true)} | کلاس‌ها: ${stats.totals.all}؛ ثبت‌نام: ${stats.totals.registrations}؛ لیست انتظار: ${stats.totals.waitlist}`,
    ["ردیف", "عنوان", "موضوع", "وضعیت", "نوع برگزاری", "شهرستان‌ها", "گروه‌ها", "استاد", "تاریخ", "ظرفیت", "ثبت‌نام", "باقی‌مانده", "لیست انتظار", "واجد شرایط", "پیامک", "جلسات"],
    [7, 26, 24, 12, 12, 22, 22, 20, 20, 9, 9, 11, 11, 11, 9, 8],
    stats.rows.map((r, i) => [i + 1, value(r.title), value(r.topic), classStatusLabels[r.status], classFormatLabels[r.formatType],
      "—", "—", value(r.teacherName), `${r.startsOn} ${r.startTime}`, r.capacity, r.registeredCount, Math.max(0, r.capacity - Number(r.registeredCount)),
      r.waitlistCount, r.eligibleCount, r.smsCount, r.sessionCount]));
  addSheet(workbook, "به تفکیک شهرستان", "ثبت‌نام‌ها به تفکیک شهرستان", ["شهرستان", "تعداد ثبت‌نام"], [24, 16],
    stats.byCounty.map((r) => [value(r.name), r.total]));
  addSheet(workbook, "به تفکیک گروه", "ثبت‌نام‌ها به تفکیک گروه (تخصص)", ["گروه", "تعداد ثبت‌نام"], [24, 16],
    stats.bySpecialty.map((r) => [value(r.name), r.total]));
  addSheet(workbook, "حضور و غیاب", `تعداد حاضران: ${stats.attendance.present}؛ غایبان: ${stats.attendance.absent}؛ تأخیر: ${stats.attendance.late}؛ غیبت موجه: ${stats.attendance.excused}`,
    ["شاخص", "مقدار"], [24, 16], [
      ["حاضر", stats.attendance.present], ["غایب", stats.attendance.absent], ["تأخیر", stats.attendance.late],
      ["غیبت موجه", stats.attendance.excused], ["میانگین درصد حضور کلاس‌ها", `${stats.attendance.avgPercent}٪`],
      ["انصراف‌ها", stats.totals.cancellations], ["کلاس‌های تکمیل ظرفیت", stats.totals.fullClasses],
    ]);

  await audit(user.id, "class_dashboard_export", "classes", undefined, `rows=${stats.rows.length}`);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="noor-classes-dashboard.xlsx"`,
    },
  });
}
