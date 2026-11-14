// Feature tests for مرحله ششم: polymorphic document links (ارتباط چندشکلی
// اسناد با موجودیت‌ها) — attach/detach actions, add-with-document flows for
// education/work-history/certificate records, scope validation, the audit
// trail and the reverse-link index (listDocumentLinks).
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, completeProfile, featureSeed, loginAs,
  resetCaseData, closeDb, pdfFile, pngFile, type Fixture,
} from "./helpers";
import { uploadDocumentAction, uploadPhotoAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { addCertificateAction, addEducationRecordAction, addWorkHistoryAction, attachRecordDocumentAction, detachRecordDocumentAction } from "@/app/actions/records";
import { listDocumentLinks } from "@/lib/entity-documents";
import { isUuid } from "@/lib/workflow-utils";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Creates a draft case for the activist and uploads the given document titles. */
async function createCaseWithDocs(docTitles: string[]) {
  const user = await loginAs("act");
  const url = await redirectOf(() => saveCaseCore(completeProfile(f)));
  const caseId = caseIdOf(url);
  for (const title of docTitles) {
    const state = await uploadDocumentAction(caseId, {}, form({ title, docType: "national_card", file: pdfFile() }));
    expect(state.error).toBeUndefined();
  }
  const docs = await db.select().from(s.documents).where(eq(s.documents.applicationId, caseId)).orderBy(s.documents.title);
  expect(docs).toHaveLength(docTitles.length);
  return { caseId, docs, user };
}

/** یک مدرک متعلق به پرونده‌ای دیگر (فعال و پروندهٔ مستقل) — خارج از محدوده همین پرونده. */
async function foreignDocument(uploadedBy: string) {
  const [activist] = await db.insert(s.activists).values({ firstName: "بیگانه", lastName: "پرونده دیگر" }).returning({ id: s.activists.id });
  const [application] = await db.insert(s.applications).values({ activistId: activist.id, source: "self", createdBy: uploadedBy }).returning({ id: s.applications.id });
  const [row] = await db.insert(s.documents).values({
    applicationId: application.id, storageKey: crypto.randomUUID(), originalName: "foreign.pdf",
    title: "مدرک پرونده دیگر", kind: "evidence", mimeType: "application/pdf", size: 2048, uploadedBy,
  }).returning({ id: s.documents.id });
  return row.id;
}

/** Seeds one education record, one work-history entry and one certificate. */
async function seedEntities(caseId: string) {
  await redirectOf(() => addEducationRecordAction(form({ caseId, type: "university", level: "کارشناسی", field: "علوم قرآنی", centerName: "دانشگاه تهران", certificate: "مدرک کارشناسی" })));
  await redirectOf(() => addWorkHistoryAction(form({ caseId, title: "دبیر آموزش و پرورش", employer: "آموزش و پرورش", position: "دبیر", startDate: "", endDate: "", description: "" })));
  await redirectOf(() => addCertificateAction(form({ caseId, title: "تقدیرنامه استانی", issuer: "سازمان تبلیغات", issuedDate: "" })));
  const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
  const [education] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.activistId, person.id));
  const [work] = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id));
  const [certificate] = await db.select().from(s.certificates).where(eq(s.certificates.activistId, person.id));
  return { person, education, work, certificate };
}

