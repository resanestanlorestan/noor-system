// Feature tests for the events calendar: guarded server actions, geographic
// scoping of creation/invites, capacity, the pre-event reminder sweep (manual +
// cron), participant lifecycle — against the real noor_feature database.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirectOf, form, featureSeed, loginAs, resetCaseData, closeDb, type Fixture } from "./helpers";
import {
  addParticipantsAction, createEventAction, deleteEventAction, sendEventRemindersAction,
  setParticipantStatusAction, updateEventAction,
} from "@/app/actions/events";
import {
  eventSmsText, isReminderDue, listEvents, parseReminderHours, reminderWindow, runAutomatedEventReminders, sendEventReminders,
} from "@/lib/events";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Tehran-local datetime-local value, same format the UI submits. */
const localInput = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date).replace(" ", "T");
const ahead = (hours: number) => new Date(Date.now() + hours * 3600000);

async function scopedActivist(options: { provinceId: number | null; countyId?: number | null; phone?: string | null; userId?: string | null } = { provinceId: null }) {
  const [activist] = await db.insert(s.activists).values({
    firstName: "زهرا", lastName: "موسوی", fatherName: "حسین", gender: "female",
    birthDate: "1375-01-01", phone: options.phone === undefined ? "09121110099" : options.phone,
    provinceId: options.provinceId, countyId: options.countyId ?? null,
    city: "تهران", userId: options.userId ?? null,
  }).returning();
  return activist;
}

async function makeEvent(options: { creator: "super" | "prov" | "county"; startsAt?: Date; capacity?: number; reminderHours?: number; title?: string } = { creator: "prov" }) {
  await loginAs(options.creator);
  const url = await redirectOf(() => createEventAction({}, form({
    title: options.title ?? "هم‌اندیشی فعالان استان تهران",
    kind: "workshop", startsAt: localInput(options.startsAt ?? ahead(72)),
    location: "سالن اجلاس", capacity: options.capacity ? String(options.capacity) : "",
    reminderHours: String(options.reminderHours ?? 48),
    description: "برنامه ماهانه هم‌اندیشی",
  })));
  const id = new URL(url, "http://feature.local").searchParams.get("created")!;
  const [row] = await db.select().from(s.events).where(eq(s.events.id, id));
  return row;
}

const queryOf = (url: string) => new URL(url, "http://feature.local").searchParams;

describe("توابع خالص تقویم", () => {
  it("پنجره یادآور و آستانه‌ها", () => {
    const start = new Date("2026-12-01T09:00:00Z");
    expect(reminderWindow(start, 48).opensAt).toEqual(new Date("2026-11-29T09:00:00Z"));
    expect(isReminderDue(start, 48, new Date("2026-11-29T08:59:00Z"))).toBe(false);
    expect(isReminderDue(start, 48, new Date("2026-11-29T09:01:00Z"))).toBe(true);
    expect(isReminderDue(start, 48, new Date("2026-12-01T09:01:00Z"))).toBe(false); // already started
    expect(parseReminderHours("72")).toBe(72);
    expect(parseReminderHours("99")).toBe(48);
    expect(eventSmsText("هم‌اندیشی", start, "سالن اجلاس")).toContain("سامانه نور:");
    expect(eventSmsText("هم‌اندیشی", start, "سالن اجلاس")).toContain("هم‌اندیشی");
    expect(eventSmsText("هم‌اندیشی", start, null)).not.toContain("محل");
  });
});

describe("گارد و ثبت رویداد", () => {
  it("فعال و کارشناس بررسی اجازه مدیریت رویداد ندارند", async () => {
    await loginAs("act");
    expect(await redirectOf(() => createEventAction({}, form({ title: "رویداد", kind: "meeting", startsAt: localInput(ahead(72)) })))).toBe("/dashboard");
    await loginAs("rev");
    expect(await redirectOf(() => createEventAction({}, form({ title: "رویداد", kind: "meeting", startsAt: localInput(ahead(72)) })))).toBe("/dashboard");
  });

  it("مدیر استان رویداد استانی ثبت می‌کند؛ شهرستان هم در همان استان می‌ماند", async () => {
    const event = await makeEvent({ creator: "prov" });
    expect(event.provinceId).toBe(f.tehranProvinceId);
    expect(event.countyId).toBeNull();
    expect(event.createdBy).toBe(f.users.prov.id);
    expect(event.reminderHours).toBe(48);

    const countyEvent = await makeEvent({ creator: "county", title: "کارگاه شهرستان تهران" });
    expect(countyEvent.provinceId).toBe(f.tehranProvinceId);
    expect(countyEvent.countyId).toBe(f.tehranCountyId);
  });

  it("اعتبارسنجی عنوان و ساعت شروع", async () => {
    await loginAs("prov");
    const short = await createEventAction({}, form({ title: "رو", kind: "meeting", startsAt: localInput(ahead(72)) }));
    expect(short.error).toContain("عنوان");
    const bad = await createEventAction({}, form({ title: "رویداد معتبر", kind: "meeting", startsAt: "نامعتبر" }));
    expect(bad.error).toContain("شروع");
  });
});

