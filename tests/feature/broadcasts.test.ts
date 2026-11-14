// Feature tests for group broadcast messaging: permission guard, audience
// preview, geographic scoping, delivery channels (SMS + in-app notification)
// and the audit trail — against the real noor_feature database.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, form, featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { sendBroadcastAction } from "@/app/actions/broadcasts";
import { previewAudience, sendBroadcast } from "@/lib/broadcasts";
import type { BroadcastFilters } from "@/lib/broadcasts";
import type { AppUser, SessionUser } from "@/lib/auth";

let f: Fixture;

/** Fixture users carry no custom role, so the effective role equals the base role. */
const asSession = (user: AppUser): SessionUser => ({ ...user, effectiveRole: user.role, customRoleLabel: null });

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

const NO_FILTER: BroadcastFilters = { onlyWithPhone: false };

/** Activist row inserted directly (no application needed for broadcasts). */
async function activist(options: { provinceId?: number; countyId?: number; phone?: string | null; userId?: string | null; firstName?: string; specialtyId?: number; status?: "pending" | "approved" | null } = {}) {
  const { provinceId = f.tehranProvinceId, countyId = f.tehranCountyId, phone = "09121110010", userId = null, firstName = "زهرا", specialtyId, status = null } = options;
  const [row] = await db.insert(s.activists).values({
    firstName, lastName: "موسوی", fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", phone, provinceId, countyId, city: "تهران", userId,
  }).returning();
  if (specialtyId) await db.insert(s.activistSpecialties).values({ activistId: row.id, specialtyId });
  if (status) {
    await db.insert(s.applications).values({
      activistId: row.id, status, source: "manager", createdBy: f.users.prov.id,
      submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
  }
  return row;
}

const queryOf = (url: string) => new URL(url, "http://feature.local").searchParams;
const composeForm = (overrides: Record<string, string> = {}) => form({
  subject: "اطلاعیه دوره آموزشی", body: "ثبت‌نام دوره تجوید از شنبه آغاز می‌شود.",
  ...overrides,
});

describe("گارد دسترسی اکشن پیام گروهی", () => {
  it("فعال قرآنی، کارشناس بررسی و کارشناس تخصصی مجوز ارسال ندارند", async () => {
    await loginAs("act");
    expect(await redirectOf(() => sendBroadcastAction(composeForm()))).toBe("/dashboard");
    await loginAs("rev");
    expect(await redirectOf(() => sendBroadcastAction(composeForm()))).toBe("/dashboard");
    await loginAs("spec");
    expect(await redirectOf(() => sendBroadcastAction(composeForm()))).toBe("/dashboard");
  });
});

describe("ارسال پیام گروهی توسط مدیر استان", () => {
  it("پیامک برای دارندگان شماره و اعلان برای دارندگان حساب ثبت می‌شود", async () => {
    await activist({ phone: "09121110010", userId: f.users.act.id });          // sms + notification
    await activist({ phone: "09121110011", firstName: "مریم" });               // sms only
    await activist({ phone: null, userId: f.users.spec.id, firstName: "ساره" }); // notification only
    await loginAs("prov");

    const url = await redirectOf(() => sendBroadcastAction(composeForm()));
    expect(url.startsWith("/broadcasts")).toBe(true);
    const query = queryOf(url);
    expect(query.get("sent")).toBe("3");
    expect(query.get("local")).toBe("2"); // no Kavenegar key in the test env
    expect(query.get("sms")).toBe("0");
    expect(query.get("notified")).toBe("2");

    const [ledger] = await db.select().from(s.messageBroadcasts);
    expect(ledger.subject).toBe("اطلاعیه دوره آموزشی");
    expect(ledger.recipientCount).toBe(3);
    expect(ledger.smsCount).toBe(2);
    expect(ledger.notificationCount).toBe(2);
    expect(ledger.withoutPhoneCount).toBe(1);
    expect(ledger.sentBy).toBe(f.users.prov.id);
    expect(ledger.audienceLabel).toBe("همه فعالان محدوده دسترسی");

    const smsRows = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.channel, "sms"));
    expect(smsRows.length).toBe(2);
    expect(smsRows.map((row) => row.recipient).sort()).toEqual(["09121110010", "09121110011"]);
    expect(smsRows[0].status).toBe("local");
    expect(smsRows[0].body).toContain("اطلاعیه دوره آموزشی");
    expect(smsRows[0].body).toContain("ثبت‌نام دوره تجوید");

    const notificationRows = await db.select().from(s.notifications);
    expect(notificationRows.length).toBe(2);
    expect(notificationRows.map((row) => row.userId).sort()).toEqual([f.users.act.id, f.users.spec.id].sort());
    expect(notificationRows[0].applicationId).toBeNull();
    expect(notificationRows[0].title).toBe("اطلاعیه دوره آموزشی");

    const [auditRow] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "send_broadcast"));
    expect(auditRow.actorId).toBe(f.users.prov.id);
    expect(auditRow.detail).toContain("recipients=3");
  });
});

