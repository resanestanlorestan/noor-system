// Feature tests for the role/scope permission matrix: who may see a case,
// who may create one, who may act on it — through the real Server Actions.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  redirectOf, messageOf, caseIdOf, form, pdfFile, pngFile, completeProfile, nationalId,
  featureSeed, loginAs, logout, resetCaseData, closeDb,
  type Fixture,
} from "./helpers";
import { submitCaseAction, prepareCaseAction, decisionAction, assignExpertAction, uploadDocumentAction, uploadPhotoAction } from "@/app/actions/cases";
import { saveCaseCore } from "@/lib/case-save";
import { referSpecialistAction, specialistOpinionAction } from "@/app/actions/workflow";
import { getCaseForUser } from "@/lib/data";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(resetCaseData);
afterAll(closeDb);

/** Complete draft → evidence → ready → pending, created by the activist. */
async function pendingCase() {
  await loginAs("act");
  const url = await redirectOf(() => saveCaseCore(completeProfile(f)));
  const caseId = caseIdOf(url);
  await loginAs("act");
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
  expect(photo.error).toBeUndefined();
  await loginAs("act");
  await redirectOf(() => prepareCaseAction(form({ caseId })));
  await redirectOf(() => submitCaseAction(form({ caseId })));
  return caseId;
}

describe("ماتریس دسترسی نقش‌ها", () => {
  it("کارشناس تخصصی حق ثبت پرونده ندارد", async () => {
    await loginAs("spec");
    const state = await saveCaseCore(completeProfile(f));
    expect(state.error).toContain("دسترسی ثبت پرونده ندارید");
  });

  it("فعال با پرونده موجود نمی‌تواند پرونده دوم بسازد", async () => {
    await loginAs("act");
    await redirectOf(() => saveCaseCore(completeProfile(f)));
    const second = await saveCaseCore(completeProfile(f, { nationalId: "1234567890" }));
    // The own-case guard fires before validation, regardless of the id validity.
    expect(second.error).toContain("پرونده‌ای وجود دارد");
  });

  it("کارشناس بررسی تنها پرونده‌های خودش را می‌بیند؛ پس از تخصیص پرونده جدید دیده می‌شود", async () => {
    const caseId = await pendingCase();
    const rev = f.users.rev;

    // The reviewer neither created nor is assigned to this case yet.
    await loginAs("rev");
    expect(await getCaseForUser(f.users.rev, caseId)).toBeNull();

    await loginAs("prov");
    await redirectOf(() => assignExpertAction(form({ caseId, expertId: rev.id })));
    await loginAs("rev");
    expect((await getCaseForUser(f.users.rev, caseId))?.application.id).toBe(caseId);
  });

  it("کارشناس تخصصی تنها در بازه ارجاع بازِ خودش پرونده را می‌بیند", async () => {
    const caseId = await pendingCase();
    const spec = f.users.spec;

    await loginAs("prov");
    await redirectOf(() => referSpecialistAction(form({ caseId, specialistId: spec.id, specialtyId: String(f.specialtyId) })));

    await loginAs("spec");
    expect((await getCaseForUser(f.users.spec, caseId))?.application.id).toBe(caseId);

    const [referral] = await db.select().from(s.expertReferrals).where(eq(s.expertReferrals.applicationId, caseId));
    await redirectOf(() => specialistOpinionAction(form({ caseId, referralId: referral.id, outcome: "rejected", opinion: "تخصص ادعایی مستند نیست." })));
    expect(await getCaseForUser(f.users.spec, caseId)).toBeNull();
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("pending");
  });

  it("مدیر خارج از محدوده جغرافیایی نه پرونده را می‌بیند و نه تصمیمی می‌تواند بگیرد", async () => {
    const caseId = await pendingCase();
    await loginAs("provFars");
    expect(await getCaseForUser(f.users.provFars, caseId)).toBeNull();
    const denied = await redirectOf(() => decisionAction(form({ caseId, decision: "correction", note: "تلاش مدیر خارج از محدوده" })));
    expect(messageOf(denied)).toContain("مجاز نیست");
  });

  it("مدیر شهرستان تنها پرونده‌های شهرستان خود را می‌بیند", async () => {
    // A case inside the county of the county admin.
    await loginAs("prov");
    const inScope = caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f, { source: "manager" }))));
    // A case in a neighbouring county of the same province.
    const outScope = caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f, {
      source: "manager", countyId: String(f.islamshahrCountyId),
      firstName: "سعید", lastName: "نجفی", fatherName: "اکبر", birthDate: "1360/02/03",
      phone: "09121110005", nationalId: nationalId("412356789"),
    }))));
    await loginAs("county");
    expect((await getCaseForUser(f.users.county, inScope))?.application.id).toBe(inScope);
    expect(await getCaseForUser(f.users.county, outScope)).toBeNull();
  });

  it("تأیید پرونده توسط مدیر ثبت‌کننده ممنوع است", async () => {
    // The province manager creates the case, so deciding it independently is barred.
    await loginAs("prov");
    const caseId = caseIdOf(await redirectOf(() => saveCaseCore(completeProfile(f, { source: "manager" }))));
    await addEvidenceByProv(caseId);
    await redirectOf(() => prepareCaseAction(form({ caseId })));
    await redirectOf(() => submitCaseAction(form({ caseId })));
    const denied = await redirectOf(() => decisionAction(form({ caseId, decision: "approve" })));
    expect(messageOf(denied)).toContain("مستقل");
    // But the county manager of the same scope may approve it.
    await loginAs("county");
    await redirectOf(() => decisionAction(form({ caseId, decision: "approve" })));
    expect((await db.select().from(s.applications).where(eq(s.applications.id, caseId)))[0].status).toBe("approved");
  });

  it("کارشناس بررسی بدون تخصیص حق اعلام نقص ندارد", async () => {
    const caseId = await pendingCase();
    await loginAs("rev");
    // An unassigned reviewer cannot even see the case (scope) — either way the
    // correction request is refused.
    const denied = await redirectOf(() => decisionAction(form({ caseId, decision: "correction", note: "تلاش کارشناس بی‌تخصیص" })));
    expect(messageOf(denied)).toContain("مجاز نیست");
  });

  it("کاربر بدون نشست به صفحه ورود هدایت می‌شود", async () => {
    logout();
    expect(await redirectOf(() => saveCaseCore(completeProfile(f)))).toBe("/login");
  });

  it("مدیر شهرستان نمی‌تواند خارج از شهرستان خود پرونده ثبت کند", async () => {
    await loginAs("county");
    const outside = await saveCaseCore(completeProfile(f, { source: "manager", countyId: String(f.islamshahrCountyId) }));
    expect(outside.error).toContain("محدوده");
  });
});

/** Evidence upload by the province manager (creator of manager-sourced cases). */
async function addEvidenceByProv(caseId: string) {
  await loginAs("prov");
  const state = await uploadDocumentAction(caseId, {}, form({ title: "کارت ملی", docType: "national_card", file: pdfFile() }));
  expect(state.error).toBeUndefined();
  const photo = await uploadPhotoAction(caseId, {}, form({ file: pngFile() }));
  expect(photo.error).toBeUndefined();
}
