// الحاقیهٔ ۲.۲۸.۰ — آزمون‌های مدیریت پویای فیلدهای جزئیات تخصص‌های قرآنی
// -----------------------------------------------------------
// گارد مجوز، ذخیره/بازنشانی تنظیم پویا، حفظ دادهٔ تاریخی (گزینهٔ مخفی و تغییر
// نوع فیلد)، اعتبارسنجی پویای پاسخ‌ها با کلیدهای پایدار، تعریف فیلد جزئیات برای
// تخصص افزودهٔ پنل و پاک‌سازی تنظیم هنگام حذف تخصص. همهٔ آزمون‌ها روی DB واقعی.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureSeed, loginAs, resetCaseData, redirectOf, closeDb, type Fixture } from "./helpers";
import { initialActionState } from "@/lib/action-state";
import { createSpecialtyAction, deleteSpecialtyAction, resetSpecialtyDetailAction, saveSpecialtyDetailAction } from "@/app/actions/forms";
import { loadSpecialtyDetailMeta } from "@/lib/specialty-detail-meta";
import { defaultSpecialtyDetailMeta, formatSpecialtyDetail, selectableSpecialtyOptions, specialtySelectLabels } from "@/lib/constants";
import { parseSpecialtyDetailsInput } from "@/lib/case-input";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(async () => {
  await resetCaseData();
  await db.delete(s.specialtyDetailOverrides);
});
afterAll(closeDb);

function detailForm(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("گارد مجوز و ذخیرهٔ تنظیم پویا", () => {
  it("کارشناس بررسی بدون forms.manage → خطای مجوز", async () => {
    await loginAs("rev");
    const result = await saveSpecialtyDetailAction(initialActionState, detailForm({ code: "commentator", kind: "checklist", options: "[]" }));
    expect(result.error).toContain("مجوز");
  });

  it("مدیر: تغییر برچسب گزینه و افزودن گزینهٔ تازه + ممیزی edit_specialty_detail", async () => {
    await loginAs("super");
    const result = await saveSpecialtyDetailAction(initialActionState, detailForm({
      code: "commentator", kind: "checklist", hint: "حوزه‌های تفسیری خود را برگزینید.",
      options: JSON.stringify([{ key: "tafsir", label: "تفسیر موضوعی" }, { key: "tadabbor", label: "تدبر در قرآن کریم" }, { key: "opt_newarea", label: "قرآن و سبک زندگی" }]),
    }));
    expect(result.success).toBeTruthy();
    const meta = await loadSpecialtyDetailMeta();
    expect(meta.commentator.overridden).toBe(true);
    expect(meta.commentator.hint).toBe("حوزه‌های تفسیری خود را برگزینید.");
    const labels = selectableSpecialtyOptions("commentator", meta.commentator);
    expect(labels.tafsir).toBe("تفسیر موضوعی"); // برچسب ویرایش‌شده
    expect(labels.opt_newarea).toBe("قرآن و سبک زندگی"); // گزینهٔ تازه با کلید پایدار
    // نمایش دادهٔ قدیمی با برچسب تازه
    expect(formatSpecialtyDetail("commentator", null, ["tafsir", "tadabbor"], null, meta.commentator)).toBe("تفسیر موضوعی، تدبر در قرآن کریم");
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "edit_specialty_detail"));
    expect(audit).toBeTruthy();
    expect(audit.targetId).toBe("commentator");
  });

  it("بازنشانی به پیش‌فرض کد + ممیزی reset_specialty_detail", async () => {
    await loginAs("super");
    await saveSpecialtyDetailAction(initialActionState, detailForm({ code: "commentator", kind: "checklist", options: JSON.stringify([{ key: "tafsir", label: "برچسب موقت" }]) }));
    const reset = await resetSpecialtyDetailAction(detailForm({ code: "commentator" }));
    expect(reset.success).toBeTruthy();
    const rows = await db.select().from(s.specialtyDetailOverrides).where(eq(s.specialtyDetailOverrides.code, "commentator"));
    expect(rows).toHaveLength(0);
    const meta = await loadSpecialtyDetailMeta();
    expect(meta.commentator.overridden).toBeUndefined();
    expect(selectableSpecialtyOptions("commentator", meta.commentator).tafsir).toBe("تفسیر"); // پیش‌فرض ثابت کد
    const [audit] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "reset_specialty_detail"));
    expect(audit).toBeTruthy();
  });
});

