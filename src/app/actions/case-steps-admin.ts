"use server";
// الحاقیهٔ ۲.۲۵.۰ — اکشن‌های سرور «مدیریت مراحل ثبت پرونده» (داشبورد /steps).
// همهٔ عملیات با گارد مجوز forms.manage، ممیزی کامل و حفظ داده‌های تاریخی:
// مراحل پایهٔ سامانه حذف/غیرفعال نمی‌شوند (ستون required)؛ حذف مرحلهٔ سفارشی
// تنها بدون هیچ پاسخ ثبت‌شده ممکن است؛ «بازبینی و ارسال» همیشه آخرین مرحله
// می‌ماند و ترتیب سایر مراحل با Drag & Drop آزاد است.
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { caseFieldOverrides, caseStepDefinitions, formAnswers, formDefinitions } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { field } from "@/lib/case-input";
import { faNumber } from "@/lib/format";
import { caseFieldCatalogFor, resolvedCaseField, type CaseFieldScope, type ResolvedCaseField } from "@/lib/case-field-catalog";
import { loadCaseFieldMeta } from "@/lib/case-field-meta";
import type { ActionState } from "@/lib/action-state";

const MANAGE_ERROR = "مجوز مدیریت مراحل ثبت پرونده را ندارید.";

async function manageGuard(): Promise<{ user: Awaited<ReturnType<typeof requireUser>> } | { error: string }> {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) return { error: MANAGE_ERROR };
  return { user };
}

export type ManagedCaseStep = {
  id: number; code: string; title: string; description: string | null;
  kind: "system" | "custom"; required: boolean; active: boolean; sortOrder: number;
  formStatus: "none" | "draft" | "published" | "disabled"; version: number; answersCount: number;
};

/** فهرست کامل مراحل (شامل غیرفعال‌ها) + وضعیت فرم سفارشی هر مرحله + شمارش پاسخ‌ها */
export async function listCaseStepsForAdmin() {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) return null;
  const rows = await db.select().from(caseStepDefinitions).orderBy(asc(caseStepDefinitions.sortOrder), asc(caseStepDefinitions.id));
  const defs = await db.select({ id: formDefinitions.id, entityId: formDefinitions.entityId, status: formDefinitions.status, version: formDefinitions.version, draftConfig: formDefinitions.draftConfig, publishedConfig: formDefinitions.publishedConfig })
    .from(formDefinitions).where(eq(formDefinitions.entityType, "case_step"));
  const usage = await db.select({ definitionId: formAnswers.definitionId, n: count() }).from(formAnswers).groupBy(formAnswers.definitionId);
  const usageMap = new Map(usage.map((row) => [row.definitionId, row.n]));
  const defMap = new Map(defs.map((row) => [row.entityId, row]));
  return { rows, defMap, usageMap };
}

/** افزودن مرحلهٔ سفارشی به انتهای زنجیره (پیش از «بازبینی و ارسال» در نمایش،
 *  ولی sort_order بزرگ‌تر از همه؛ مدیر بعداً با Drag & Drop جایش را تعیین می‌کند) */
