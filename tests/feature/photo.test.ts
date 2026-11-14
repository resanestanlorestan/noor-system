// Feature tests for الحاقیهٔ ۲.۹.۳ — تصویر پرسنلی الزامی: سقف ۵۰۰ کیلوبایت،
// فرمت PNG/JPEG، پیوند تصویر با پرونده، توقف ارسال بدون تصویر و حذف تصویر.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, pdfFile, pngFile, oversizedPngFile, type Fixture,
} from "./helpers";
import { prepareCaseAction, submitCaseAction, uploadPhotoAction, removePhotoAction, uploadDocumentAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** یک پیش‌نویس کامل توسط فعال می‌سازد. */
async function draftCase() {
  await loginAs("act");
  return caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f))));
}

/** یک مدرک اثباتی بارگذاری می‌کند تا تنها مانعِ باقی‌مانده تصویر پرسنلی باشد. */
async function addEvidenceDoc(caseId: string) {
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile() }));
  expect(state.error).toBeUndefined();
}

describe("تصویر پرسنلی — الحاقیهٔ ۲.۹.۳", () => {
  it("بارگذاری تصویر معتبر با پرونده پیوند می‌شود و رویداد ممیزی می‌گذارد", async () => {
    const caseId = await draftCase();
    const state = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(state.error).toBeUndefined();
    expect(state.success).toBeTruthy();
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.id, app.activistId));
    expect(person.photoDocumentId).toBeTruthy();
    const [doc] = await db.select().from(s.documents).where(eq(s.documents.id, person.photoDocumentId!));
    expect(doc.kind).toBe("id_photo");
    expect(doc.mimeType).toBe("image/png");
    expect(doc.title).toBe("تصویر پرسنلی");
    expect(await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "upload_photo"))).toHaveLength(1);
  });

  it("تصویر بزرگ‌تر از ۵۰۰ کیلوبایت پذیرفته نمی‌شود", async () => {
    const caseId = await draftCase();
    const state = await uploadPhotoAction(caseId, {}, form({ file: oversizedPngFile() }));
    expect(state.error).toContain("۵۰۰ کیلوبایت");
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.id, app.activistId));
    expect(person.photoDocumentId).toBeNull();
  });

  it("فایل غیرتصویری برای تصویر پرسنلی رد می‌شود", async () => {
    const caseId = await draftCase();
    const state = await uploadPhotoAction(caseId, {}, form({ file: pdfFile("aks.pdf") }));
    expect(state.error).toContain("PNG یا JPEG");
  });

  it("ارسال پرونده بدون تصویر پرسنلی با پیام الزام متوقف می‌شود", async () => {
    const caseId = await draftCase();
    await addEvidenceDoc(caseId);
    const blocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(blocked)).toContain("تصویر پرسنلی");
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(app.status).toBe("draft");
  });

  it("با تصویر پرسنلی، گام آماده‌سازی و ارسال انجام می‌شود", async () => {
    const caseId = await draftCase();
    await addEvidenceDoc(caseId);
    const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photo.error).toBeUndefined();
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    const submitted = await redirectOf(() => submitCaseAction(form({ caseId })));
    expect(messageOf(submitted)).toContain("بررسی");
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(app.status).toBe("pending");
  });

  it("حذف تصویر پیوند را پاک می‌کند و ارسال دوباره متوقف می‌شود", async () => {
    const caseId = await draftCase();
    await addEvidenceDoc(caseId);
    const upload = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(upload.error).toBeUndefined();
    const url = await redirectOf(() => removePhotoAction(form({ caseId })));
    expect(messageOf(url)).toContain("حذف");
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.id, app.activistId));
    expect(person.photoDocumentId).toBeNull();
    const blocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(blocked)).toContain("تصویر پرسنلی");
  });
});
