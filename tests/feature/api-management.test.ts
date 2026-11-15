// Feature tests for الحاقیهٔ ۲.۱۵.۰ — مدیریت API و اتصال به سامانه‌های خارجی:
// گارد کلیدها (Bearer، سطح دسترسی، نرخ، کلید سراسری)، چرخهٔ کامل ورودی
// GET/POST/PUT/DELETE روی دادهٔ واقعی، وب‌هوک واقعی با امضای HMAC، ارسال مجدد
// درخواست ناموفق و ثبت ممیزی. فقط مدیر ارشد به بخش دسترسی دارد.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, closeDb, form, nationalId, type Fixture } from "./helpers";
import { encryptSecret } from "@/lib/local-secrets";
import { hashApiKey, WEBHOOK_SECRET_PURPOSE, ensureApiSettings } from "@/lib/api-keys";
import { dispatchWebhookEvent } from "@/lib/api-outgoing";
import { createApiKeyAction, upsertIntegrationAction, testIntegrationAction, retryApiLogAction } from "@/app/actions/api-management";
import { GET as listCases, POST as createCase } from "@/app/api/v1/cases/route";
import { GET as getCase, PUT as updateCase, DELETE as deleteCase } from "@/app/api/v1/cases/[id]/route";

let f: Fixture;
let port = 0;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

async function makeKey(name: string, scopes: string[], rateLimit?: number) {
  await loginAs("super"); // ساخت کلید فقط برای مدیر ارشد
  const data = form({ name });
  for (const scope of scopes) data.append("scopes", scope);
  if (rateLimit) data.set("rateLimit", String(rateLimit));
  const state = await createApiKeyAction({}, data);
  return state as { secret?: string; error?: string };
}

async function seedCase(national: string, phone = "09121110000") {
  const sealed = await (await import("@/lib/local-secrets")).protectNationalId(national);
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", gender: "female", phone,
    nationalIdLast4: national.slice(-4), nationalIdCipher: sealed.cipher, nationalIdHash: sealed.hash,
    provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "draft", source: "self", createdBy: f.users.act.id,
  }).returning();
  return { activist, application };
}

describe("گارد و کلیدهای API", () => {
  it("بدون کلید ۴۰۱، کلید نامعتبر ۴۰۱ و کلید بدون دسترسی ۴۰۳ می‌دهد", async () => {
    await seedCase(nationalId(`80001${String(Date.now()).slice(-3)}1`));
    const noKey = await listCases(new Request("http://feature.local/api/v1/cases"));
    expect(noKey.status).toBe(401);
    const badKey = await listCases(new Request("http://feature.local/api/v1/cases", { headers: bearer("nk_live_wrong") }));
    expect(badKey.status).toBe(401);
    const readKey = (await makeKey("فقط‌خواندن", ["cases:read"])).secret!;
    const post = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(readKey), "content-type": "application/json" }, body: JSON.stringify({ firstName: "الف", lastName: "ب", fatherName: "پ", nationalId: "0023456789", phone: "09123456789" }) }));
    expect(post.status).toBe(403);
  });

  it("مدیر غیر ارشد اجازهٔ ساخت کلید ندارد", async () => {
    await loginAs("prov");
    const state = await createApiKeyAction({}, form({ name: "کلید استان" }));
    expect(state.error).toBeTruthy();
  });

  it("کلید ساخته‌شده هش می‌شود و ممیزی ثبت می‌گردد", async () => {
    await loginAs("super");
    const state = await makeKey("سامانهٔ آزمون", ["cases:read", "cases:write"], 100);
    expect(state.secret).toMatch(/^nk_live_/);
    const [row] = await db.select().from(s.apiKeys).where(eq(s.apiKeys.keyHash, hashApiKey(state.secret!)));
    expect(row.name).toBe("سامانهٔ آزمون");
    expect(row.rateLimit).toBe(100);
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "api_key_create"));
    expect(audit).toBeTruthy();
  });
});

