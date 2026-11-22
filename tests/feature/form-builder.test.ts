// آزمون‌های الحاقیهٔ ۲.۲۳.۰ — فرم‌ساز پویا و مدیریت تخصص‌های قرآنی روی دیتابیس
// واقعی noor_feature: گارد مجوز، ساختار فرم و شرط‌گذاری، انتشار نسخه‌بندی‌شده،
// اعتبارسنجی شرطی پاسخ‌ها در مرحلهٔ ۳ ویزارد، فایل صوتی فیلد پویا، حفظ پاسخ‌های
// تاریخی هنگام انتشار نسخهٔ جدید، غیرفعال‌سازی تخصص و گارد حذف فرم با پاسخ.
// ساختار اجرا: یک پروندهٔ «act» زنجیره‌ای برای چرخهٔ پاسخ‌ها (هر فعال فقط یک
// پروندهٔ فعال دارد) و یک پروندهٔ «county» برای سناریوی تخصص غیرفعال.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./env";
import { closeDb, featureSeed, form, loginAs, nationalId, redirectOf, resetCaseData, completeProfile, type Fixture } from "./helpers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { initialActionState } from "@/lib/action-state";
import {
  createSpecialtyAction, saveSpecialtyMetaAction, toggleSpecialtyAction, reorderSpecialtiesAction,
  saveFormDraftAction, publishFormAction, setFormDisabledAction, deleteFormAction,
} from "@/app/actions/forms";
import { saveIdentityStepAction, saveLocationStepAction, saveSpecialtiesStepAction } from "@/app/actions/case-steps";
import { uploadFormFileAction } from "@/app/actions/cases";

let f: Fixture;
beforeAll(async () => { await resetCaseData(); f = await featureSeed(); }, 30_000);
afterAll(async () => { await closeDb(); });

const MP3_BYTES = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(256, 1)]);
const mp3File = () => new File([MP3_BYTES], "sample.mp3", { type: "audio/mpeg" });
const CHANGE_REASON = "ثبت و اصلاح پروندهٔ آزمونی الحاقیهٔ ۲.۲۳.۰";

let specialtyId = 0;
let actCaseId = "";
let caseSeq = 0;
const OPT = { tahqiq: "opt_tahqiq1", tartil: "opt_tartil1", taqlidi: "opt_taqlidi1" };
const FLD = { recite: "fld_recite1", qari: "fld_qari0001", audio: "fld_audio001" };

/** ساخت تخصص + فرم «قرائت» با دو فیلد شرطی وابسته به گزینهٔ «تقلیدی» */
async function seedForm() {
  const added = await createSpecialtyAction(initialActionState, form({ title: "قرائت قرآن آزمون", description: "تخصص آزمونی فرم‌ساز" }));
  expect(added.success).toBeDefined();
  const [row] = await db.select({ id: s.specialties.id }).from(s.specialties).where(eq(s.specialties.title, "قرائت قرآن آزمون"));
  specialtyId = row.id;
  const draft = {
    fields: [
      { key: FLD.recite, type: "checkbox", label: "نوع قرائت", required: false, options: [
        { key: OPT.tahqiq, label: "قرائت تحقیق" }, { key: OPT.tartil, label: "قرائت ترتیل" }, { key: OPT.taqlidi, label: "قرائت تقلیدی", help: "پیروی از قاری مشخص" },
      ] },
      { key: FLD.qari, type: "text", label: "نام قاری موردنظر", required: true, showIf: { fieldKey: FLD.recite, optionKeys: [OPT.taqlidi] } },
      { key: FLD.audio, type: "file", label: "نمونهٔ صوتی", required: false, showIf: { fieldKey: FLD.recite, optionKeys: [OPT.taqlidi] }, file: { accept: "audio", maxSizeMb: 5 } },
    ],
  };
  const saved = await saveFormDraftAction(initialActionState, form({ entityType: "specialty", entityId: String(specialtyId), config: JSON.stringify(draft) }));
  expect(saved.success).toBeDefined();
  const published = await publishFormAction(initialActionState, form({ entityType: "specialty", entityId: String(specialtyId) }));
  expect(published.success).toContain("نسخهٔ ۱");
  const [def] = await db.select().from(s.formDefinitions).where(and(eq(s.formDefinitions.entityType, "specialty"), eq(s.formDefinitions.entityId, specialtyId)));
  expect(def.status).toBe("published");
  expect(def.version).toBe(1);
}