describe("دعوت فعالان و ظرفیت", () => {
  it("دعوت فعال خارج از محدوده رد می‌شود؛ فعال هم‌محدوده دعوت می‌شود", async () => {
    const event = await makeEvent({ creator: "prov" });
    const farsActivist = await scopedActivist({ provinceId: (await db.select().from(s.provinces)).find((row) => row.name === "فارس")!.id });
    const tehranActivist = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId });
    await loginAs("prov");
    const rejected = await addParticipantsAction({}, form({ eventId: event.id, activistIds: farsActivist.id }));
    expect(rejected.error).toContain("محدوده");
    expect((await db.select().from(s.eventParticipants)).length).toBe(0);

    const accepted = await addParticipantsAction({}, form({ eventId: event.id, activistIds: tehranActivist.id }));
    expect(accepted.error).toBeUndefined();
    const [participant] = await db.select().from(s.eventParticipants);
    expect(participant.status).toBe("invited");
    expect(participant.remindedAt).toBeNull();
  });

  it("دعوت تکراری بی‌اثر و ظرفیت پر کنترل می‌شود", async () => {
    const event = await makeEvent({ creator: "prov", capacity: 2 });
    const one = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId });
    const two = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId });
    const three = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId });
    await loginAs("prov");
    expect((await addParticipantsAction({}, form({ eventId: event.id, activistIds: [one.id, two.id] }))).error).toBeUndefined();
    const duplicate = await addParticipantsAction({}, form({ eventId: event.id, activistIds: one.id }));
    expect(duplicate.error).toContain("قبلاً");
    const overflow = await addParticipantsAction({}, form({ eventId: event.id, activistIds: three.id }));
    expect(overflow.error).toContain("ظرفیت");
    expect((await db.select().from(s.eventParticipants)).length).toBe(2);
  });
});