describe("حفظ سوابق تاریخی هنگام ویرایش فیلدها", () => {
  it("گزینهٔ مخفی‌شده از فرم حذف ولی برای دادهٔ قدیمی معتبر می‌ماند", async () => {
    await loginAs("super");
    await saveSpecialtyDetailAction(initialActionState, detailForm({
      code: "judge", kind: "checklist",
      options: JSON.stringify([{ key: "lahn", label: "صوت و لحن", hidden: true }, { key: "waqf", label: "وقف و ابتدا" }, { key: "tajvid", label: "تجوید" }, { key: "hifz", label: "حفظ" }]),
    }));
    const meta = await loadSpecialtyDetailMeta();
    expect(selectableSpecialtyOptions("judge", meta.judge).lahn).toBeUndefined(); // از فرم حذف شد
    // دادهٔ قدیمی با همان گزینه هنوز با برچسب فارسی نمایش داده می‌شود
    expect(formatSpecialtyDetail("judge", null, ["lahn", "tajvid"], null, meta.judge)).toBe("صوت و لحن، تجوید");
  });

  it("تغییر نوع فیلد: دادهٔ تک‌انتخابی قدیمی با fallback شکل داده کور نمی‌شود", async () => {
    await loginAs("super");
    // حافظ به چک‌لیست تبدیل می‌شود؛ دادهٔ قدیمی detailValue="15" + اجزا حفظ می‌شود
    await saveSpecialtyDetailAction(initialActionState, detailForm({ code: "memorizer", kind: "checklist", options: JSON.stringify([{ key: "opt_full", label: "حفظ کامل" }]) }));
    const meta = await loadSpecialtyDetailMeta();
    expect(meta.memorizer.kind).toBe("checklist");
    expect(formatSpecialtyDetail("memorizer", "15", null, "1,2,3", meta.memorizer)).toBe("حفظ ۱۵ جزء");
    expect(formatSpecialtyDetail("memorizer", "complete", null, null, meta.memorizer)).toBe("حفظ کل قرآن کریم");
    // و برعکس: چک‌لیست قدیمی هنگام تغییر به تک‌انتخابی
    await saveSpecialtyDetailAction(initialActionState, detailForm({ code: "memorizer", kind: "juz", options: "[]" }));
    const meta2 = await loadSpecialtyDetailMeta();
    expect(meta2.memorizer.kind).toBe("juz");
    expect(specialtySelectLabels(meta2.memorizer, "juz")["15"]).toBe("حفظ ۱۵ جزء"); // fallback به پیش‌فرض
  });
});