/** پروندهٔ تازه برای یک کاربر فیکسچر؛ برای کاربران سازمانی دلیل اصلاح الزامی است.
 *  هر فعال فقط یک پروندهٔ فعال می‌تواند داشته باشد؛ بنابراین پروندهٔ act یک‌بار
 *  ساخته می‌شود و آزمون‌های پاسخ‌دهی به‌ترتیب روی همان چرخه می‌زنند. */
async function freshCase(userKey: "act" | "prov" = "act") {
  await loginAs(userKey);
  const seq = ++caseSeq;
  const org = userKey !== "act";
  const identity = completeProfile(f, {
    nationalId: nationalId(`3${String(10000000 + ((Date.now() + seq * 977) % 89000000)).slice(0, 8)}`),
    lastName: `موسوی‌آزمون ${seq}`,
    phone: `0912345${String(1000 + seq).slice(-4)}`,
    alternatePhone: `0935445${String(1000 + seq).slice(-4)}`,
    ...(org ? { changeReason: CHANGE_REASON, dupAck: "yes" } : {}),
  });
  const idc = await saveIdentityStepAction({}, identity).catch((error: unknown) => ({ okRedirect: String(error) }));
  if (!("okRedirect" in idc)) throw new Error(`identity failed: ${idc.error ?? JSON.stringify(idc)}`);
  const caseId = String(idc.okRedirect).replace("Error: NEXT_REDIRECT: ", "").split("/")[2];
  expect(caseId).toMatch(/^[\w-]+$/);
  const loc = await saveLocationStepAction({}, form({
    caseId, provinceId: String(f.tehranProvinceId), countyId: String(f.tehranCountyId), city: "تهران", address: "تهران، خیابان آزمون",
    ...(org ? { changeReason: CHANGE_REASON } : {}),
  })).catch((error: unknown) => ({ okRedirect: String(error) }));
  if (!("okRedirect" in loc)) throw new Error(`location failed: ${loc.error ?? JSON.stringify(loc)}`);
  return caseId;
}

