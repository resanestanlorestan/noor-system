// Feature tests for the case workflow: draft → ready → pending →
// approve/correction/specialist → approved/rejected → appeal/revision.
// Every test drives the real Server Actions against the noor_feature DB.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, pdfFile, completeProfile, nationalId,
  featureSeed, loginAs, resetCaseData, closeDb,
  type Fixture, type UserKey,
} from "./helpers";
import {
  saveCaseAction, prepareCaseAction, submitCaseAction, returnToCompletingAction,
  decisionAction, assignExpertAction, uploadDocumentAction,
} from "@/app/actions/cases";
import {
  referSpecialistAction, specialistOpinionAction, respondCorrectionAction,
  explainDocumentRequestAction, requestRevisionAction, submitAppealAction,
  resolveAppealAction, restoreVersionAction,
} from "@/app/actions/workflow";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Creates a fully complete draft and returns the case id. */
async function createDraft(creator: UserKey, overrides: Record<string, string | string[]> = {}) {
  await loginAs(creator);
  const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, overrides)));
  return caseIdOf(url);
}

/** Uploads one evidence document (a minimal valid PDF) to the case. */
async function addEvidence(caseId: string, uploader: UserKey) {
  await loginAs(uploader);
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", docNumber: "12345", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  expect(state.success).toBeTruthy();
}

/** Draft + evidence + prepare + submit → a case in `pending`. */
async function pendingCase(creator: UserKey = "act") {
  const caseId = await createDraft(creator);
  await addEvidence(caseId, creator);
  await loginAs(creator);
  await redirectOf(() => prepareCaseAction(form({ caseId })));
  await redirectOf(() => submitCaseAction(form({ caseId })));
  return caseId;
}

