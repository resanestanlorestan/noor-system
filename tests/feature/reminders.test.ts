// Feature tests for the overdue-case reminder feature: the guarded server
// action, scoping, cooldown, recipient resolution and the automated cron sweep
// — against the real noor_feature database.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, form, featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import { sendRemindersAction } from "@/app/actions/reminders";
import { listOverdueCases, runAutomatedReminders } from "@/lib/reminders";

let f: Fixture;
// The reminder SMS assertions need specific phones on fixture accounts; the
// original values are saved and restored in afterAll so the suite stays
// re-runnable without a fresh noor_feature database (cross-file isolation).
let originalPhones: { act: string | null; rev: string | null } = { act: null, rev: null };

beforeAll(async () => {
  f = await featureSeed();
  const [actRow] = await db.select({ phone: s.users.phone }).from(s.users).where(eq(s.users.id, f.users.act.id));
  const [revRow] = await db.select({ phone: s.users.phone }).from(s.users).where(eq(s.users.id, f.users.rev.id));
  originalPhones = { act: actRow.phone, rev: revRow.phone };
  // Staff/activist phones used by SMS assertions below.
  await db.update(s.users).set({ phone: "09121110002" }).where(eq(s.users.id, f.users.rev.id));
  await db.update(s.users).set({ phone: "09121110005" }).where(eq(s.users.id, f.users.act.id));
}, 30_000);
beforeEach(resetCaseData);
afterAll(async () => {
  await db.update(s.users).set({ phone: originalPhones.act }).where(eq(s.users.id, f.users.act.id));
  await db.update(s.users).set({ phone: originalPhones.rev }).where(eq(s.users.id, f.users.rev.id));
  await closeDb();
});

const ago = (days: number) => new Date(Date.now() - days * 86400000);

/** Overdue pending case inserted directly, optionally assigned to the reviewer. */
async function overdueCase(options: { assigned?: boolean; ageDays?: number; creator?: "prov" | "act"; withActivistUser?: boolean; activistPhone?: string | null } = {}) {
  const { assigned = true, ageDays = 20, creator = "prov", withActivistUser = false, activistPhone = "09121110099" } = options;
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", phone: activistPhone,
    provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, city: "تهران",
    userId: withActivistUser ? f.users.act.id : null,
  }).returning();
  const [application] = await db.insert(s.applications).values({
    activistId: activist.id, status: "pending", source: creator === "act" ? "self" : "manager",
    createdBy: f.users[creator].id, assignedExpertId: assigned ? f.users.rev.id : null,
    submittedAt: ago(ageDays), createdAt: ago(ageDays), updatedAt: ago(ageDays),
  }).returning();
  return { activist, application };
}

const queryOf = (url: string) => new URL(url, "http://feature.local").searchParams;

describe("گارد دسترسی اکشن یادآور", () => {
  it("فعال قرآنی و کارشناس بررسی مجوز ارسال یادآور ندارند", async () => {
    await loginAs("act");
    expect(await redirectOf(() => sendRemindersAction(form({ days: "14" })))).toBe("/dashboard");
    await loginAs("rev");
    expect(await redirectOf(() => sendRemindersAction(form({ days: "14" })))).toBe("/dashboard");
  });
});