describe("الحاقیهٔ ۲.۲۳.۰ — فرم‌ساز پویا و مدیریت تخصص‌ها", () => {
  it("مدیریت تخصص و فرم بدون مجوز forms.manage رد می‌شود", async () => {
    await loginAs("act");
    const denied = await createSpecialtyAction(initialActionState, form({ title: "تخصص بی‌مجوز" }));
    expect(denied.error).toContain("مجوز مدیریت تخصص‌ها و فرم‌ساز");
    const deniedDraft = await saveFormDraftAction(initialActionState, form({ entityType: "specialty", entityId: "1", config: JSON.stringify({ fields: [] }) }));
    expect(deniedDraft.error).toContain("مجوز مدیریت تخصص‌ها و فرم‌ساز");
  });

  it("ایجاد تخصص، ذخیرهٔ پیش‌نویس با شرط معتبر و انتشار نسخهٔ ۱؛ شرط به فیلد بی‌گزینه رد می‌شود", async () => {
    await loginAs("super");
    const bad = await saveFormDraftAction(initialActionState, form({ entityType: "specialty", entityId: "1", config: JSON.stringify({ fields: [
      { key: "fld_aaa111", type: "text", label: "متن ساده", required: false },
      { key: "fld_bbb222", type: "text", label: "وابستهٔ نامعتبر", required: false, showIf: { fieldKey: "fld_aaa111", optionKeys: ["opt_xxx111"] } },
    ] }) }));
    expect(bad.error).toContain("شرط نمایش");
    await seedForm();
  });

  it("پاسخ بدون انتخاب گزینهٔ شرطی: فیلد شرطی الزامی درخواست نمی‌شود و ذخیرهٔ مرحله ۳ موفق است", async () => {
    actCaseId = await freshCase();
    const url = await redirectOf(() => saveSpecialtiesStepAction({}, form({ caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]" })));
    expect(url).toBe(`/cases/${actCaseId}/steps/4`);
    const [answer] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    expect(answer).toBeUndefined();
  });

  it("انتخاب گزینهٔ شرطی بدون پاسخ فیلد اجباری، ذخیرهٔ مرحله ۳ را رد می‌کند", async () => {
    await loginAs("act");
    const state = await saveSpecialtiesStepAction({}, form({
      caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]",
      [`dyn__${specialtyId}__${FLD.recite}`]: OPT.taqlidi,
    }));
    expect(state.error, JSON.stringify(state)).toContain("نام قاری موردنظر");
  });

  it("فایل صوتی فیلد پویا با کنترل نوع واقعی بارگذاری و پاسخ کامل با نسخهٔ ۱ ذخیره می‌شود", async () => {
    await loginAs("act");
    const upload = await uploadFormFileAction(actCaseId, {}, form({ specialtyId: String(specialtyId), fieldKey: FLD.audio, file: mp3File() }));
    expect(upload.success, `upload error: ${upload.error}`).toBeDefined();
    const documentId = upload.data?.documentId;
    expect(documentId).toBeDefined();
    const url = await redirectOf(() => saveSpecialtiesStepAction({}, form({
      caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]",
      [`dyn__${specialtyId}__${FLD.recite}`]: OPT.taqlidi,
      [`dyn__${specialtyId}__${FLD.qari}`]: "استاد آزمون",
      [`dynfile__${specialtyId}__${FLD.audio}`]: String(documentId),
    })));
    expect(url).toBe(`/cases/${actCaseId}/steps/4`);
    const [answer] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    expect(answer.version).toBe(1);
    const payload = answer.answers as Record<string, unknown>;
    expect(payload[FLD.qari]).toBe("استاد آزمون");
    expect(payload[FLD.audio]).toBe(documentId);
    expect(Array.isArray(payload[FLD.recite]) ? (payload[FLD.recite] as string[])[0] : payload[FLD.recite]).toBe(OPT.taqlidi);
    const [doc] = await db.select({ id: s.documents.id, docType: s.documents.docType }).from(s.documents).where(eq(s.documents.id, documentId!));
    expect(doc.docType).toBe("form_answer");
    // پاسخ با مدرک بیگانه رد می‌شود
    const rejected = await saveSpecialtiesStepAction({}, form({
      caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]",
      [`dyn__${specialtyId}__${FLD.recite}`]: OPT.taqlidi,
      [`dyn__${specialtyId}__${FLD.qari}`]: "استاد آزمون",
      [`dynfile__${specialtyId}__${FLD.audio}`]: "00000000-0000-4000-8000-000000000000",
    }));
    expect(rejected.error).toContain("متعلق به این پرونده");
  });

  it("انتشار نسخهٔ ۲ پاسخ تاریخی را وابسته به نسخهٔ ۱ نگه می‌دارد و پاسخ تازه با نسخهٔ ۲ ثبت می‌شود", async () => {
    await loginAs("super");
    const extended = { fields: [
      { key: FLD.recite, type: "checkbox", label: "نوع قرائت", required: false, options: [
        { key: OPT.tahqiq, label: "قرائت تحقیق" }, { key: OPT.tartil, label: "قرائت ترتیل" }, { key: OPT.taqlidi, label: "قرائت تقلیدی" },
      ] },
      { key: FLD.qari, type: "text", label: "نام قاری موردنظر", required: true, showIf: { fieldKey: FLD.recite, optionKeys: [OPT.taqlidi] } },
      { key: FLD.audio, type: "file", label: "نمونهٔ صوتی", required: false, showIf: { fieldKey: FLD.recite, optionKeys: [OPT.taqlidi] }, file: { accept: "audio", maxSizeMb: 5 } },
      { key: "fld_add0001", type: "textarea", label: "توضیح تکمیلی", required: false },
    ] };
    await saveFormDraftAction(initialActionState, form({ entityType: "specialty", entityId: String(specialtyId), config: JSON.stringify(extended) }));
    const republished = await publishFormAction(initialActionState, form({ entityType: "specialty", entityId: String(specialtyId) }));
    expect(republished.success).toContain("نسخهٔ ۲");
    const [before] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    expect(before.version).toBe(1);
    const versions = await db.select().from(s.formDefinitionVersions).where(eq(s.formDefinitionVersions.definitionId, before.definitionId)).orderBy(asc(s.formDefinitionVersions.version));
    expect(versions).toHaveLength(2);
    // ذخیرهٔ دوبارهٔ همان پرونده با نسخهٔ ۲؛ پاسخ به‌روز می‌شود و فیلد تازه پذیرفته می‌شود
    await loginAs("act");
    await redirectOf(() => saveSpecialtiesStepAction({}, form({
      caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]",
      [`dyn__${specialtyId}__${FLD.recite}`]: [OPT.tahqiq, OPT.tartil],
      [`dyn__${specialtyId}__fld_add0001`]: "پاسخ با نسخهٔ دوم",
    })));
    const [after] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    expect(after.version).toBe(2);
    expect((after.answers as Record<string, unknown>)[FLD.qari]).toBeUndefined();
    expect((after.answers as Record<string, unknown>)["fld_add0001"]).toBe("پاسخ با نسخهٔ دوم");
  });

  it("غیرفعال‌سازی تخصص برای انتخاب جدید بسته است؛ فرم غیرفعال پاسخ نمی‌گیرد و حذف فرم با پاسخ ممنوع است", async () => {
    await loginAs("super");
    const toggled = await toggleSpecialtyAction(form({ specialtyId: String(specialtyId), active: "0" }));
    expect(toggled.success).toBeDefined();
    // پیوند تخصص پروندهٔ act پاک می‌شود تا تخصص غیرفعال «انتخاب جدید» به‌شمار آید
    const [actApp] = await db.select({ activistId: s.applications.activistId }).from(s.applications).where(eq(s.applications.id, actCaseId));
    await db.delete(s.activistSpecialties).where(eq(s.activistSpecialties.activistId, actApp.activistId));
    await loginAs("act");
    const blocked = await saveSpecialtiesStepAction({}, form({ caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]" }));
    expect(blocked.error).toContain("غیرفعال شده‌اند");
    await loginAs("super");
    await toggleSpecialtyAction(form({ specialtyId: String(specialtyId), active: "1" }));
    const disabled = await setFormDisabledAction(form({ entityType: "specialty", entityId: String(specialtyId), disabled: "1" }));
    expect(disabled.success, `disable error: ${disabled.error}`).toBeDefined();
    // ذخیرهٔ عادی با فرم غیرفعال: خطا ندارد و پاسخ‌های تاریخی دست‌نخورده می‌مانند
    await loginAs("act");
    const [beforeDisable] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    const silentUrl = await redirectOf(() => saveSpecialtiesStepAction({}, form({ caseId: actCaseId, specialties: [String(specialtyId)], specialtyDetails: "[]" })));
    expect(silentUrl).toBe(`/cases/${actCaseId}/steps/4`);
    const [afterDisable] = await db.select().from(s.formAnswers).where(eq(s.formAnswers.applicationId, actCaseId));
    expect(afterDisable.id).toBe(beforeDisable.id);
    expect(afterDisable.version).toBe(beforeDisable.version);
    await loginAs("super");
    const delRefused = await deleteFormAction(form({ entityType: "specialty", entityId: String(specialtyId) }));
    expect(delRefused.error).toContain("حذف فرم ممکن نیست");
  });

  it("ویرایش نام و توضیح تخصص و تغییر ترتیب پایدار ذخیره می‌شود", async () => {
    await loginAs("super");
    const meta = await saveSpecialtyMetaAction(initialActionState, form({ specialtyId: String(specialtyId), title: "قرائت قرآن آزمون — ویراسته", description: "توضیح تازه" }));
    expect(meta.success).toBeDefined();
    const rows = await db.select({ id: s.specialties.id }).from(s.specialties).orderBy(asc(s.specialties.sortOrder));
    const order = rows.map((row) => row.id).reverse();
    const reordered = await reorderSpecialtiesAction(form({ order: JSON.stringify(order) }));
    expect(reordered.success).toBeDefined();
    const after = await db.select({ id: s.specialties.id, sortOrder: s.specialties.sortOrder }).from(s.specialties).orderBy(asc(s.specialties.sortOrder));
    expect(after.map((row) => row.id)).toEqual(order);
  });
});
