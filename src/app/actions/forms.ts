"use server";
// الحاقیهٔ ۲.۲۳.۰ — اکشن‌های سرور فرم‌ساز پویا و مدیریت تخصص‌های قرآنی.
// همهٔ عملیات با گارد مجوز forms.manage سمت سرور، ممیزی کامل و حفظ داده‌های
// تاریخی: انتشار نسخهٔ تازه هرگز پاسخ‌های قبلی را تغییر نمی‌دهد و حذف فرم
// تنها وقتی ممکن است که هیچ پاسخی ذخیره نشده باشد.
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { formAnswers, formDefinitions, formDefinitionVersions, specialties, specialtyDetailOverrides } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { field } from "@/lib/case-input";
import { faNumber } from "@/lib/format";
import { stashFlash } from "@/lib/flash";
import { specialtyUsageParts } from "@/lib/specialty-usage";
import { defaultSpecialtyDetailMeta, loadSpecialtyDetailMeta } from "@/lib/specialty-detail-meta";
import { specialtyDetailKindLabels, type SpecialtyDetailMeta } from "@/lib/constants";
import type { ActionState } from "@/lib/action-state";
import { newFieldKey, newOptionKey, validateFormConfig, type FormConfig } from "@/lib/form-config";

const MANAGE_ERROR = "مجوز مدیریت تخصص‌ها و فرم‌ساز را ندارید.";

async function manageGuard(): Promise<{ user: Awaited<ReturnType<typeof requireUser>> } | { error: string }> {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) return { error: MANAGE_ERROR };
  return { user };
}

export type SpecialtyRow = typeof specialties.$inferSelect;

/** فهرست تخصص‌ها با ترتیب تعریف‌شده + وضعیت فرم پویای هر یک + متای پویای
 *  فیلد جزئیات هر تخصص (الحاقیهٔ ۲.۲۸.۰) برای ویرایشگر پنل */
export async function listSpecialtiesForForms() {
  const user = await requireUser();
  if (!(await can(user, "forms.manage"))) return null;
  const rows = await db.select().from(specialties).orderBy(asc(specialties.sortOrder), asc(specialties.id));
  const defs = await db.select({
    id: formDefinitions.id, entityId: formDefinitions.entityId, status: formDefinitions.status,
    version: formDefinitions.version, draftConfig: formDefinitions.draftConfig, publishedConfig: formDefinitions.publishedConfig,
  }).from(formDefinitions).where(eq(formDefinitions.entityType, "specialty"));
  const usage = await db.select({ specialtyId: formAnswers.specialtyId, n: count() }).from(formAnswers).groupBy(formAnswers.specialtyId);
  const usageMap = new Map(usage.filter((row) => row.specialtyId !== null).map((row) => [row.specialtyId as number, row.n]));
  const defMap = new Map(defs.map((row) => [row.entityId, row]));
  // الحاقیهٔ ۲.۲۸.۰ — متای مؤثر فیلد جزئیات + زمان آخرین ذخیرهٔ هر override
  const detailMeta = await loadSpecialtyDetailMeta();
  const overrideRows = await db.select({ code: specialtyDetailOverrides.code, updatedAt: specialtyDetailOverrides.updatedAt }).from(specialtyDetailOverrides);
  const detailSavedAt = Object.fromEntries(overrideRows.map((row) => [row.code, row.updatedAt.toISOString()]));
  return { rows, defMap, usageMap, detailMeta, detailSavedAt };
}

