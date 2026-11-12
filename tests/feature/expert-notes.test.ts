// Feature tests for مرحله هفتم:
// ۱) هنگام ارسال پرونده برای بررسی، علاوه بر اعلان و ایمیل، پیامک برای
//    مدیران استان/شهرستان در محدوده پرونده (و کارشناس ارجاع‌گرفته) صف می‌شود.
// ۲) یادداشت‌های کارشناسی: ثبت توسط کارکنان دارای مجوز، منع فعال و
//    کارشناس تخصصی، محدودیت محدوده جغرافیایی و حذف تنها توسط نویسنده.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, pdfFile, type Fixture, type UserKey,
} from "./helpers";
import { saveCaseAction, prepareCaseAction, submitCaseAction, uploadDocumentAction, assignExpertAction } from "@/app/actions/cases";
import { addExpertNoteAction, deleteExpertNoteAction } from "@/app/actions/expert-notes";
import { caseSubmittedSms } from "@/lib/messaging";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Gives every fixture account a mobile number so SMS routing can be asserted. */
async function giveStaffPhones() {
  const staff = ["super@feature.local", "prov@feature.local", "county@feature.local", "prov-fars@feature.local"];
  for (const [index, email] of staff.entries()) {
    await db.update(s.users).set({ phone: `0912345000${index}` }).where(eq(s.users.email, email));
  }
}

/** Draft + evidence + prepare + submit → a case in `pending`. */
async function pendingCase(creator: UserKey = "act", overrides: Record<string, string | string[]> = {}) {
  await loginAs(creator);
  const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, overrides)));
  const caseId = caseIdOf(url);
  await loginAs(creator);
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  await redirectOf(() => prepareCaseAction(form({ caseId })));
  await redirectOf(() => submitCaseAction(form({ caseId })));
  return caseId;
}

/** کارشناس بررسی تنها برای پرونده‌های ارجاع‌گرفته در محدوده است — ارجاع رسمی. */
async function assignReviewer(caseId: string) {
  const { users } = await featureSeed();
  await loginAs("prov");
  await redirectOf(() => assignExpertAction(form({ caseId, expertId: users.rev.id })));
}

describe("پیامک اطلاع‌رسانی ارسال پرونده (مرحله هفتم)", () => {
  it("با ارسال پرونده، برای مدیران استان و شهرستانِ محدوده پیامک صف می‌شود", async () => {
    await giveStaffPhones();
    const caseId = await pendingCase("act");
    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const smsRows = await db.select().from(s.messageOutbox).where(and(eq(s.messageOutbox.channel, "sms"), eq(s.messageOutbox.applicationId, caseId)));
    // مدیر ارشد، مدیر استان تهران و مدیر شهرستان تهران — نه مدیر استان فارس و نه خودِ فعال
    expect(smsRows.map((row) => row.recipient).sort()).toEqual(["09123450000", "09123450001", "09123450002"].sort());
    const expected = caseSubmittedSms("زهرا موسوی");
    for (const row of smsRows) {
      expect(row.body).toBe(expected);
      expect(row.status).toBe("local"); // بدون درگاه پیکربندی‌شده، پیامک در صندوق محلی می‌ماند
      expect(row.deliveredAt).not.toBeNull();
    }
    expect(expected).toContain(person.firstName);
    // اعلان درون‌برنامه‌ای و ایمیل از رفتار قبلی دست‌نخورده می‌مانند
    const notifications = await db.select().from(s.notifications).where(eq(s.notifications.applicationId, caseId));
    expect(notifications.length).toBeGreaterThanOrEqual(3);
    const emails = await db.select().from(s.messageOutbox).where(and(eq(s.messageOutbox.channel, "email"), eq(s.messageOutbox.applicationId, caseId)));
    expect(emails.length).toBeGreaterThanOrEqual(3);
  });

  it("کارکنان بدون شماره موبایل یا خارج از محدوده پیامک دریافت نمی‌کنند", async () => {
    // شماره‌های تست قبلی در جدول کاربران باقی می‌مانند؛ صریحاً پاک می‌کنیم
    await db.update(s.users).set({ phone: null }).where(inArray(s.users.email, ["super@feature.local", "prov@feature.local", "county@feature.local", "prov-fars@feature.local"]));
    const caseId = await pendingCase("act");
    const smsRows = await db.select().from(s.messageOutbox).where(and(eq(s.messageOutbox.channel, "sms"), eq(s.messageOutbox.applicationId, caseId)));
    expect(smsRows).toHaveLength(0);
    // اعلان‌ها همچنان ثبت می‌شوند
    const notifications = await db.select().from(s.notifications).where(eq(s.notifications.applicationId, caseId));
    expect(notifications.length).toBeGreaterThanOrEqual(3);
  });
});