describe("گردش کار پرونده — چرخه کامل", () => {
  it("از پیش‌نویس تا تأیید نهایی با کنترل کامل بودن", async () => {
    const activist = await loginAs("act");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f)));
    const caseId = caseIdOf(url);
    const [application] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(application.status).toBe("draft");
    expect(application.source).toBe("self");
    expect(application.createdBy).toBe(activist.id);

    // Saving the same draft again promotes draft → completing.
    await redirectOf(() => saveCaseAction({}, completeProfile(f, { caseId })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("completing");

    // Preparing without an evidence document is blocked by the completeness gate.
    const blocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(blocked)).toContain("مدرک");

    await addEvidence(caseId, "act");

    const ready = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(ready)).toContain("آماده ارسال");
    const submitted = await redirectOf(() => submitCaseAction(form({ caseId })));
    expect(messageOf(submitted)).toContain("بررسی");

    const [pendingRow] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(pendingRow.status).toBe("pending");
    expect(pendingRow.submittedAt).not.toBeNull();

    // An independent manager approves; the activist is notified.
    const prov = await loginAs("prov");
    await redirectOf(() => decisionAction(form({ caseId, decision: "approve" })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("approved");
    const history = await db.select().from(s.statusHistory).where(eq(s.statusHistory.applicationId, caseId));
    expect(history.find((row) => row.toStatus === "approved")?.actorId).toBe(prov.id);
    const notifications = await db.select().from(s.notifications).where(eq(s.notifications.userId, activist.id));
    expect(notifications.some((row) => row.title === "پرونده تأیید شد")).toBe(true);
  });

  it("اعلام نقص، پاسخ فعال، بارگذاری مدرک درخواستی و ارسال مجدد", async () => {
    const caseId = await pendingCase();

    await loginAs("prov");
    const correction = await redirectOf(() => decisionAction(form({
      caseId, decision: "correction", note: "شناسنامه و گواهی پایان دوره بارگذاری شود.",
      missingDocuments: "صفحه شناسنامه\nگواهی پایان دوره",
    })));
    expect(messageOf(correction)).toBeTruthy();
    const [request] = await db.select().from(s.correctionRequests).where(eq(s.correctionRequests.applicationId, caseId));
    expect(request.status).toBe("open");
    const docRequests = await db.select().from(s.documentRequests).where(eq(s.documentRequests.applicationId, caseId));
    expect(docRequests.map((row) => row.status)).toEqual(["open", "open"]);

    // The activist answers the correction request.
    await loginAs("act");
    await redirectOf(() => respondCorrectionAction(form({ caseId, requestId: request.id, response: "صفحه شناسنامه اسکن و پیوست شد." })));
    expect((await db.select().from(s.correctionRequests).where(eq(s.correctionRequests.id, request.id)))[0].status).toBe("responded");

    // Re-submission requires preparing again; the open document request blocks it.
    const stillBlocked = await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect(messageOf(stillBlocked)).toContain("مدارک درخواستی");

    // Uploading against the first open request fulfils it.
    const [firstRequest, secondRequest] = docRequests;
    const upload = await uploadDocumentAction(caseId, {}, form({ title: "صفحه شناسنامه", docType: "birth_certificate_page", documentRequestId: firstRequest.id, file: pdfFile("shenasname.pdf") }));
    expect(upload.error).toBeUndefined();
    expect((await db.select().from(s.documentRequests).where(eq(s.documentRequests.id, firstRequest.id)))[0].status).toBe("fulfilled");

    // The second request is handled with an explanation instead of a document.
    await redirectOf(() => explainDocumentRequestAction(form({ caseId, requestId: secondRequest.id, explanation: "این گواهی در دست صدور است." })));
    expect((await db.select().from(s.documentRequests).where(eq(s.documentRequests.id, secondRequest.id)))[0].status).toBe("explained");

    await redirectOf(() => prepareCaseAction(form({ caseId })));
    await redirectOf(() => submitCaseAction(form({ caseId })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("pending");
  });

  it("ارجاع تخصصی و ثبت نظر کارشناس، پرونده را به بررسی بازمی‌گرداند", async () => {
    const caseId = await pendingCase();

    // A reviewer who is neither manager nor assignee may not refer.
    await loginAs("rev");
    const denied = await redirectOf(() => referSpecialistAction(form({ caseId, specialistId: f.users.spec.id, specialtyId: String(f.specialtyId) })));
    expect(messageOf(denied)).toContain("مجاز نیست");

    // The province manager refers to the in-scope specialist with matching specialty.
    await loginAs("prov");
    await redirectOf(() => referSpecialistAction(form({ caseId, specialistId: f.users.spec.id, specialtyId: String(f.specialtyId), note: "بررسی تخصصی مفسر بودن" })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("specialist_review");
    const [referral] = await db.select().from(s.expertReferrals).where(eq(s.expertReferrals.applicationId, caseId));
    expect(referral.status).toBe("pending");

    // The assigned specialist records an approving opinion.
    await loginAs("spec");
    await redirectOf(() => specialistOpinionAction(form({ caseId, referralId: referral.id, outcome: "approved", opinion: "تخصص مفسر بودن محرز است." })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("pending");
    expect((await db.select().from(s.expertReferrals).where(eq(s.expertReferrals.id, referral.id)))[0].status).toBe("approved");
  });

  it("کارشناس مسئول پس از تخصیص می‌تواند ارجاع تخصصی ثبت کند", async () => {
    const caseId = await pendingCase();
    const rev = f.users.rev;

    await loginAs("prov");
    await redirectOf(() => assignExpertAction(form({ caseId, expertId: rev.id })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].assignedExpertId).toBe(rev.id);

    await loginAs("rev");
    await redirectOf(() => referSpecialistAction(form({ caseId, specialistId: f.users.spec.id, specialtyId: String(f.specialtyId) })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("specialist_review");
  });

  it("رد پرونده، اعتراض و نتیجه‌گیری مستقل آن", async () => {
    const caseId = await pendingCase();

    // Province manager rejects; the activist appeals.
    await loginAs("prov");
    await redirectOf(() => decisionAction(form({ caseId, decision: "reject", note: "مستندات تخصص کافی نیست." })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("rejected");

    await loginAs("act");
    await redirectOf(() => submitAppealAction(form({ caseId, reason: "مستندات تکمیلی ارسال شده و درخواست بازنگری دارم." })));
    const [firstAppeal] = await db.select().from(s.appeals).where(eq(s.appeals.applicationId, caseId));
    expect(firstAppeal.status).toBe("open");
    // Assignment prefers the independent county manager of the case scope.
    expect(firstAppeal.assignedTo).toBe(f.users.county.id);

    // The rejection actor is not allowed to resolve the appeal.
    await loginAs("prov");
    const notAssignee = await redirectOf(() => resolveAppealAction(form({ caseId, appealId: firstAppeal.id, outcome: "upheld", resolution: "تلاش غیرمستقل برای مهر نهایی" })));
    expect(messageOf(notAssignee)).toContain("مستقل");

    // The assigned county manager accepts the appeal → the case returns to review.
    await loginAs("county");
    await redirectOf(() => resolveAppealAction(form({ caseId, appealId: firstAppeal.id, outcome: "reconsider", resolution: "با مستندات جدید، بررسی مجدد لازم است." })));
    expect((await db.select().from(s.appeals).where(eq(s.appeals.id, firstAppeal.id)))[0].status).toBe("resolved");
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("pending");

    // A second rejection (now by the county manager) gets a second appeal,
    // which must be assigned away from the rejection actor.
    await loginAs("county");
    await redirectOf(() => decisionAction(form({ caseId, decision: "reject", note: "پس از بررسی مجدد، مستندات همچنان کافی نیست." })));
    await loginAs("act");
    await redirectOf(() => submitAppealAction(form({ caseId, reason: "درخواست رسیدگی مجدد با مستندات تازه." })));
    const [secondAppeal] = await db.select().from(s.appeals).where(and(eq(s.appeals.applicationId, caseId), eq(s.appeals.status, "open")));
    expect(secondAppeal.assignedTo).toBe(f.users.prov.id);

    // The new rejection actor (county) cannot resolve it either; the province manager can.
    await loginAs("county");
    const stillDenied = await redirectOf(() => resolveAppealAction(form({ caseId, appealId: secondAppeal.id, outcome: "upheld", resolution: "تلاش غیرمستقل دوم" })));
    expect(messageOf(stillDenied)).toContain("مستقل");

    await loginAs("prov");
    await redirectOf(() => resolveAppealAction(form({ caseId, appealId: secondAppeal.id, outcome: "upheld", resolution: "مستندات کافی برای تأیید تخصص نیست." })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("rejected");
  });

  it("بازنگری تأییدشده با حفظ نسخه و بازگردانی اطلاعات", async () => {
    const caseId = await createDraft("act");
    await addEvidence(caseId, "act");
    await loginAs("act");
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    await redirectOf(() => submitCaseAction(form({ caseId })));
    await loginAs("prov");
    await redirectOf(() => decisionAction(form({ caseId, decision: "approve" })));

    // Manager requests a revision; the approved profile is snapshotted as v1.
    await redirectOf(() => requestRevisionAction(form({ caseId, reason: "نشانی محل فعالیت نیازمند اصلاح است." })));
    const [reopened] = await db.select().from(s.applications).where(eq(s.applications.id, caseId));
    expect(reopened.status).toBe("needs_correction");
    const versions = await db.select().from(s.applicationVersions).where(eq(s.applicationVersions.applicationId, caseId));
    expect(versions).toHaveLength(1);

    // The activist changes the profile in the reopened case.
    await loginAs("act");
    await redirectOf(() => saveCaseAction({}, completeProfile(f, { caseId, lastName: "احمدی" })));

    // Restoring v1 brings the original profile back and stores an automatic backup.
    // (v1 = revision snapshot, v2 = the activist's edit snapshot, v3 = auto backup.)
    await loginAs("prov");
    await redirectOf(() => restoreVersionAction(form({ caseId, versionId: versions[0].id })));
    const [person] = await db.select().from(s.activists).where(eq(s.activists.id, reopened.activistId));
    expect(person.lastName).toBe("موسوی");
    const afterRestore = await db.select().from(s.applicationVersions).where(eq(s.applicationVersions.applicationId, caseId));
    expect(afterRestore).toHaveLength(3);
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("needs_correction");
  });

  it("هشدار چندمعیاره تکراری بودن پیش از ذخیره", async () => {
    // First save with a manager as creator.
    await loginAs("prov");
    const url = await redirectOf(() => saveCaseAction({}, completeProfile(f, { source: "manager" })));
    const caseId = caseIdOf(url);

    // Same national id, no acknowledgement → warning with the matching reason.
    await loginAs("county");
    const warning = await saveCaseAction({}, completeProfile(f, { source: "manager" }));
    expect(warning.warning).toBe(true);
    expect(warning.duplicates?.[0]?.reason).toContain("کد ملی");
    expect(warning.duplicates?.[0]?.caseId).toBe(caseId);

    // A different national id but the same mobile number → phone-based warning.
    const phoneWarning = await saveCaseAction({}, completeProfile(f, { source: "manager", nationalId: nationalId("213456789") }));
    expect(phoneWarning.warning).toBe(true);
    expect(phoneWarning.duplicates?.[0]?.reason).toContain("شماره همراه");

    // A person matching on no criterion at all saves without any warning.
    const clean = await redirectOf(() => saveCaseAction({}, completeProfile(f, {
      source: "manager", firstName: "مریم", lastName: "کریمی", fatherName: "رضا",
      birthDate: "1368/05/12", nationalId: nationalId("213456789"), phone: "09121110002",
    })));
    expect(caseIdOf(clean)).not.toBe(caseId);

    // Re-submitting the very first national id with acknowledgement now collides
    // with the unique hash constraint and yields a hard error pointing at the case.
    const hardError = await saveCaseAction({}, completeProfile(f, { source: "manager", dupAck: "yes" }));
    expect(hardError.error).toContain("قبلاً ثبت شده");
    expect(hardError.existingCaseId).toBe(caseId);
  });

  it("قواعد گذار وضعیت‌ها سخت‌گیرانه اعمال می‌شود", async () => {
    const caseId = await createDraft("act");
    await addEvidence(caseId, "act");

    // Submitting straight from draft is not allowed.
    const early = await redirectOf(() => submitCaseAction(form({ caseId })));
    expect(messageOf(early)).toContain("مجاز نیست");

    await loginAs("act");
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("ready");

    // Back to completing from ready.
    await loginAs("prov");
    await redirectOf(() => returnToCompletingAction(form({ caseId })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("completing");

    // Deciding on a non-pending case is refused.
    const refused = await redirectOf(() => decisionAction(form({ caseId, decision: "approve" })));
    expect(messageOf(refused)).toContain("مجاز نیست");
  });

  it("اعتبارسنجی داده‌های هویتی و تماس در ذخیره", async () => {
    await loginAs("act");
    const badNationalId = await saveCaseAction({}, completeProfile(f, { nationalId: "1234567890" }));
    expect(badNationalId.error).toContain("کد ملی");
    const badPhone = await saveCaseAction({}, completeProfile(f, { phone: "0912345" }));
    expect(badPhone.error).toContain("شماره همراه");
    const badBirth = await saveCaseAction({}, completeProfile(f, { birthDate: "1375/13/40" }));
    expect(badBirth.error).toContain("تاریخ تولد");
    const badPostal = await saveCaseAction({}, completeProfile(f, { postalCode: "12345" }));
    expect(badPostal.error).toContain("کد پستی");

    // A valid postal code and a fresh identity save without warnings.
    await loginAs("prov");
    const okUrl = await redirectOf(() => saveCaseAction({}, completeProfile(f, { source: "manager", postalCode: "1134567891", nationalId: nationalId("312456789"), phone: "09121110003" })));
    expect(okUrl).toMatch(/^\/cases\//);
  });
});

describe("صحت مولد کد ملی آزمون", () => {
  it("شناسه‌های تولیدی الگوریتم کنترل را پاس می‌کنند", () => {
    for (const base of ["123456789", "213456789", "312456789", "412356789"]) {
      const id = nationalId(base);
      expect(id).toMatch(/^\d{10}$/);
      expect(id).not.toMatch(/^(\d)\1{9}$/);
    }
  });
});