/** افزودن تخصص از داشبورد (نام + توضیح) با کد یکتا */
export async function createSpecialtyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const title = field(data, "title", 100);
  const description = field(data, "description", 500);
  if (title.length < 2) return { error: "نام تخصص را کامل وارد کنید (حداقل ۲ نویسه)." };
  const code = "sp" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const [last] = await db.select({ max: sql<number>`coalesce(max(${specialties.sortOrder}), 0)` }).from(specialties);
  try {
    const [created] = await db.insert(specialties).values({ code, title, description: description || null, sortOrder: (last?.max || 0) + 1 }).returning({ id: specialties.id });
    await audit(guard.user.id, "add_specialty", "specialty", String(created.id), title);
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings");
    return { success: `تخصص «${title}» افزوده شد.` };
  } catch {
    return { error: "ثبت تخصص انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** ویرایش نام و توضیح تخصص */
export async function saveSpecialtyMetaAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const id = Number(field(data, "specialtyId", 10));
  const title = field(data, "title", 100);
  const description = field(data, "description", 500);
  if (!id || title.length < 2) return { error: "شناسه یا نام تخصص معتبر نیست." };
  try {
    await db.update(specialties).set({ title, description: description || null }).where(eq(specialties.id, id));
    await audit(guard.user.id, "specialty_meta_edit", "specialty", String(id), title);
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings"); revalidatePath("/cases");
    return { success: "تخصص به‌روزرسانی شد." };
  } catch {
    return { error: "به‌روزرسانی تخصص انجام نشد." };
  }
}

/** فعال/غیرفعال‌سازی تخصص؛ غیرفعال یعنی «انتخاب جدید» بسته است، داده‌های تاریخی دست‌نخورده می‌مانند */
export async function toggleSpecialtyAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const id = Number(field(data, "specialtyId", 10));
  const active = field(data, "active", 10) === "1";
  if (!id) return { error: "شناسهٔ تخصص معتبر نیست." };
  try {
    await db.update(specialties).set({ active }).where(eq(specialties.id, id));
    await audit(guard.user.id, "specialty_toggle", "specialty", String(id), active ? "فعال" : "غیرفعال");
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings");
    return { success: active ? "تخصص فعال شد." : "تخصص غیرفعال شد؛ پرونده‌های پیشین دست‌نخورده‌اند." };
  } catch {
    return { error: "تغییر وضعیت تخصص انجام نشد." };
  }
}

/** تغییر ترتیب نمایش تخصص‌ها با دریافت آرایهٔ شناسه‌ها به ترتیب تازه */
export async function reorderSpecialtiesAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  let ids: number[];
  try {
    ids = JSON.parse(field(data, "order", 4000));
    if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new Error("bad");
    ids = ids.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value));
  } catch {
    return { error: "ترتیب ارسالی معتبر نیست." };
  }
  try {
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(specialties).set({ sortOrder: index + 1 }).where(eq(specialties.id, id));
      }
    });
    await audit(guard.user.id, "specialty_reorder", "specialty", ids.join(","));
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings");
    return { success: "ترتیب تخصص‌ها ذخیره شد." };
  } catch {
    return { error: "ذخیرهٔ ترتیب انجام نشد." };
  }
}

/** الحاقیهٔ ۲.۲۴.۰ — حذف کامل تخصص از فرم‌ساز؛ همهٔ تخصص‌های موجود (قدیمی و
 * جدید) مشمول همین حذف‌اند. گارد ارجاع سراسری: حذف تنها وقتی انجام می‌شود که
 * تخصص در هیچ پروندهٔ فعالان، حساب کارشناسی، ارجاع، دورهٔ آموزشی، فرم پویا یا
 * پاسخ ثبت‌شده‌ای استفاده نشده باشد؛ در غیر این صورت رد و شمارش وابستگی‌ها
 * اعلام می‌شود تا سوابق تاریخی دست‌نخورده بمانند (جایگزین امن: غیرفعال‌سازی). */
export async function deleteSpecialtyAction(data: FormData) {
  const fail = (message: string) => redirect("/forms?m=" + stashFlash(message));
  const guard = await manageGuard();
  if ("error" in guard) return fail(guard.error);
  const id = Number(field(data, "specialtyId", 10));
  if (!id) return fail("تخصص معتبر نیست.");
  const [specialty] = await db.select({ id: specialties.id, title: specialties.title, code: specialties.code }).from(specialties).where(eq(specialties.id, id)).limit(1);
  if (!specialty) return fail("تخصص پیدا نشد؛ ممکن است پیش‌تر حذف شده باشد.");
  const parts = await specialtyUsageParts(id);
  if (parts) return fail(`حذف تخصص «${specialty.title}» ممکن نیست؛ این تخصص در ${parts} استفاده شده است. می‌توانید از دکمهٔ «غیرفعال» استفاده کنید تا فقط انتخاب جدید بسته شود و سوابق دست‌نخورده بمانند.`);
  try { await db.delete(specialties).where(eq(specialties.id, id)); }
  catch { return fail("حذف تخصص انجام نشد؛ دوباره تلاش کنید."); }
  // الحاقیهٔ ۲.۲۸.۰ — تنظیم پویای فیلد جزئیاتِ تخصص حذف‌شده هم پاک می‌شود
  await db.delete(specialtyDetailOverrides).where(eq(specialtyDetailOverrides.code, specialty.code));
  await audit(guard.user.id, "delete_specialty", "specialty", String(id), specialty.title);
  revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings"); revalidatePath("/cases"); revalidatePath("/register");
  return redirect("/forms?m=" + stashFlash(`تخصص «${specialty.title}» از فهرست حذف شد.`));
}

