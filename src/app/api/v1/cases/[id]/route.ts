// الحاقیهٔ ۲.۱۵.۰ — API ورودی جزئیات، ویرایش تماس و حذف نرم پرونده
// GET /api/v1/cases/{id} — جزئیات پرونده (cases:read)
// PUT /api/v1/cases/{id} — ویرایش اطلاعات تماس و نشانی (cases:write)
// DELETE /api/v1/cases/{id} — حذف نرم هماهنگ با داشبورد (cases:write)
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activists, applications } from "@/db/schema";
import { validIranMobile } from "@/lib/validation";
import { normalizeIranMobile } from "@/lib/messaging";
import { decryptSecret } from "@/lib/local-secrets";
import { apiError, guardIncomingApi, logApiRequest } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadCase(id: string) {
  const [row] = await db.select({ application: applications, activist: activists }).from(applications)
    .innerJoin(activists, eq(applications.activistId, activists.id))
    .where(and(eq(applications.id, id), isNull(applications.deletedAt))).limit(1);
  return row || null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const began = Date.now();
  const { id } = await context.params;
  let apiKeyId: string | null = null;
  try {
    const guard = await guardIncomingApi(request, "cases:read");
    if (!guard.ok) { await logApiRequest({ direction: "incoming", method: "GET", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: guard.response.status, ok: false, durationMs: Date.now() - began, error: "guard" }); return guard.response; }
    apiKeyId = guard.key.id;
    if (!CASE_ID.test(id)) return apiError(400, "شناسهٔ پرونده معتبر نیست.");
    const row = await loadCase(id);
    if (!row) return apiError(404, "پرونده یافت نشد یا حذف شده است.");
    const data = {
      id: row.application.id, status: row.application.status, source: row.application.source,
      createdAt: row.application.createdAt, submittedAt: row.application.submittedAt,
      firstName: row.activist.firstName, lastName: row.activist.lastName, fatherName: row.activist.fatherName,
      nationalId: row.activist.nationalIdCipher ? await decryptSecret(row.activist.nationalIdCipher, "national-id-encryption-v1") : null,
      phone: row.activist.phone, alternatePhone: row.activist.alternatePhone, email: row.activist.email,
      birthDate: row.activist.birthDate, gender: row.activist.gender,
      city: row.activist.city, address: row.activist.address, job: row.activist.job, organization: row.activist.organization,
    };
    await logApiRequest({ direction: "incoming", method: "GET", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 200, ok: true, durationMs: Date.now() - began });
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await logApiRequest({ direction: "incoming", method: "GET", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 500, ok: false, durationMs: Date.now() - began, error: message });
    return apiError(500, "خواندن پرونده انجام نشد.");
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const began = Date.now();
  const { id } = await context.params;
  let apiKeyId: string | null = null;
  let payload: string | null = null;
  try {
    const guard = await guardIncomingApi(request, "cases:write");
    if (!guard.ok) { await logApiRequest({ direction: "incoming", method: "PUT", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: guard.response.status, ok: false, durationMs: Date.now() - began, error: "guard" }); return guard.response; }
    apiKeyId = guard.key.id;
    if (!CASE_ID.test(id)) return apiError(400, "شناسهٔ پرونده معتبر نیست.");
    const row = await loadCase(id);
    if (!row) return apiError(404, "پرونده یافت نشد یا حذف شده است.");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    payload = body ? JSON.stringify(body) : null;
    if (!body) return apiError(400, "بدنهٔ درخواست باید JSON معتبر باشد.");
    const str = (field: string) => typeof body[field] === "string" ? (body[field] as string).trim() : null;
    const phone = str("phone") ? normalizeIranMobile(str("phone")!) : null;
    if (phone && !validIranMobile(phone)) return apiError(400, "شمارهٔ موبایل معتبر وارد کنید؛ مانند 09123456789.");
    const patch: Partial<typeof activists.$inferInsert> = {};
    if (phone) patch.phone = phone;
    if (str("alternatePhone")) patch.alternatePhone = normalizeIranMobile(str("alternatePhone")!);
    for (const field of ["email", "city", "postalCode", "address", "job", "organization"] as const) {
      const value = str(field);
      if (value !== null) patch[field] = value || null;
    }
    if (!Object.keys(patch).length) return apiError(400, "هیچ فیلد قابل ویرایشی ارسال نشده است؛ فیلدهای مجاز: phone، alternatePhone، email، city، postalCode، address، job، organization.");
    await db.transaction(async (tx) => {
      await tx.update(activists).set({ ...patch, updatedAt: new Date() }).where(eq(activists.id, row.activist.id));
      await tx.update(applications).set({ updatedAt: new Date() }).where(eq(applications.id, id));
    });
    await logApiRequest({ direction: "incoming", method: "PUT", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 200, ok: true, durationMs: Date.now() - began, payload });
    return Response.json({ ok: true, data: { id, updated: Object.keys(patch) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await logApiRequest({ direction: "incoming", method: "PUT", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 500, ok: false, durationMs: Date.now() - began, payload, error: message });
    return apiError(500, "ویرایش پرونده انجام نشد.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const began = Date.now();
  const { id } = await context.params;
  let apiKeyId: string | null = null;
  try {
    const guard = await guardIncomingApi(request, "cases:write");
    if (!guard.ok) { await logApiRequest({ direction: "incoming", method: "DELETE", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: guard.response.status, ok: false, durationMs: Date.now() - began, error: "guard" }); return guard.response; }
    apiKeyId = guard.key.id;
    if (!CASE_ID.test(id)) return apiError(400, "شناسهٔ پرونده معتبر نیست.");
    const row = await loadCase(id);
    if (!row) return apiError(404, "پرونده یافت نشد یا پیش‌تر حذف شده است.");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(applications).set({ deletedAt: now, updatedAt: now }).where(and(eq(applications.id, id), isNull(applications.deletedAt)));
      await tx.update(activists).set({ deletedAt: now, updatedAt: now }).where(and(eq(activists.id, row.activist.id), isNull(activists.deletedAt)));
    });
    await logApiRequest({ direction: "incoming", method: "DELETE", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 200, ok: true, durationMs: Date.now() - began });
    return Response.json({ ok: true, data: { id, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    await logApiRequest({ direction: "incoming", method: "DELETE", path: `/api/v1/cases/${id}`, apiKeyId, statusCode: 500, ok: false, durationMs: Date.now() - began, error: message });
    return apiError(500, "حذف پرونده انجام نشد.");
  }
}