describe("یادآور پیامکی پیش از رویداد", () => {
  it("پیش از باز شدن پنجره یادآوری ارسالی نیست؛ در پنجره، پیامک محلی و ممیزی ثبت می‌شود", async () => {
    const event = await makeEvent({ creator: "prov", startsAt: ahead(72), reminderHours: 48 });
    const activist = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, phone: "09121110777" });
    await loginAs("prov");
    await addParticipantsAction({}, form({ eventId: event.id, activistIds: activist.id }));

    const early = queryOf(await redirectOf(() => sendEventRemindersAction({}, form({ eventId: event.id }))));
    expect(early.get("reminded")).toBe("0");
    expect((await db.select().from(s.eventParticipants))[0].remindedAt).toBeNull();

    // bring the start inside the reminder window
    await db.update(s.events).set({ startsAt: ahead(1) }).where(eq(s.events.id, event.id));
    const late = queryOf(await redirectOf(() => sendEventRemindersAction({}, form({ eventId: event.id }))));
    expect(late.get("reminded")).toBe("1");
    expect(late.get("local")).toBe("1"); // no Kavenegar key in the test env

    const [participant] = await db.select().from(s.eventParticipants);
    expect(participant.remindedAt).not.toBeNull();
    const [sms] = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.channel, "sms"));
    expect(sms.recipient).toBe("09121110777");
    expect(sms.status).toBe("local");
    expect(sms.body).toContain(event.title);
    const [auditRow] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "send_event_reminder"));
    expect(auditRow.targetId).toBe(event.id);
    expect(auditRow.actorId).toBe(f.users.prov.id);

    const again = queryOf(await redirectOf(() => sendEventRemindersAction({}, form({ eventId: event.id }))));
    expect(again.get("reminded")).toBe("0"); // reminded_at makes the sweep idempotent
  });

  it("دعوت‌شده منصرف یادآور نمی‌گیرد و فعالِ دارای حساب اعلان می‌بیند", async () => {
    const event = await makeEvent({ creator: "prov", startsAt: ahead(2), reminderHours: 48 });
    const withAccount = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, phone: null, userId: f.users.act.id });
    await loginAs("prov");
    await addParticipantsAction({}, form({ eventId: event.id, activistIds: withAccount.id }));
    await db.update(s.eventParticipants).set({ status: "cancelled" }).where(eq(s.eventParticipants.eventId, event.id));
    const summary = await sendEventReminders(f.users.prov, { eventIds: [event.id] });
    expect(summary.sent).toBe(0);
    expect(summary.skippedCancelled).toBe(1);

    await db.update(s.eventParticipants).set({ status: "invited" }).where(eq(s.eventParticipants.eventId, event.id));
    const second = await sendEventReminders(f.users.prov, { eventIds: [event.id] });
    expect(second.sent).toBe(1);
    expect(second.withoutPhone).toBe(1); // no phone → notification only
    const [notification] = await db.select().from(s.notifications).where(eq(s.notifications.userId, f.users.act.id));
    expect(notification.title).toContain("یادآور رویداد");
    expect(notification.body).toContain(event.title);
  });

  it("کرون خودکار فقط رویدادهای داخل پنجره هر رویداد را یادآوری می‌کند و تکرار ندارد", async () => {
    const due = await makeEvent({ creator: "super", startsAt: ahead(6), reminderHours: 24, title: "رویداد نزدیک" });
    const far = await makeEvent({ creator: "super", startsAt: ahead(120), reminderHours: 24, title: "رویداد دور" });
    const activist = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, phone: "09121110888" });
    await loginAs("super");
    await addParticipantsAction({}, form({ eventId: due.id, activistIds: activist.id }));
    await addParticipantsAction({}, form({ eventId: far.id, activistIds: activist.id }));

    const first = await runAutomatedEventReminders();
    expect(first.sent).toBe(1);
    const reminded = await db.select().from(s.eventParticipants).where(eq(s.eventParticipants.eventId, due.id));
    expect(reminded[0].remindedAt).not.toBeNull();
    const farRow = await db.select().from(s.eventParticipants).where(eq(s.eventParticipants.eventId, far.id));
    expect(farRow[0].remindedAt).toBeNull();

    const [ledgerSms] = await db.select().from(s.messageOutbox).where(eq(s.messageOutbox.channel, "sms"));
    expect(ledgerSms.body).toContain("رویداد نزدیک");

    const second = await runAutomatedEventReminders();
    expect(second.sent).toBe(0);
    void listEvents;
  });

  it("مدیر استان دیگر رویداد استان تهران را نمی‌بیند و یادآوری نمی‌کند", async () => {
    const event = await makeEvent({ creator: "prov", startsAt: ahead(1), reminderHours: 48 });
    const activist = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId, phone: "09121110901" });
    await loginAs("prov");
    await addParticipantsAction({}, form({ eventId: event.id, activistIds: activist.id }));
    await loginAs("provFars");
    const visible = await listEvents(f.users.provFars);
    expect(visible.find((row) => row.id === event.id)).toBeUndefined();
    const summary = await sendEventReminders(f.users.provFars, { eventIds: [event.id] });
    expect(summary.sent).toBe(0);
  });
});

describe("چرخه عمر دعوت‌نامه و رویداد", () => {
  it("تغییر وضعیت حضور و حذف رویداد با دعوت‌نامه‌ها", async () => {
    const event = await makeEvent({ creator: "prov" });
    const activist = await scopedActivist({ provinceId: f.tehranProvinceId, countyId: f.tehranCountyId });
    await loginAs("prov");
    await addParticipantsAction({}, form({ eventId: event.id, activistIds: activist.id }));
    const [participant] = await db.select().from(s.eventParticipants);

    const updated = await setParticipantStatusAction({}, form({ participantId: participant.id, status: "attended" }));
    expect(updated.error).toBeUndefined();
    expect((await db.select().from(s.eventParticipants))[0].status).toBe("attended");

    await updateEventAction({}, form({ eventId: event.id, title: "عنوان ویرایش‌شده", startsAt: localInput(ahead(96)), reminderHours: "72", capacity: "", location: "سالن دوم", description: "" }));
    const [edited] = await db.select().from(s.events).where(eq(s.events.id, event.id));
    expect(edited.title).toBe("عنوان ویرایش‌شده");
    expect(edited.reminderHours).toBe(72);

    await deleteEventAction({}, form({ eventId: event.id }));
    expect((await db.select().from(s.events).where(eq(s.events.id, event.id))).length).toBe(0);
    expect((await db.select().from(s.eventParticipants).where(eq(s.eventParticipants.eventId, event.id))).length).toBe(0);
  });
});