/** ذخیرهٔ پیش‌نویس ساختار فرم (اعتبارسنجی کامل ساختار سمت سرور) */
export async function saveFormDraftAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const entityType = field(data, "entityType", 30) || "specialty";
  const entityId = Number(field(data, "entityId", 10));
  if (!entityId) return { error: "موجودیت هدف فرم معتبر نیست." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(field(data, "config", 200000));
  } catch {
    return { error: "ساختار ارسالی فرم معتبر نیست." };
  }
  const result = validateFormConfig(parsed);
  if (!result.ok) return { error: result.error };
  // کلیدهای گمشده (فیلد تازه بدون کلید) اینجا تولید و تزریق می‌شوند تا پایدار بمانند
  const config: FormConfig = { fields: result.config.fields.map((f) => ({ ...f, key: f.key || newFieldKey(), options: f.options?.map((o) => ({ ...o, key: o.key || newOptionKey() })) })) };
  const [existing] = await db.select().from(formDefinitions).where(and(eq(formDefinitions.entityType, entityType), eq(formDefinitions.entityId, entityId))).limit(1);
  if (!existing) {
    await db.insert(formDefinitions).values({ entityType, entityId, status: "draft", version: 0, draftConfig: config, updatedBy: guard.user.id });
    await audit(guard.user.id, "form_draft_save", "form_definition", `${entityType}:${entityId}`);
    revalidatePath("/forms"); revalidatePath("/steps");
    return { success: "پیش‌نویس فرم ذخیره شد." };
  }
  await db.update(formDefinitions).set({ draftConfig: config, updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(formDefinitions.id, existing.id));
  await audit(guard.user.id, "form_draft_save", "form_definition", `${entityType}:${entityId}`);
  revalidatePath("/forms"); revalidatePath("/steps");
  return { success: "پیش‌نویس فرم ذخیره شد." };
}

/** انتشار نسخهٔ تازه: نسخهٔ قبلی منتشرشده در جدول تاریخچه می‌ماند و پاسخ‌های قدیمی به همان نسخه ارجاع دارند */
export async function publishFormAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const entityType = field(data, "entityType", 30) || "specialty";
  const entityId = Number(field(data, "entityId", 10));
  if (!entityId) return { error: "موجودیت هدف فرم معتبر نیست." };
  const [existing] = await db.select().from(formDefinitions).where(and(eq(formDefinitions.entityType, entityType), eq(formDefinitions.entityId, entityId))).limit(1);
  if (!existing) return { error: "ابتدا پیش‌نویس فرم را ذخیره کنید." };
  const result = validateFormConfig(existing.draftConfig);
  if (!result.ok) return { error: "پیش‌نویس فعلی معتبر نیست: " + result.error };
  if (!result.config.fields.length) return { error: "فرم خالی قابل انتشار نیست؛ حداقل یک فیلد تعریف کنید." };
  const nextVersion = existing.version + 1;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(formDefinitionVersions).values({ definitionId: existing.id, version: nextVersion, config: result.config, publishedBy: guard.user.id });
      await tx.update(formDefinitions).set({ status: "published", version: nextVersion, publishedConfig: result.config, draftConfig: result.config, updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(formDefinitions.id, existing.id));
    });
    await audit(guard.user.id, "form_publish", "form_definition", `${entityType}:${entityId}`, `نسخهٔ ${nextVersion} با ${result.config.fields.length} فیلد`);
    revalidatePath("/forms"); revalidatePath("/steps");
    return { success: `نسخهٔ ${faNumber(nextVersion)} فرم منتشر شد و برای پرونده‌ها فعال است.` };
  } catch {
    return { error: "انتشار فرم انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** غیرفعال/فعال‌سازی فرم منتشرشده (بدون دست‌زدن به پاسخ‌های ذخیره‌شده) */
export async function setFormDisabledAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const entityType = field(data, "entityType", 30) || "specialty";
  const entityId = Number(field(data, "entityId", 10));
  const disabled = field(data, "disabled", 10) === "1";
  if (!entityId) return { error: "موجودیت هدف فرم معتبر نیست." };
  const [existing] = await db.select().from(formDefinitions).where(and(eq(formDefinitions.entityType, entityType), eq(formDefinitions.entityId, entityId))).limit(1);
  if (!existing || (existing.status !== "published" && existing.status !== "disabled")) return { error: "فقط فرم منتشرشده قابل فعال/غیرفعال‌سازی است." };
  try {
    await db.update(formDefinitions).set({ status: disabled ? "disabled" : "published", updatedBy: guard.user.id, updatedAt: new Date() }).where(eq(formDefinitions.id, existing.id));
    await audit(guard.user.id, disabled ? "form_disable" : "form_enable", "form_definition", `${entityType}:${entityId}`);
    revalidatePath("/forms"); revalidatePath("/steps");
    return { success: disabled ? "فرم غیرفعال شد؛ پاسخ‌های قبلی محفوظ می‌مانند." : "فرم دوباره فعال شد." };
  } catch {
    return { error: "تغییر وضعیت فرم انجام نشد." };
  }
}

/** حذف فرم فقط تا پیش از ثبت نخستین پاسخ؛ پس از آن ساختار برای حفظ تاریخچه می‌ماند */
export async function deleteFormAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const entityType = field(data, "entityType", 30) || "specialty";
  const entityId = Number(field(data, "entityId", 10));
  if (!entityId) return { error: "موجودیت هدف فرم معتبر نیست." };
  const [existing] = await db.select({ id: formDefinitions.id }).from(formDefinitions).where(and(eq(formDefinitions.entityType, entityType), eq(formDefinitions.entityId, entityId))).limit(1);
  if (!existing) return { error: "فرمی برای حذف یافت نشد." };
  const [used] = await db.select({ n: count() }).from(formAnswers).where(eq(formAnswers.definitionId, existing.id));
  if (used.n > 0) return { error: `حذف فرم ممکن نیست؛ ${used.n} پاسخ ذخیره‌شده به این فرم وابسته است. می‌توانید آن را غیرفعال کنید.` };
  try {
    await db.delete(formDefinitions).where(eq(formDefinitions.id, existing.id));
    await audit(guard.user.id, "form_delete", "form_definition", `${entityType}:${entityId}`);
    revalidatePath("/forms"); revalidatePath("/steps");
    return { success: "فرم حذف شد." };
  } catch {
    return { error: "حذف فرم انجام نشد." };
  }
}

