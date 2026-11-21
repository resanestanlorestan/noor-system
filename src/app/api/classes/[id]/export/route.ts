// الحاقیهٔ ۲.۱۹.۰ — خروجی اکسل هر کلاس: افراد واجد شرایط، ثبت‌نام‌کنندگان،
// انصراف‌داده‌ها، لیست انتظار، پیامک‌ها، شبکهٔ حضور و غیاب (کاربر × جلسه) و
// مشخصات کلاس. الگوی شیت RTL از مسیر خروجی پرونده‌ها؛ برای مدیران کلاس.
import ExcelJS from "exceljs";
import { audit, getCurrentUser } from "@/lib/auth";
import { canManageClass, getClassDetail, listClassAttendanceSummary, listClassSms, listEligibleAudience, listParticipants, listSessionAttendance, listSessions, listWaitlist, classFormatLabels, classSmsKindLabels, classStatusLabels, waitlistStatusLabels } from "@/lib/classes";
import { faDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => /^[=+\-@\t\r]/.test(String(value ?? "")) ? `'${String(value)}` : String(value ?? "");
const value = (input: string | number | boolean | null | undefined) => input === null || input === undefined || input === "" ? "—" : clean(input);
const stamp = (date: Date | string | null | undefined) => date ? faDate(new Date(date), true) : "—";

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

const EXPORT_TYPES = ["eligible", "participants", "cancelled", "waitlist", "sms", "attendance", "info"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
  if (!(await canManageClass(user, id))) return new Response("forbidden", { status: 403 });
  const typeRaw = new URL(request.url).searchParams.get("type") || "participants";
  const type = (EXPORT_TYPES as readonly string[]).includes(typeRaw) ? typeRaw as ExportType : "participants";
  const detail = await getClassDetail(id);
  if (!detail) return new Response("not found", { status: 404 });

  const workbook = new ExcelJS.Workbook();
  const classLine = `کلاس «${detail.title}» — موضوع: ${detail.topic} — وضعیت: ${classStatusLabels[detail.status]} — مدرس: ${detail.teacherName}`;

  if (type === "eligible") {
    const rows = await listEligibleAudience(id);
    addSheet(workbook, "واجد شرایط", `${classLine} | جامعهٔ هدف: ${rows.length} نفر`, ["ردیف", "نام و نام خانوادگی", "شهرستان", "گروه‌ها", "موبایل", "ثبت‌نام‌شده", "دعوت‌شده"], [7, 28, 18, 30, 16, 12, 12],
      rows.map((r, i) => [i + 1, value(r.fullName), value(r.county), value(r.specialties), value(r.phone), r.registered ? "بله" : "خیر", r.invited ? "بله" : "خیر"]));
  } else if (type === "participants" || type === "cancelled") {
    const rows = await listParticipants(id, { status: type === "cancelled" ? "cancelled" : "registered" });
    addSheet(workbook, type === "cancelled" ? "انصراف‌داده‌ها" : "ثبت‌نام‌کنندگان", `${classLine} | تعداد: ${rows.length} نفر`,
      ["ردیف", "نام کاربر", "نام پرونده", "موبایل", "شهرستان", "گروه‌ها", "منبع", "تاریخ ثبت‌نام", "تاریخ انصراف", "دلیل"],
      [7, 24, 24, 16, 16, 26, 14, 18, 18, 24],
      rows.map((r, i) => [i + 1, value(r.userFullName), value(r.caseName), value(r.phone), value(r.county), value(r.specialties),
        r.source === "waitlist" ? "لیست انتظار" : r.source === "admin" ? "ادمین" : "ثبت‌نام مستقیم",
        stamp(r.registeredAt), stamp(r.cancelledAt), value(r.cancelReason)]));
  } else if (type === "waitlist") {
    const rows = await listWaitlist(id);
    addSheet(workbook, "لیست انتظار", `${classLine} | تعداد: ${rows.length} نفر`,
      ["نوبت", "نام کاربر", "موبایل", "شهرستان", "وضعیت", "تاریخ درخواست", "زمان دعوت", "مهلت پاسخ", "زمان پاسخ"],
      [7, 26, 16, 16, 14, 18, 18, 18, 18],
      rows.map((r) => [r.position, value(r.userFullName), value(r.userPhone), value(r.county), waitlistStatusLabels[r.status] ?? r.status,
        stamp(r.createdAt), stamp(r.invitedAt), stamp(r.respondDeadline), stamp(r.respondedAt)]));
  } else if (type === "sms") {
    const rows = await listClassSms(id);
    addSheet(workbook, "پیامک‌ها", `${classLine} | تعداد ردیف‌ها: ${rows.length}`, ["ردیف", "نوع", "گیرنده", "نام", "وضعیت", "متن", "خطا", "زمان"], [7, 16, 16, 20, 10, 60, 20, 18],
      rows.map((r, i) => [i + 1, classSmsKindLabels[r.kind] ?? r.kind, value(r.phone), value(r.userFullName), r.status === "sent" ? "ارسال‌شده" : r.status === "failed" ? "ناموفق" : r.status === "local" ? "محلی" : "در صف", value(r.message), value(r.error), stamp(r.sentAt ?? r.createdAt)]));
  } else if (type === "attendance") {
    const sessions = await listSessions(id);
    const sessionAttendance = await Promise.all(sessions.map((s) => listSessionAttendance(id, s.id)));
    const grid = new Map<string, Map<string, string>>();
    for (let i = 0; i < sessions.length; i++) {
      for (const row of sessionAttendance[i]) {
        if (!grid.has(row.userId)) grid.set(row.userId, new Map());
        grid.get(row.userId)!.set(sessions[i].id, row.status);
      }
    }
    const summary = await listClassAttendanceSummary(id);
    const statusLabel = (s: string) => s === "present" ? "حاضر" : s === "late" ? "تأخیر" : s === "excused" ? "غیبت موجه" : s === "absent" ? "غایب" : "—";
    const rows = summary.map((entry, i) => {
      const marks = sessions.map((s) => statusLabel(grid.get(entry.userId)?.get(s.id) ?? ""));
      return [i + 1, value(entry.userFullName), ...marks, entry.tally.present, entry.tally.absent, entry.tally.late, entry.tally.excused, `${entry.percent}٪`];
    });
    addSheet(workbook, "حضور و غیاب", `${classLine} | تعداد جلسات: ${sessions.length}`,
      ["ردیف", "نام و نام خانوادگی", ...sessions.map((s) => `جلسهٔ ${s.sessionNo} (${s.startsOn})`), "حاضر", "غایب", "تأخیر", "غیبت موجه", "درصد حضور"],
      [7, 26, ...sessions.map(() => 22), 8, 8, 8, 10, 11], rows);
  } else {
    addSheet(workbook, "مشخصات", classLine, ["فیلد", "مقدار"], [22, 60], [
      ["عنوان", value(detail.title)], ["موضوع", value(detail.topic)], ["توضیحات", value(detail.description)],
      ["سرفصل‌ها", value(detail.syllabus)], ["وضعیت", classStatusLabels[detail.status]],
      ["نوع برگزاری", classFormatLabels[detail.formatType]], ["ظرفیت", detail.capacity],
      ["ثبت‌نام‌کنندگان", detail.registeredCount], ["لیست انتظار", detail.waitlistCount],
      ["واجد شرایط", detail.eligibleCount], ["پیامک‌ها", detail.smsCount],
      ["تاریخ برگزاری", `${detail.startsOn} ${detail.startTime} تا ${detail.endTime}`],
      ["محل برگزاری", value(detail.location)], ["آدرس", value(detail.address)],
      ["استاد", value(detail.teacherName)], ["تلفن استاد", value(detail.teacherPhone)],
      ["مهلت ثبت‌نام", stamp(detail.registrationDeadline)],
      ["شهرستان‌های هدف", detail.counties.map((c) => c.county).join("، ") || "—"],
      ["گروه‌های هدف", detail.specialties.map((s) => s.specialty).join("، ") || "—"],
      ["تعداد جلسات", detail.sessions.length],
    ]);
  }

  await audit(user.id, "class_export", "class", id, `type=${type}`);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="noor-class-${type}-${id.slice(0, 8)}.xlsx"`,
    },
  });
}