describe("یادداشت‌های کارشناسی (مرحله هفتم)", () => {
  it("کارشناس دارای مجوز، روی پرونده ارسال‌شده یادداشت ثبت می‌کند", async () => {
    const caseId = await pendingCase("act");
    await loginAs("prov");
    const url = await redirectOf(() => addExpertNoteAction(form({ caseId, content: "مدارک تخصص قرآن‌پژوهی کامل است؛ پیشنهاد تأیید." })));
    expect(messageOf(url)).toContain("ثبت شد");
    const notes = await db.select().from(s.expertNotes).where(eq(s.expertNotes.applicationId, caseId));
    expect(notes).toHaveLength(1);
    const { users } = await featureSeed();
    expect(notes[0].authorId).toBe(users.prov.id);
    expect(notes[0].content).toBe("مدارک تخصص قرآن‌پژوهی کامل است؛ پیشنهاد تأیید.");
    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "add_expert_note"), eq(s.auditLogs.targetId, caseId)));
    expect(audits).toHaveLength(1);
  });

  it("فعالِ صاحب پرونده و کارشناس تخصصی اجازه ثبت یادداشت ندارند", async () => {
    const caseId = await pendingCase("act");
    await loginAs("act");
    const url = await redirectOf(() => addExpertNoteAction(form({ caseId, content: "تلاش فعال برای ثبت یادداشت." })));
    expect(messageOf(url)).toContain("مجاز نیست");
    await loginAs("spec");
    const url2 = await redirectOf(() => addExpertNoteAction(form({ caseId, content: "تلاش کارشناس تخصصی." })));
    expect(messageOf(url2)).toContain("مجاز نیست");
    const notes = await db.select().from(s.expertNotes).where(eq(s.expertNotes.applicationId, caseId));
    expect(notes).toHaveLength(0);
  });

  it("مدیر خارج از محدوده جغرافیایی پرونده نمی‌تواند یادداشت ثبت کند", async () => {
    // پرونده در شهرستان اسلامشهر ثبت می‌شود؛ مدیر شهرستان تهران خارج از محدوده است
    const caseId = await pendingCase("act", { countyId: String(f.islamshahrCountyId) });
    await loginAs("county");
    const url = await redirectOf(() => addExpertNoteAction(form({ caseId, content: "یادداشت خارج از محدوده." })));
    expect(messageOf(url)).toContain("مجاز نیست");
    const notes = await db.select().from(s.expertNotes).where(eq(s.expertNotes.applicationId, caseId));
    expect(notes).toHaveLength(0);
  });

  it("یادداشت کوتاه‌تر از حد مجاز رد می‌شود", async () => {
    const caseId = await pendingCase("act");
    await assignReviewer(caseId);
    await loginAs("rev");
    const url = await redirectOf(() => addExpertNoteAction(form({ caseId, content: "اک" })));
    expect(messageOf(url)).toContain("۳ نویسه");
    const notes = await db.select().from(s.expertNotes).where(eq(s.expertNotes.applicationId, caseId));
    expect(notes).toHaveLength(0);
  });

  it("حذف یادداشت تنها توسط نویسنده آن مجاز است", async () => {
    const caseId = await pendingCase("act");
    await assignReviewer(caseId);
    await loginAs("rev");
    await redirectOf(() => addExpertNoteAction(form({ caseId, content: "یادداشت کارشناس بررسی." })));
    const [note] = await db.select().from(s.expertNotes).where(eq(s.expertNotes.applicationId, caseId));
    // مدیر استان غیرنویسنده نمی‌تواند حذف کند
    await loginAs("prov");
    const url = await redirectOf(() => deleteExpertNoteAction(form({ caseId, noteId: note.id })));
    expect(messageOf(url)).toContain("نویسنده");
    expect(await db.select().from(s.expertNotes).where(eq(s.expertNotes.id, note.id))).toHaveLength(1);
    // نویسنده حذف می‌کند و ردپای audit ثبت می‌شود
    await loginAs("rev");
    const url2 = await redirectOf(() => deleteExpertNoteAction(form({ caseId, noteId: note.id })));
    expect(messageOf(url2)).toContain("حذف شد");
    expect(await db.select().from(s.expertNotes).where(eq(s.expertNotes.id, note.id))).toHaveLength(0);
    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "delete_expert_note"), eq(s.auditLogs.targetId, caseId)));
    expect(audits).toHaveLength(1);
  });

  it("مجوز cases.expert_notes برای نقش‌های بررسی پیش‌فرض فعال است", async () => {
    const { effectivePermissions } = await import("@/lib/permissions");
    const { users } = await featureSeed();
    const expected = [
      [users.prov, true],
      [users.county, true],
      [users.rev, true],
      [users.spec, false],
      [users.act, false],
    ] as const;
    for (const [user, allowed] of expected) {
      const grants = await effectivePermissions({ role: user.role, customRoleId: user.customRoleId });
      expect(grants.has("cases.expert_notes")).toBe(allowed);
    }
  });
});