describe("چرخهٔ کامل API ورودی روی دادهٔ واقعی", () => {
  it("فهرست، جزئیات، ایجاد، ویرایش تماس و حذف نرم کار می‌کند", async () => {
    const seeded = await seedCase(nationalId(`80002${String(Date.now()).slice(-3)}1`));
    const key = (await makeKey("چرخهٔ کامل", ["cases:read", "cases:write"])).secret!;
    const list = await listCases(new Request("http://feature.local/api/v1/cases", { headers: bearer(key) }));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.data.some((row: { id: string }) => row.id === seeded.application.id)).toBe(true);
    expect(listBody.data[0].nationalId).toBeTruthy(); // کد ملی کامل برای کلید دارای دسترسی

    const detail = await getCase(new Request("http://feature.local/api/v1/cases", { headers: bearer(key) }), { params: Promise.resolve({ id: seeded.application.id }) });
    expect(detail.status).toBe(200);
    expect((await detail.json()).data.lastName).toBe("موسوی");

    const created = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(key), "content-type": "application/json" }, body: JSON.stringify({ firstName: "کارن", lastName: "APIآزمون", fatherName: "پدر", nationalId: "0045678901", phone: "09125556677", city: "تهران", gender: "female" }) }));
    expect(created.status).toBe(201);
    const caseId = (await created.json()).data.caseId as string;
    const [apiApp] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(apiApp.source).toBe("api");
    expect(apiApp.status).toBe("draft");
    const [apiActivist] = await db.select().from(s.activists).where(eq(s.activists.id, apiApp.activistId));
    expect(apiActivist.nationalIdHash).toBeTruthy();

    const duplicate = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(key), "content-type": "application/json" }, body: JSON.stringify({ firstName: "کارن", lastName: "دوم", fatherName: "پدر", nationalId: "0045678901", phone: "09125556677" }) }));
    expect(duplicate.status).toBe(409);

    const updated = await updateCase(new Request(`http://feature.local/api/v1/cases/${caseId}`, { method: "PUT", headers: { ...bearer(key), "content-type": "application/json" }, body: JSON.stringify({ phone: "09129998877", address: "نشانی تازه" }) }), { params: Promise.resolve({ id: caseId }) });
    expect(updated.status).toBe(200);
    const [afterPut] = await db.select().from(s.activists).where(eq(s.activists.id, apiApp.activistId));
    expect(afterPut.phone).toBe("09129998877");

    const removed = await deleteCase(new Request(`http://feature.local/api/v1/cases/${caseId}`, { method: "DELETE", headers: bearer(key) }), { params: Promise.resolve({ id: caseId }) });
    expect(removed.status).toBe(200);
    const [afterDelete] = await db.select({ deletedAt: s.applications.deletedAt }).from(s.applications).where(eq(s.applications.id, caseId));
    expect(afterDelete.deletedAt).toBeTruthy();

    // پس از حذف، ثبت مجدد همان کد ملی از طریق API آزاد است (هم‌ارز داشبورد)
    const recreated = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(key), "content-type": "application/json" }, body: JSON.stringify({ firstName: "کارن", lastName: "بازگشت", fatherName: "پدر", nationalId: "0045678901", phone: "09125556677" }) }));
    expect(recreated.status).toBe(201);
  });

  it("کد ملی نامعتبر و بدنهٔ خراب خطای ۴۰۰ می‌دهد", async () => {
    const key = (await makeKey("اعتبارسنجی", ["cases:write"])).secret!;
    const invalid = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(key), "content-type": "application/json" }, body: JSON.stringify({ firstName: "الف", lastName: "ب", fatherName: "پ", nationalId: "0000000000", phone: "09123456789" }) }));
    expect(invalid.status).toBe(400);
    const broken = await createCase(new Request("http://feature.local/api/v1/cases", { method: "POST", headers: { ...bearer(key), "content-type": "application/json" }, body: "not-json" }));
    expect(broken.status).toBe(400);
  });

  it("تجاوز از سقف نرخ کلید ۴۲۹ می‌دهد", async () => {
    const key = (await makeKey("نرخ پایین", ["cases:read"], 5)).secret!; // حداقل سقف مجاز ۵ است
    for (let index = 0; index < 5; index += 1) {
      const ok = await listCases(new Request("http://feature.local/api/v1/cases", { headers: bearer(key) }));
      expect(ok.status).toBe(200);
    }
    const limited = await listCases(new Request("http://feature.local/api/v1/cases", { headers: bearer(key) }));
    expect(limited.status).toBe(429);
  });

  it("غیرفعال‌کردن API ورودی سراسری همهٔ درخواست‌ها را ۵۰۳ می‌کند", async () => {
    const settings = await ensureApiSettings();
    await db.update(s.apiSettings).set({ incomingEnabled: false }).where(eq(s.apiSettings.id, settings.id));
    const key = (await makeKey("زمان خاموشی", ["cases:read"])).secret!;
    const response = await listCases(new Request("http://feature.local/api/v1/cases", { headers: bearer(key) }));
    expect(response.status).toBe(503);
    await db.update(s.apiSettings).set({ incomingEnabled: true }).where(eq(s.apiSettings.id, settings.id));
  });
});