describe("اتصال و جداکردن مدرک به موجودیت‌ها", () => {
  it("یک مدرک به سابقه تحصیلی، سابقه شغلی و گواهینامه متصل می‌شود و در دفتر تغییرات ثبت می‌شود", async () => {
    const { caseId, docs } = await createCaseWithDocs(["کارت ملی"]);
    const { education, work, certificate } = await seedEntities(caseId);
    const docId = docs[0].id;

    const linkedEducation = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "education_record", recordId: education.id, documentId: docId })));
    expect(messageOf(linkedEducation)).toContain("متصل شد");
    const linkedWork = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "work_history", recordId: work.id, documentId: docId })));
    expect(messageOf(linkedWork)).toContain("متصل شد");
    const linkedCertificate = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "certificate", recordId: certificate.id, documentId: docId })));
    expect(messageOf(linkedCertificate)).toContain("متصل شد");

    const [educationRow] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.id, education.id));
    const [workRow] = await db.select().from(s.workHistory).where(eq(s.workHistory.id, work.id));
    const [certificateRow] = await db.select().from(s.certificates).where(eq(s.certificates.id, certificate.id));
    expect(educationRow.documentId).toBe(docId);
    expect(workRow.documentId).toBe(docId);
    expect(certificateRow.documentId).toBe(docId);

    const audits = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "link_document"));
    expect(audits).toHaveLength(3);
    expect(audits.every((row) => row.targetId === caseId)).toBe(true);
  });

  it("پیوند چندشکلی: همان مدرک هم‌زمان در نقشه پیوندهای معکوس به چند موجودیت اشاره می‌کند", async () => {
    const { caseId, docs } = await createCaseWithDocs(["گواهی دوره تجوید"]);
    const { person, education, certificate } = await seedEntities(caseId);
    const docId = docs[0].id;
    await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "education_record", recordId: education.id, documentId: docId })));
    await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "certificate", recordId: certificate.id, documentId: docId })));

    const index = await listDocumentLinks(person.id);
    const entries = index.get(docId);
    expect(entries).toHaveLength(2);
    expect(entries?.map((entry) => entry.target).sort()).toEqual(["certificate", "education_record"]);
    expect(entries?.find((entry) => entry.target === "education_record")?.title).toBe("کارشناسی");
    expect(entries?.find((entry) => entry.target === "certificate")?.title).toBe("تقدیرنامه استانی");
  });

  it("مدرک پرونده دیگر پذیرفته نمی‌شود و رکورد ناشناس خطا می‌دهد", async () => {
    const { caseId, docs, user } = await createCaseWithDocs(["کارت ملی"]);
    const { education } = await seedEntities(caseId);
    const foreignId = await foreignDocument(user.id);

    const foreign = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "education_record", recordId: education.id, documentId: foreignId })));
    expect(messageOf(foreign)).toContain("متعلق به این پرونده نیست");
    const [educationRow] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.id, education.id));
    expect(educationRow.documentId).toBeNull();

    const badTarget = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "activist", recordId: education.id, documentId: docs[0].id })));
    expect(messageOf(badTarget)).toContain("نوع موجودیت");

    const unknownRecord = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "education_record", recordId: isUuid(education.id) ? crypto.randomUUID() : education.id, documentId: docs[0].id })));
    expect(messageOf(unknownRecord)).toContain("پیدا نشد");
    expect(await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "link_document"))).toHaveLength(0);
  });

  it("جداکردن مدرک ستون document_id را خالی می‌کند ولی خود مدرک باقی می‌ماند", async () => {
    const { caseId, docs } = await createCaseWithDocs(["کارت ملی"]);
    const { work } = await seedEntities(caseId);
    await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "work_history", recordId: work.id, documentId: docs[0].id })));

    const detached = await redirectOf(() => detachRecordDocumentAction(form({ caseId, targetType: "work_history", recordId: work.id })));
    expect(messageOf(detached)).toContain("جدا شد");
    const [workRow] = await db.select().from(s.workHistory).where(eq(s.workHistory.id, work.id));
    expect(workRow.documentId).toBeNull();
    expect(await db.select().from(s.documents).where(eq(s.documents.id, docs[0].id))).toHaveLength(1);
    expect(await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "unlink_document"))).toHaveLength(1);
  });

  it("اتصال مدرک در وضعیت ارسال‌شده مجاز نیست", async () => {
    const { prepareCaseAction, submitCaseAction } = await import("@/app/actions/cases");
    const { caseId, docs } = await createCaseWithDocs(["کارت ملی"]);
    const { education } = await seedEntities(caseId);
    const photoState = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
    expect(photoState.error).toBeUndefined();
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    await redirectOf(() => submitCaseAction(form({ caseId, submit: "yes" })));

    const refused = await redirectOf(() => attachRecordDocumentAction(form({ caseId, targetType: "education_record", recordId: education.id, documentId: docs[0].id })));
    expect(messageOf(refused)).toContain("مجاز نیست");
    const [educationRow] = await db.select().from(s.educationRecords).where(eq(s.educationRecords.id, education.id));
    expect(educationRow.documentId).toBeNull();
  });
});

describe("ثبت موجودیت با مدرک از همان فرم افزودن", () => {
  it("سابقه تحصیلی و سابقه شغلی با documentId معتبر ذخیره می‌شوند", async () => {
    const { caseId, docs } = await createCaseWithDocs(["کارت ملی"]);
    await loginAs("act");

    await redirectOf(() => addEducationRecordAction(form({ caseId, type: "seminary", level: "سطح ۲", field: "", centerName: "حوزه علمیه تهران", certificate: "", documentId: docs[0].id })));
    await redirectOf(() => addWorkHistoryAction(form({ caseId, title: "کارشناس قرآنی", employer: "", position: "", startDate: "", endDate: "", description: "", documentId: docs[0].id })));

    const [person] = await db.select().from(s.activists).where(eq(s.activists.firstName, "زهرا"));
    const [education] = await db.select().from(s.educationRecords).where(and(eq(s.educationRecords.activistId, person.id), eq(s.educationRecords.type, "seminary")));
    const [work] = await db.select().from(s.workHistory).where(eq(s.workHistory.activistId, person.id));
    expect(education.documentId).toBe(docs[0].id);
    expect(work.documentId).toBe(docs[0].id);
  });

  it("مدرک خارج از پرونده در فرم افزودن پذیرفته نمی‌شود", async () => {
    const { caseId, user } = await createCaseWithDocs(["کارت ملی"]);
    await loginAs("act");
    const foreignId = await foreignDocument(user.id);

    const refused = await redirectOf(() => addEducationRecordAction(form({ caseId, type: "university", level: "کارشناسی", field: "", centerName: "", certificate: "", documentId: foreignId })));
    expect(messageOf(refused)).toContain("متعلق به این پرونده نیست");
    expect(await db.select().from(s.educationRecords)).toHaveLength(0);
  });
});
