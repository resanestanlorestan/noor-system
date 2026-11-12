// Excel export of overdue cases (خروجی اکسل پرونده‌های معوق — Release 2.4، فاز ۱).
// Session-authenticated like /api/cases/export; gated by reminders.send so the
// audience matches the /reminders page. Rows always respect the caller's
// geographic scope via listOverdueCases, and phone numbers are masked.
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listOverdueCases, parseThreshold } from "@/lib/reminders";
import {
  OVERDUE_EXPORT_COLUMNS, buildOverdueRow, overdueFilename, overdueHeaderRows,
} from "@/lib/overdue-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: string | number) => typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await can(user, "reminders.send"))) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const days = parseThreshold(params.get("days"));
  try {
    const rows = await listOverdueCases(user, days);
    const workbook = new ExcelJS.Workbook(); workbook.creator = "سامانه نور"; workbook.created = new Date();
    const sheet = workbook.addWorksheet("پرونده‌های معوق", { views: [{ state: "frozen", ySplit: 6, rightToLeft: true }] });
    for (const line of overdueHeaderRows(days, rows.length)) sheet.addRow([line]);
    sheet.addRow([]);
    const header = sheet.addRow([...OVERDUE_EXPORT_COLUMNS]);
    header.font = { bold: true, color: { argb: "FF8A4B12" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3E0" } };
    sheet.columns = [{ width: 7 }, { width: 22 }, { width: 24 }, { width: 18 }, { width: 13 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 40 }];
    rows.forEach((row, index) => {
      sheet.addRow(buildOverdueRow(row, index).map(clean));
    });
    sheet.eachRow((row) => { row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true }; });
    const buffer = await workbook.xlsx.writeBuffer();
    await auditExport(user.id, `${rows.length} rows;days=${days}`);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${overdueFilename()}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch { return Response.json({ error: "تولید خروجی انجام نشد." }, { status: 500 }); }
}

async function auditExport(actorId: string, detail: string) {
  const { audit } = await import("@/lib/auth");
  await audit(actorId, "export_overdue_list", "report", undefined, detail);
}