describe("ارسال دستی یادآور توسط مدیر استان", () => {
  it("یادآور به کارشناس ارجاع‌شده ارسال و در دفترچه، اعلان، صندوق پیام و ممیزی ثبت می‌شود", async () => {
    const { application } = await overdueCase();
    await loginAs("prov");
    const url = await redirectOf(() => sendRemindersAction(form({ days: "14" })));
    const query = queryOf(url);
    expect(url.startsWith("/reminders")).toBe(true);
    expect(query.get("sent")).toBe("1");
    expect(query.get("local")).toBe("1"); // no Kavenegar key in the test env

    const [ledger] = await db.select().from(s.caseReminders).where(eq(s.caseReminders.applicationId, application.id));
    expect(ledger.recipientId).toBe(f.users.rev.id);
    expect(ledger.recipientPhone).toBe("09121110002");
    expect(ledger.automated).toBe(false);
    expect(ledger.sentBy).toBe(f.users.prov.id);
    expect(ledger.message).toContain("زهرا موسوی");

    const [notification] = await db.select().from(s.notifications).where(eq(s.notifications.applicationId, application.id));
    expect(notification.userId).toBe(f.users.rev.id);
    expect(notification.title).toContain("یادآور");

    const [sms] = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.applicationId, application.id));
    expect(sms.channel).toBe("sms");
    expect(sms.recipient).toBe("09121110002");
    expect(sms.status).toBe("local");

    const [auditRow] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.targetId, application.id));
    expect(auditRow.action).toBe("send_reminder");
    expect(auditRow.actorId).toBe(f.users.prov.id);
  });

  it("بازه سه‌روزه از ارسال دوباره جلوگیری می‌کند", async () => {
    await overdueCase();
    await loginAs("prov");
    expect(queryOf(await redirectOf(() => sendRemindersAction(form({ days: "14" })))).get("sent")).toBe("1");
    const second = queryOf(await redirectOf(() => sendRemindersAction(form({ days: "14" }))));
    expect(second.get("sent")).toBe("0");
    expect(second.get("skipped")).toBe("1");
    expect((await db.select().from(s.caseReminders)).length).toBe(1);
  });

  it("انتخاب صریح caseIds فقط همان پرونده را یادآوری می‌کند", async () => {
    const { application: first } = await overdueCase();
    const { application: second } = await overdueCase({ ageDays: 25 });
    await loginAs("prov");
    const query = queryOf(await redirectOf(() => sendRemindersAction(form({ days: "14", caseIds: first.id }))));
    expect(query.get("sent")).toBe("1");
    const reminded = await db.select().from(s.caseReminders);
    expect(reminded.length).toBe(1);
    expect(reminded[0].applicationId).toBe(first.id);
    void second;
  });
});

describe("محدوده جغرافیایی و گیرنده جایگزین", () => {
  it("مدیر استان دیگر به پرونده‌های تهران دسترسی ندارد", async () => {
    await overdueCase();
    await loginAs("provFars");
    const query = queryOf(await redirectOf(() => sendRemindersAction(form({ days: "14" }))));
    expect(query.get("sent")).toBe("0");
    expect((await db.select().from(s.caseReminders)).length).toBe(0);
  });

  it("بدون کارشناس، ثبت‌کننده سازمانی گیرنده است؛ ثبت‌کننده فعال خودش گیرنده می‌شود", async () => {
    // staff-created, unassigned → the province admin (creator) gets the reminder
    const { application: staffCase } = await overdueCase({ assigned: false });
    // self-registered, unassigned → the activist's own user gets the reminder
    const { application: selfCase } = await overdueCase({ assigned: false, creator: "act", withActivistUser: true, ageDays: 30 });
    await loginAs("prov");
    const query = queryOf(await redirectOf(() => sendRemindersAction(form({ days: "14" }))));
    expect(query.get("sent")).toBe("2");
    const ledgers = await db.select().from(s.caseReminders);
    const staffRow = ledgers.find((row) => row.applicationId === staffCase.id)!;
    const selfRow = ledgers.find((row) => row.applicationId === selfCase.id)!;
    expect(staffRow.recipientId).toBe(f.users.prov.id);
    expect(staffRow.recipientPhone).toBeNull(); // prov fixture has no phone → notification only
    expect(selfRow.recipientId).toBe(f.users.act.id);
    expect(selfRow.recipientPhone).toBe("09121110099");
    const selfSms = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.applicationId, selfCase.id));
    expect(selfSms[0].body).toContain("پرونده شما");
    expect(selfSms[0].recipient).toBe("09121110099");
  });

  it("پرونده‌های جوان‌تر از آستانه در فهرست معوق‌ها نمی‌آیند", async () => {
    await overdueCase({ ageDays: 5 });
    await loginAs("prov");
    expect((await listOverdueCases(f.users.prov, 14)).length).toBe(0);
    expect((await listOverdueCases(f.users.prov, 7)).length).toBe(0);
  });
});

describe("ارسال خودکار (کرون)", () => {
  it("کرون با ستون خودکار و بدون ارسال‌کننده انسانی یادآور می‌فرستد و cooldown دارد", async () => {
    const { application } = await overdueCase();
    const first = await runAutomatedReminders(14);
    expect(first.sent).toBe(1);
    expect(first.localSms).toBe(1); // no Kavenegar key in the test env
    const [ledger] = await db.select().from(s.caseReminders).where(eq(s.caseReminders.applicationId, application.id));
    expect(ledger.automated).toBe(true);
    expect(ledger.sentBy).toBeNull();
    const second = await runAutomatedReminders(14);
    expect(second.sent).toBe(0);
    expect(second.cooldownSkipped).toBe(1);
  });
});
