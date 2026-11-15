// الحاقیهٔ ۲.۱۵.۰ — API ورودی فهرست و ایجاد پرونده‌ها (/api/v1/cases)
// GET: فهرست صفحه‌بندی‌شدهٔ پرونده‌های فعال با فیلتر وضعیت و جست‌وجو (دسترسی cases:read)
// POST: ایجاد پروندهٔ تازه از دادهٔ سامانهٔ خارجی (دسترسی cases:write)
// همهٔ درخواست‌ها با کلید Bearer احراز و در تاریخچهٔ API ثبت می‌شوند.
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activists, applications, counties, provinces } from "@/db/schema";
import { validIranMobile } from "@/lib/validation";
import { validNationalId } from "@/lib/format";
import { normalizeIranMobile } from "@/lib/messaging";
import { protectNationalId, decryptSecret } from "@/lib/local-secrets";
import { apiError, guardIncomingApi, logApiRequest } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const started = () => Date.now();

export async function GET(request: Request) {
  const began = started();
  const url = new URL(request.url);
  let apiKeyId: string | null = null;
  try {
    const guard = await guardIncomingApi(request, "cases:read");
    if (!guard.ok) {
      await logApiRequest({ direction: "incoming", method: "GET", path: url.pathname, statusCode: guard.response.status, ok: false, durationMs: Date.now() - began, error: "guard" });
      return guard.response;
    }
    apiKeyId = guard.key.id;
    const status = url.searchParams.get("status") || "";
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 20) || 20));
    const conditions = [isNull(applications.deletedAt)];
    if (/^[a-z_]+$/.test(status)) conditions.push(eq(applications.status, status as "draft"));
    if (q) conditions.push(or(ilike(activists.firstName, `%${q}%`), ilike(activists.lastName, `%${q}%`), ilike(activists.phone, `%${q}%`))!);
    const where = and(...conditions);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(where);
    const rows = await db.select({
      id: applications.id, status: applications.status, source: applications.source, createdAt: applications.createdAt, submittedAt: applications.submittedAt,
      firstName: activists.firstName, lastName: activists.lastName, fatherName: activists.fatherName,
      phone: activists.phone, alternatePhone: activists.alternatePhone, nationalIdLast4: activists.nationalIdLast4, nationalIdCipher: activists.nationalIdCipher,
      job: activists.job, organization: activists.organization,
      province: provinces.name, county: counties.name,
    }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id))
      .leftJoin(provinces, eq(activists.provinceId, provinces.id)).leftJoin(counties, eq(activists.countyId, counties.id))
      .where(where).orderBy(desc(applications.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    const data = await Promise.all(rows.map(async (row) => ({
      id: row.id, status: row.status, source: row.source, createdAt: row.createdAt, submittedAt: row.submittedAt,
      firstName: row.firstName, lastName: row.lastName, fatherName: row.fatherName,
      nationalId: row.nationalIdCipher ? await decryptSecret(row.nationalIdCipher, "national-id-encryption-v1") : null,
      nationalIdLast4: row.nationalIdLast4, phone: row.phone, alternatePhone: row.alternatePhone,
      job: row.job, organization: row.organization, province: row.province, county: row.county,
    })));
    await logApiRequest({ direction: "incoming", method: "GET", path: url.pathname, apiKeyId, statusCode: 200, ok: true, durationMs: Date.now() - began, responseSnippet: `total=${total};page=${page}` });
    return Response.json({ ok: true, data, meta: { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await logApiRequest({ direction: "incoming", method: "GET", path: url.pathname, apiKeyId, statusCode: 500, ok: false, durationMs: Date.now() - began, error: message });
    return apiError(500, "خواندن فهرست پرونده‌ها انجام نشد.");
  }
}

export async function POST(request: Request) {
  const began = started();
  const url = new URL(request.url);
  let apiKeyId: string | null = null;
  let payload: string | null = null;
  try {
    const guard = await guardIncomingApi(request, "cases:write");
    if (!guard.ok) {
      await logApiRequest({ direction: "incoming", method: "POST", path: url.pathname, statusCode: guard.response.status, ok: false, durationMs: Date.now() - began, error: "guard" });
      return guard.response;
    }
    apiKeyId = guard.key.id;
    if (!guard.key.createdBy) return apiError(500, "کلید بدون کاربر سازنده است.");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    payload = body ? JSON.stringify(body) : null;
    if (!body) return apiError(400, "بدنهٔ درخواست باید JSON معتبر باشد.");
    const str = (field: string) => typeof body[field] === "string" ? (body[field] as string).trim() : "";
    const firstName = str("firstName"), lastName = str("lastName"), fatherName = str("fatherName");
    const nationalId = str("nationalId").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
    const phone = normalizeIranMobile(str("phone"));
    if (!firstName || !lastName || !fatherName) return apiError(400, "نام، نام خانوادگی و نام پدر الزامی است.");
    if (!/^\d{10}$/.test(nationalId) || !validNationalId(nationalId)) return apiError(400, "کد ملی معتبر نیست؛ ده رقم با رقم کنترل درست لازم است.");
    if (!validIranMobile(phone)) return apiError(400, "شمارهٔ موبایل معتبر وارد کنید؛ مانند 09123456789.");
    const protectedId = await protectNationalId(nationalId);
    const [existing] = await db.select({ id: applications.id }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id))
      .where(and(eq(activists.nationalIdHash, protectedId.hash), isNull(activists.deletedAt))).limit(1);
    if (existing) return apiError(409, `کد ملی با یک پروندهٔ فعال تکراری است؛ شناسهٔ پرونده: ${existing.id}`);
    const caseId = await db.transaction(async (tx) => {
      const [activist] = await tx.insert(activists).values({
        firstName, lastName, fatherName, phone,
        nationalIdCipher: protectedId.cipher, nationalIdHash: protectedId.hash, nationalIdLast4: protectedId.last4,
        alternatePhone: normalizeIranMobile(str("alternatePhone")) || null, email: str("email") || null,
        idCardNumber: str("idCardNumber") || null, idIssuePlace: str("idIssuePlace") || null,
        gender: str("gender") === "male" || str("gender") === "female" ? str("gender") : null,
        city: str("city") || null, address: str("address") || null,
        organization: str("organization") || null, job: str("job") || null,
      }).returning({ id: activists.id });
      const [application] = await tx.insert(applications).values({ activistId: activist.id, status: "draft", source: "api", createdBy: guard.key.createdBy! }).returning({ id: applications.id });
      return application.id;
    });
    await logApiRequest({ direction: "incoming", method: "POST", path: url.pathname, apiKeyId, statusCode: 201, ok: true, durationMs: Date.now() - began, payload, responseSnippet: `caseId=${caseId}` });
    return Response.json({ ok: true, data: { caseId, status: "draft" } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await logApiRequest({ direction: "incoming", method: "POST", path: url.pathname, apiKeyId, statusCode: 500, ok: false, durationMs: Date.now() - began, payload, error: message });
    return apiError(500, "ایجاد پرونده از طریق API انجام نشد.");
  }
}