describe("اعتبارسنجی پویای پاسخ‌ها با کلیدهای پایدار", () => {
  it("پاسخ با گزینهٔ تازهٔ مدیریت‌شده می‌گذرد؛ بدون meta رد می‌شود", () => {
    const meta = {
      judge: {
        kind: "checklist" as const, label: null, hint: null, maxOptions: null,
        options: [{ key: "lahn", label: "صوت و لحن" }, { key: "opt_voice", label: "صداسیما" }],
      },
    };
    const data = new FormData();
    data.set("specialtyDetails", JSON.stringify([{ code: "judge", options: ["opt_voice"] }]));
    const parsed = parseSpecialtyDetailsInput(data, meta);
    expect(parsed).toEqual([{ code: "judge", value: null, options: ["opt_voice"], juz: null }]);
    expect(() => parseSpecialtyDetailsInput(data)).toThrow("invalid-specialty-details");
  });

  it("گزینهٔ مخفی‌شده برای بازذخیرهٔ دادهٔ قدیمی همچنان معتبر است", () => {
    const meta = {
      judge: {
        kind: "checklist" as const, label: null, hint: null, maxOptions: null,
        options: [{ key: "lahn", label: "صوت و لحن", hidden: true }, { key: "tajvid", label: "تجوید" }],
      },
    };
    const data = new FormData();
    data.set("specialtyDetails", JSON.stringify([{ code: "judge", options: ["lahn"] }]));
    expect(parseSpecialtyDetailsInput(data, meta)[0].options).toEqual(["lahn"]);
  });

  it("کد ناشناخته بدون meta و با meta رد می‌شود", () => {
    const data = new FormData();
    data.set("specialtyDetails", JSON.stringify([{ code: "sp_ghost", options: ["opt_x"] }]));
    expect(() => parseSpecialtyDetailsInput(data)).toThrow("invalid-specialty-details");
    expect(() => parseSpecialtyDetailsInput(data, { sp_ghost: { kind: "checklist", label: null, hint: null, maxOptions: null, options: [] } })).toThrow("invalid-specialty-details");
  });
});

describe("تخصص افزودهٔ پنل و حذف تخصص", () => {
  it("برای تخصص تازه می‌توان فیلد جزئیات تعریف کرد و با حذف تخصص پاک می‌شود", async () => {
    await loginAs("super");
    const created = await createSpecialtyAction(initialActionState, detailForm({ title: "خوشنویسی قرآنی", description: "تخصص آزمون ۲.۲۸" }));
    expect(created.success).toBeTruthy();
    const [createdRow] = await db.select().from(s.specialties).where(eq(s.specialties.title, "خوشنویسی قرآنی")).limit(1);
    expect(createdRow.code).toMatch(/^sp/);
    // بدون تنظیم: بدون فیلد جزئیات
    expect(defaultSpecialtyDetailMeta(createdRow.code)).toBeUndefined();
    const meta0 = await loadSpecialtyDetailMeta();
    expect(meta0[createdRow.code]).toBeUndefined();
    // تعریف فیلد جزئیات چک‌لیستی برای تخصص تازه
    const saved = await saveSpecialtyDetailAction(initialActionState, detailForm({
      code: createdRow.code, kind: "checklist", label: "سبک خوشنویسی", maxOptions: "3",
      options: JSON.stringify([{ key: "opt_nastaligh", label: "نستعلیق" }, { key: "opt_naskh", label: "نسخ" }]),
    }));
    expect(saved.success).toBeTruthy();
    const meta = await loadSpecialtyDetailMeta();
    expect(meta[createdRow.code].kind).toBe("checklist");
    expect(meta[createdRow.code].label).toBe("سبک خوشنویسی");
    expect(meta[createdRow.code].maxOptions).toBe(3);
    expect(selectableSpecialtyOptions(createdRow.code, meta[createdRow.code]).opt_nastaligh).toBe("نستعلیق");
    const data = new FormData();
    data.set("specialtyDetails", JSON.stringify([{ code: createdRow.code, options: ["opt_naskh"] }]));
    expect(parseSpecialtyDetailsInput(data, meta)[0].options).toEqual(["opt_naskh"]);
    // حذف تخصص → تنظیم فیلد جزئیات هم پاک می‌شود
    await redirectOf(() => deleteSpecialtyAction(detailForm({ specialtyId: String(createdRow.id) })));
    const rows = await db.select().from(s.specialtyDetailOverrides).where(eq(s.specialtyDetailOverrides.code, createdRow.code));
    expect(rows).toHaveLength(0);
    const metaAfter = await loadSpecialtyDetailMeta();
    expect(metaAfter[createdRow.code]).toBeUndefined();
  });
});