export async function createCaseStepAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const title = field(data, "title", 120);
  const description = field(data, "description", 500);
  if (title.length < 2) return { error: "عنوان مرحله را کامل وارد کنید (حداقل ۲ نویسه)." };
  const code = "cs" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  try {
    // درج پیش از «بازبینی و ارسال» و شماره‌گذاری مجدد با فاصلهٔ ۱۰؛ ترتیب نسبی
    // فعلی حفظ می‌شود و هیچ‌گاه مرحلهٔ سفارشی پس از بازبینی نمی‌افتد.
    const created = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: caseStepDefinitions.id, code: caseStepDefinitions.code }).from(caseStepDefinitions).orderBy(asc(caseStepDefinitions.sortOrder), asc(caseStepDefinitions.id));
      const [inserted] = await tx.insert(caseStepDefinitions).values({ code, title, description: description || null, kind: "custom", required: false, active: true, sortOrder: 0, updatedBy: guard.user.id }).returning({ id: caseStepDefinitions.id });
      const tail = rows.filter((row) => row.code === "review");
      const head = rows.filter((row) => row.code !== "review");
      const sequence = [...head, { id: inserted.id, code }, ...tail];
      for (const [index, row] of sequence.entries()) {
        await tx.update(caseStepDefinitions).set({ sortOrder: (index + 1) * 10 }).where(eq(caseStepDefinitions.id, row.id));
      }
      return inserted;
    });
    await audit(guard.user.id, "add_case_step", "case_step", String(created.id), title);
    revalidatePath("/steps");
    return { success: `مرحلهٔ «${title}» افزوده شد؛ برای تعریف فیلدها، فرم‌ساز همان مرحله را باز کنید.` };
  } catch {
    return { error: "ثبت مرحله انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** ویرایش عنوان و توضیح هر مرحله — پایه یا سفارشی (عنوان در ویزارد همان‌جا نمایش داده می‌شود) */
export async function saveCaseStepMetaAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const id = Number(field(data, "caseStepId", 10));
  const title = field(data, "title", 120);
  const description = field(data, "description", 500);
  if (!id || title.length < 2) return { error: "عنوان مرحله را کامل وارد کنید." };
  const [existing] = await db.select({ id: caseStepDefinitions.id, title: caseStepDefinitions.title }).from(caseStepDefinitions).where(eq(caseStepDefinitions.id, id)).limit(1);
  if (!existing) return { error: "مرحله پیدا نشد؛ ممکن است پیش‌تر حذف شده باشد." };
  try {
    await db.update(caseStepDefinitions).set({ title, description: description || null, updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(caseStepDefinitions.id, id));
    await audit(guard.user.id, "edit_case_step", "case_step", String(id), `${existing.title} → ${title}`);
    revalidatePath("/steps");
    return { success: "عنوان و توضیح مرحله ذخیره شد." };
  } catch {
    return { error: "ذخیرهٔ تغییرات انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** فعال/غیرفعال‌سازی مرحلهٔ سفارشی؛ مراحل پایهٔ سامانه همیشه فعال می‌مانند */
export async function toggleCaseStepAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const id = Number(field(data, "caseStepId", 10));
  if (!id) return { error: "مرحله معتبر نیست." };
  const [existing] = await db.select().from(caseStepDefinitions).where(eq(caseStepDefinitions.id, id)).limit(1);
  if (!existing) return { error: "مرحله پیدا نشد؛ ممکن است پیش‌تر حذف شده باشد." };
  if (existing.required) return { error: `مرحلهٔ «${existing.title}» جزو مراحل پایهٔ سامانه است و غیرفعال‌کردن آن زنجیرهٔ ثبت را می‌شکند؛ فقط مراحل سفارشی قابل غیرفعال‌سازی هستند.` };
  try {
    await db.update(caseStepDefinitions).set({ active: !existing.active, updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(caseStepDefinitions.id, id));
    await audit(guard.user.id, existing.active ? "deactivate_case_step" : "activate_case_step", "case_step", String(id), existing.title);
    revalidatePath("/steps");
    return { success: existing.active ? `مرحلهٔ «${existing.title}» غیرفعال شد؛ پاسخ‌های ثبت‌شده دست‌نخورده می‌ماند.` : `مرحلهٔ «${existing.title}» فعال شد.` };
  } catch {
    return { error: "تغییر وضعیت مرحله انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** حذف مرحلهٔ سفارشی؛ مراحل پایهٔ سامانه حذف نمی‌شوند و مرحلهٔ دارای پاسخ ثبت‌شده
 *  با شمارش دقیق رد می‌شود تا هیچ سوابق تاریخی از دست نرود. بازگشت به /steps با
 *  پیام نتیجه (الگوی حذف تخصص‌های ۲.۲۴.۰) و ممیزی delete_case_step. */
export async function deleteCaseStepAction(data: FormData) {
  const fail = (message: string) => redirect("/steps?m=" + stashFlash(message));
  const guard = await manageGuard();
  if ("error" in guard) return fail(guard.error);
  const id = Number(field(data, "caseStepId", 10));
  if (!id) return fail("مرحله معتبر نیست.");
  const [existing] = await db.select().from(caseStepDefinitions).where(eq(caseStepDefinitions.id, id)).limit(1);
  if (!existing) return fail("مرحله پیدا نشد؛ ممکن است پیش‌تر حذف شده باشد.");
  if (existing.kind === "system") return fail(`مرحلهٔ «${existing.title}» جزو مراحل پایهٔ سامانه است و حذف آن ممکن نیست؛ این مراحل ستون دادهٔ پرونده‌ها را می‌سازند.`);
  const [def] = await db.select({ id: formDefinitions.id }).from(formDefinitions).where(and(eq(formDefinitions.entityType, "case_step"), eq(formDefinitions.entityId, id))).limit(1);
  let answers = 0;
  if (def) {
    const [row] = await db.select({ n: count() }).from(formAnswers).where(eq(formAnswers.definitionId, def.id));
    answers = Number(row?.n || 0);
  }
  if (answers > 0) return fail(`حذف مرحلهٔ «${existing.title}» ممکن نیست؛ این مرحله در ${faNumber(answers)} پاسخ ثبت‌شده استفاده شده است. می‌توانید آن را غیرفعال کنید تا فقط از پرونده‌های جدید حذف شود و سوابق دست‌نخورده بمانند.`);
  try {
    await db.transaction(async (tx) => {
      if (def) await tx.delete(formDefinitions).where(eq(formDefinitions.id, def.id));
      await tx.delete(caseStepDefinitions).where(eq(caseStepDefinitions.id, id));
    });
    await audit(guard.user.id, "delete_case_step", "case_step", String(id), existing.title);
    revalidatePath("/steps");
    return fail(`مرحلهٔ «${existing.title}» حذف شد.`);
  } catch {
    return fail("حذف مرحله انجام نشد؛ دوباره تلاش کنید.");
  }
}

/** ذخیرهٔ ترتیب مراحل؛ «بازبینی و ارسال» باید آخرین بماند (گارد سمت سرور) */
export async function reorderCaseStepsAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  let ids: number[];
  try {
    ids = JSON.parse(field(data, "order", 4000));
    if (!Array.isArray(ids) || !ids.length || ids.length > 60) throw new Error("bad");
    ids = ids.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0);
  } catch {
    return { error: "ترتیب ارسالی معتبر نیست." };
  }
  const all = await db.select({ id: caseStepDefinitions.id }).from(caseStepDefinitions).where(inArray(caseStepDefinitions.id, ids));
  if (all.length !== ids.length) return { error: "ترتیب ارسالی با فهرست مراحل هم‌خوان نیست." };
  const [review] = await db.select({ id: caseStepDefinitions.id }).from(caseStepDefinitions).where(eq(caseStepDefinitions.code, "review")).limit(1);
  if (review && ids[ids.length - 1] !== review.id) return { error: "مرحلهٔ «بازبینی و ارسال» باید همیشه آخرین مرحله بماند؛ ترتیب سایر مراحل آزاد است." };
  try {
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(caseStepDefinitions).set({ sortOrder: (index + 1) * 10, updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(caseStepDefinitions.id, id));
      }
    });
    await audit(guard.user.id, "reorder_case_steps", "case_step", ids.join(","));
    revalidatePath("/steps");
    return { success: "ترتیب مراحل ذخیره شد و در فرایند ثبت پرونده اعمال می‌شود." };
  } catch {
    return { error: "ذخیرهٔ ترتیب انجام نشد." };
  }
}

/* --------------- الحاقیهٔ ۲.۲۶.۰ — ویرایش فیلدهای ثابت مراحل --------------- */

/** نمای حل‌شدهٔ یک فیلد ثابت برای پنل مدیریت: پیش‌فرض کاتالوگ + override فعلی */
export type FixedFieldView = ResolvedCaseField & { scope: CaseFieldScope; role: "section" | "field" | "requirement"; canToggleRequired: boolean; canHide: boolean };

/** فهرست فیلدهای ثابت یک مرحلهٔ پایه با وضعیت حل‌شده (پیش‌فرض + override) */
export async function listFixedFieldsForStep(stepCode: string): Promise<FixedFieldView[] | null> {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) return null;
  const meta = await loadCaseFieldMeta();
  return caseFieldCatalogFor(stepCode as CaseFieldScope).map((entry) => ({
    ...resolvedCaseField(meta, entry.key),
    scope: entry.scope,
    role: entry.role,
    canToggleRequired: entry.canToggleRequired,
    canHide: entry.canHide,
  }));
}

/** ذخیرهٔ ویرایش یک فیلد ثابت (عنوان/راهنما/الزام/مخفی) — upsert روی کلید پایدار؛
 *  فیلد ناموجود در کاتالوگ و پرچم‌های غیرمجاز هر فیلد رد می‌شود و تغییر فقط
 *  لایهٔ نمایش/اعتبارسنجی ثبت‌های تازه را عوض می‌کند (دادهٔ تاریخی دست‌نخورده). */
export async function saveFieldOverrideAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const stepCode = field(data, "stepCode", 40);
  const fieldKey = field(data, "fieldKey", 100);
  const entry = caseFieldCatalogFor(stepCode as CaseFieldScope).find((item) => item.key === `${stepCode}.${fieldKey}`);
  if (!entry) return { error: "فیلد ثابت یافت نشد؛ فهرست را تازه‌سازی کنید." };
  const label = field(data, "label", 200);
  if (label.trim().length < 2) return { error: "عنوان فیلد را کامل وارد کنید (حداقل ۲ نویسه)." };
  const help = field(data, "help", 500);
  const requiredInput = field(data, "required", 6);
  const hiddenInput = field(data, "hidden", 6);
  const requiredOverride = entry.canToggleRequired ? requiredInput === "yes" : entry.required;
  const hidden = entry.canHide ? hiddenInput === "yes" : false;
  try {
    await db.insert(caseFieldOverrides).values({ stepCode, fieldKey, label: label.trim(), help: help.trim() || null, requiredOverride, hidden, updatedBy: guard.user.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [caseFieldOverrides.stepCode, caseFieldOverrides.fieldKey], set: { label: label.trim(), help: help.trim() || null, requiredOverride, hidden, updatedBy: guard.user.id, updatedAt: new Date() } });
    await audit(guard.user.id, "edit_case_field", "case_field", `${stepCode}.${fieldKey}`, `${entry.label} → ${label.trim()}${hidden ? " (مخفی)" : ""}${requiredOverride !== entry.required ? (requiredOverride ? " (الزامی شد)" : " (اختیاری شد)") : ""}`);
    revalidatePath("/steps");
    return { success: `فیلد «${label.trim()}» ذخیره شد و در فرم ثبت پرونده اعمال می‌شود.` };
  } catch {
    return { error: "ذخیرهٔ تغییرات فیلد انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** بازنشانی یک فیلد ثابت به پیش‌فرض کاتالوگ (حذف ردیف override) */
export async function resetFieldOverrideAction(data: FormData) {
  const fail = (message: string) => redirect("/steps?m=" + stashFlash(message));
  const guard = await manageGuard();
  if ("error" in guard) return fail(guard.error);
  const stepCode = field(data, "stepCode", 40);
  const fieldKey = field(data, "fieldKey", 100);
  const entry = caseFieldCatalogFor(stepCode as CaseFieldScope).find((item) => item.key === `${stepCode}.${fieldKey}`);
  if (!entry) return fail("فیلد ثابت یافت نشد؛ فهرست را تازه‌سازی کنید.");
  try {
    await db.delete(caseFieldOverrides).where(and(eq(caseFieldOverrides.stepCode, stepCode), eq(caseFieldOverrides.fieldKey, fieldKey)));
    await audit(guard.user.id, "reset_case_field", "case_field", `${stepCode}.${fieldKey}`, entry.label);
    revalidatePath("/steps");
    return fail(`فیلد «${entry.label}» به پیش‌فرض سامانه بازگشت.`);
  } catch {
    return fail("بازنشانی فیلد انجام نشد؛ دوباره تلاش کنید.");
  }
}