/** نسخه‌های منتشرشدهٔ یک فرم برای نمایش تاریخچه در داشبورد */
export async function listFormVersions(entityId: number) {
  const [def] = await db.select({ id: formDefinitions.id }).from(formDefinitions).where(and(eq(formDefinitions.entityType, "specialty"), eq(formDefinitions.entityId, entityId))).limit(1);
  if (!def) return [];
  return db.select({ version: formDefinitionVersions.version, publishedAt: formDefinitionVersions.publishedAt, config: formDefinitionVersions.config }).from(formDefinitionVersions).where(eq(formDefinitionVersions.definitionId, def.id)).orderBy(formDefinitionVersions.version);
}

/** بارگذاری پاسخ‌های ذخیره‌شدهٔ یک پرونده برای فرم‌های مشخص */
export async function loadAnswersForCase(applicationId: string, definitionIds: number[]) {
  if (!definitionIds.length) return new Map<number, { version: number; answers: Record<string, unknown> }>();
  const rows = await db.select({ definitionId: formAnswers.definitionId, version: formAnswers.version, answers: formAnswers.answers }).from(formAnswers).where(and(eq(formAnswers.applicationId, applicationId), inArray(formAnswers.definitionId, definitionIds)));
  return new Map(rows.map((row) => [row.definitionId, { version: row.version, answers: (row.answers || {}) as Record<string, unknown> }]));
}

/* ---------------- الحاقیهٔ ۲.۲۸.۰ — مدیریت پویای فیلد جزئیات تخصص ----------------
 * همهٔ فیلدهای «ثابت» فهرست تخصص‌ها — نوع فیلد، عنوان، راهنما، سقف انتخاب و
 * تک‌تک گزینه‌ها — از همین اکشن‌ها بدون هیچ تغییر کدی مدیریت می‌شوند. کلیدهای
 * گزینه پایدار می‌مانند (الگوی ۲.۱۲.۰): ویرایش فقط برچسب/نوع/ترتیب را عوض
 * می‌کند و پاسخ‌های تاریخی پرونده‌ها بدون مهاجرت خوانده می‌شوند. گزینهٔ
 * مخفی‌شده از فرم تازه حذف می‌شود ولی برای نمایش دادهٔ قدیمی معتبر می‌ماند. */

const DETAIL_OPTION_KEY_RE = /^[a-z0-9_]{1,40}$/;
const DETAIL_KINDS = Object.keys(specialtyDetailKindLabels) as Array<keyof typeof specialtyDetailKindLabels>;