describe("محدوده جغرافیایی و فیلترها", () => {
  it("مدیر استان دیگر به فعالان تهران دسترسی ندارد", async () => {
    await activist();
    await loginAs("provFars");
    const { summary } = await sendBroadcast(asSession(f.users.provFars), { subject: "آزمون", body: "متن" }, NO_FILTER);
    expect(summary).toBeNull();
    expect((await db.select().from(s.messageBroadcasts)).length).toBe(0);
    expect((await db.select().from(s.messageOutbox)).length).toBe(0);
  });

  it("مدیر شهرستان فقط فعالان همان شهرستان را می‌بیند", async () => {
    await activist({ countyId: f.tehranCountyId });
    await activist({ countyId: f.islamshahrCountyId, firstName: "نرگس" });
    await loginAs("county");
    const preview = await previewAudience(asSession(f.users.county), NO_FILTER);
    expect(preview.total).toBe(1);
    expect(preview.withPhone).toBe(1);
  });

  it("فیلتر وضعیت پرونده و تخصص مخاطبان را محدود می‌کند", async () => {
    await activist({ status: "pending" });
    await activist({ firstName: "مریم", status: "approved" });
    await activist({ firstName: "ساره", specialtyId: f.specialtyId });
    await loginAs("prov");
    const pendingOnly = await previewAudience(asSession(f.users.prov), { ...NO_FILTER, status: "pending" });
    expect(pendingOnly.total).toBe(1);
    const specialtyOnly = await previewAudience(asSession(f.users.prov), { ...NO_FILTER, specialtyId: f.specialtyId });
    expect(specialtyOnly.total).toBe(1);
    expect(specialtyOnly.sample[0].name).toContain("ساره");
  });

  it("گزینه فقط دارای شماره همراه، بدون‌شماره‌ها را حذف می‌کند", async () => {
    await activist({ phone: "09121110010" });
    await activist({ phone: null, firstName: "مریم" });
    await loginAs("prov");
    const preview = await previewAudience(asSession(f.users.prov), { onlyWithPhone: true });
    expect(preview.total).toBe(1);
    const { summary } = await sendBroadcast(asSession(f.users.prov), { subject: "یادآوری", body: "متن" }, { onlyWithPhone: true });
    expect(summary?.recipients).toBe(1);
    expect((await db.select().from(s.messageOutbox)).length).toBe(1);
  });
});

describe("اعتبارسنجی در سطح اکشن", () => {
  it("پیام بدون عنوان یا متن به صفحه با پیام خطا برمی‌گردد و چیزی ارسال نمی‌شود", async () => {
    await activist();
    await loginAs("prov");
    const url = await redirectOf(() => sendBroadcastAction(composeForm({ subject: "" })));
    expect(queryOf(url).get("error")).toBeTruthy();
    expect((await db.select().from(s.messageBroadcasts)).length).toBe(0);
    const url2 = await redirectOf(() => sendBroadcastAction(composeForm({ body: "" })));
    expect(queryOf(url2).get("error")).toBeTruthy();
    expect((await db.select().from(s.messageOutbox)).length).toBe(0);
  });

  it("بدون هیچ گیرنده‌ای خطای مخاطب خالی برمی‌گردد", async () => {
    await loginAs("prov");
    const url = await redirectOf(() => sendBroadcastAction(composeForm()));
    expect(queryOf(url).get("error")).toContain("هیچ فعالی");
  });
});