describe("وب‌هوک و ارسال مجدد", () => {
  it("رویداد با امضای HMAC معتبر به مقصد واقعی می‌رسد و در تاریخچه ثبت می‌شود", async () => {
    const received: { signature: string | null; event: string | null; body: string }[] = [];
    const server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        received.push({ signature: request.headers["x-noor-signature"] as string | null, event: request.headers["x-noor-event"] as string | null, body });
        response.writeHead(200); response.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
    try {
      const secretCipher = await encryptSecret("whsec_test_123", WEBHOOK_SECRET_PURPOSE);
      const [webhook] = await db.insert(s.apiWebhooks).values({ name: "مقصد آزمون", eventKey: "case.reviewed", url: address, secretCipher, createdBy: f.users.super.id }).returning();
      await dispatchWebhookEvent("case.reviewed", { caseId: "abc", decision: "approved" });
      expect(received.length).toBe(1);
      expect(received[0]!.event).toBe("case.reviewed");
      const crypto = await import("node:crypto");
      const expected = crypto.createHmac("sha256", "whsec_test_123").update(received[0]!.body).digest("hex");
      expect(received[0]!.signature).toBe(expected);
      const parsed = JSON.parse(received[0]!.body);
      expect(parsed.data.decision).toBe("approved");
      const [fresh] = await db.select().from(s.apiWebhooks).where(eq(s.apiWebhooks.id, webhook.id));
      expect(fresh.lastStatusCode).toBe(200);
      const [log] = await db.select().from(s.apiRequestLogs).where(and(eq(s.apiRequestLogs.webhookId, webhook.id), eq(s.apiRequestLogs.ok, true)));
      expect(log).toBeTruthy();
    } finally { server.close(); }
  });

  it("درخواست خروجی ناموفق قابل ارسال مجدد است", async () => {
    // نخستین فراخوانی ۵۰۰ می‌دهد و ارسال مجدد ۲۰۰ — شمارندهٔ ضربه‌ها روی همان مقصد
    let hits = 0;
    const server = http.createServer((_request, response) => { hits += 1; response.writeHead(hits === 1 ? 500 : 200); response.end(hits === 1 ? "boom" : "ok"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/fail`;
    console.log("ADDR:", address);
    try {
      await loginAs("super");
      const state = await upsertIntegrationAction({}, form({ name: "مقصد خطا", baseUrl: address, authType: "none", token: "", headers: "" }));
      expect(state.success).toBeTruthy();
      const [integration] = await db.select().from(s.apiIntegrations).where(eq(s.apiIntegrations.name, "مقصد خطا"));
      const test = await testIntegrationAction({}, form({ id: integration.id }));
      expect(test.error).toContain("ناموفق");
      const [failed] = await db.select().from(s.apiRequestLogs).where(and(eq(s.apiRequestLogs.integrationId, integration.id), eq(s.apiRequestLogs.ok, false)));
      expect(failed).toBeTruthy();
      await retryApiLogAction(form({ id: failed.id }));
      expect(hits).toBe(2); // ارسال مجدد به همان مقصد دومین ضربه را ثبت کرد
      const [retried] = await db.select().from(s.apiRequestLogs).where(and(eq(s.apiRequestLogs.integrationId, integration.id), eq(s.apiRequestLogs.ok, true)));
      expect(retried).toBeTruthy();
    } finally { server.close(); }
  });
});