export type SpecialtyDetailEditorState = { kind: SpecialtyDetailMeta["kind"]; label: string; hint: string; maxOptions: string; options: Array<{ key: string; label: string; hidden?: boolean }> };

/** ذخیرهٔ تنظیم پویای فیلد جزئیات یک تخصص (کد تخصص = کلید پایدار). */
export async function saveSpecialtyDetailAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const code = field(data, "code", 40);
  const kind = field(data, "kind", 20);
  const label = field(data, "label", 200);
  const hint = field(data, "hint", 500);
  const maxOptionsRaw = field(data, "maxOptions", 10);
  if (!code || !(DETAIL_KINDS as string[]).includes(kind)) return { error: "کد تخصص یا نوع فیلد معتبر نیست." };
  const kindValue = kind as SpecialtyDetailMeta["kind"];
  let maxOptions: number | null = null;
  if (maxOptionsRaw) {
    if (!/^\d{1,2}$/.test(maxOptionsRaw) || Number(maxOptionsRaw) < 1 || Number(maxOptionsRaw) > 60) return { error: "سقف انتخاب‌ها باید عددی میان ۱ تا ۶۰ باشد." };
    maxOptions = Number(maxOptionsRaw);
  }
  if (kindValue !== "checklist") maxOptions = null; // سقف فقط برای چک‌لیست معنا دارد
  let options: Array<{ key: string; label: string; hidden?: boolean }> = [];
  try {
    const parsed: unknown = JSON.parse(field(data, "options", 20000));
    if (!Array.isArray(parsed) || parsed.length > 80) throw new Error("bad");
    options = parsed.map((item) => {
      if (typeof item !== "object" || item === null) throw new Error("bad");
      const record = item as Record<string, unknown>;
      const key = String(record.key || "");
      const optionLabel = String(record.label || "").trim();
      if (!DETAIL_OPTION_KEY_RE.test(key) || optionLabel.length < 1 || optionLabel.length > 100) throw new Error("bad");
      return record.hidden ? { key, label: optionLabel, hidden: true } : { key, label: optionLabel };
    });
    if (new Set(options.map((option) => option.key)).size !== options.length) throw new Error("bad");
  } catch {
    return { error: "فهرست گزینه‌های ارسالی معتبر نیست؛ برچسب‌ها و کلیدها را بررسی کنید." };
  }
  try {
    await db.insert(specialtyDetailOverrides).values({ code, kind: kindValue, label: label || null, hint: hint || null, maxOptions, options, updatedBy: guard.user.id })
      .onConflictDoUpdate({ target: specialtyDetailOverrides.code, set: { kind: kindValue, label: label || null, hint: hint || null, maxOptions, options, updatedBy: guard.user.id, updatedAt: new Date() } });
    await audit(guard.user.id, "edit_specialty_detail", "specialty", code, `${kindValue} — ${options.length} گزینه`);
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings"); revalidatePath("/cases"); revalidatePath("/register");
    return { success: "تنظیمات فیلد جزئیات ذخیره شد و در همهٔ بخش‌های سامانه اعمال گردید." };
  } catch {
    return { error: "ذخیرهٔ تنظیمات فیلد جزئیات انجام نشد؛ دوباره تلاش کنید." };
  }
}

/** بازنشانی فیلد جزئیات تخصص به پیش‌فرض ثابت کد (حذف ردیف override). */
export async function resetSpecialtyDetailAction(data: FormData): Promise<ActionState> {
  const guard = await manageGuard();
  if ("error" in guard) return { error: guard.error };
  const code = field(data, "code", 40);
  if (!code) return { error: "کد تخصص معتبر نیست." };
  const resolved = defaultSpecialtyDetailMeta(code);
  try {
    await db.delete(specialtyDetailOverrides).where(eq(specialtyDetailOverrides.code, code));
    await audit(guard.user.id, "reset_specialty_detail", "specialty", code, resolved ? "بازنشانی به پیش‌فرض کد" : "حذف تنظیم تخصص بدون پیش‌فرض");
    revalidatePath("/forms"); revalidatePath("/steps"); revalidatePath("/settings"); revalidatePath("/cases"); revalidatePath("/register");
    return { success: resolved ? "فیلد جزئیات به پیش‌فرض سامانه بازگشت." : "تنظیم فیلد جزئیات حذف شد (این تخصص فیلد جزئیات ندارد)." };
  } catch {
    return { error: "بازنشانی انجام نشد؛ دوباره تلاش کنید." };
  }
}
