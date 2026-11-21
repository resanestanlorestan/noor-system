"use server";

// الحاقیهٔ ۲.۱۸.۴ — کنش‌های مدیریتی بخش «مدیریت محتوای سایت» داشبورد:
// ذخیرهٔ گروهی متن‌ها (با ثبت نسخهٔ پیشین در تاریخچه)، بازگردانی نسخهٔ قبلی،
// بازنشانی به متن پیش‌فرض برنامه — همه فقط با مجوز cms.manage و با ثبت ممیزی.
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { siteContent, siteContentRevisions } from "@/db/schema";
import { requireUser, audit } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CONTENT_MAX_LENGTH, contentItemOf, isContentKey, siteContentGroups } from "@/lib/site-content";
import { MAX_LOGO_BYTES, sniffLogoImage } from "@/lib/site-settings";
import { siteSettings } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";

const CMS_PAGE = "/cms";

async function requireCmsEditor() {
  const user = await requireUser();
  if (!(await can(user, "cms.manage"))) throw new Error("Forbidden");
  return user;
}

const cleanValue = (raw: FormDataEntryValue | null) => String(raw ?? "").replace(/\r\n/g, "\n").slice(0, CONTENT_MAX_LENGTH);

/** ذخیرهٔ گروهی: هر کلیدِ تغییرکرده، مقدار قبلی‌اش را به‌عنوان نسخه ثبت می‌کند. */
export async function saveContentGroupAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireCmsEditor();
    const page = String(data.get("page") || "");
    const group = siteContentGroups.find((entry) => entry.page === page);
    if (!group) return { error: "گروه محتوا شناسایی نشد." };
    const changed: string[] = [];
    for (const item of group.items) {
      if (!data.has(`v:${item.key}`)) continue;
      const value = cleanValue(data.get(`v:${item.key}`));
      const meta = contentItemOf(item.key);
      if (!meta || meta.group.page !== page) return { error: "کلید نامعتبر است." };
      const [existing] = await db.select().from(siteContent).where(eq(siteContent.key, item.key)).limit(1);
      if (existing && existing.value === value) continue;
      if (existing) {
        await db.insert(siteContentRevisions).values({ key: item.key, value: existing.value, changedBy: user.id });
      }
      await db.insert(siteContent).values({
        key: item.key, page: meta.group.page, section: `${meta.group.pageLabel} — ${meta.item.label}`,
        label: meta.item.label, value, updatedBy: user.id, updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: siteContent.key,
        set: { value, updatedBy: user.id, updatedAt: new Date(), page: meta.group.page, section: `${meta.group.pageLabel} — ${meta.item.label}`, label: meta.item.label },
      });
      // سقف نگهداری نسخه‌ها: ۱۵ نسخهٔ آخر هر کلید
      const keep = await db.select({ id: siteContentRevisions.id }).from(siteContentRevisions)
        .where(eq(siteContentRevisions.key, item.key)).orderBy(desc(siteContentRevisions.changedAt), desc(siteContentRevisions.id)).limit(15);
      if (keep.length === 15) {
        await db.delete(siteContentRevisions).where(and(
          eq(siteContentRevisions.key, item.key),
          notInArray(siteContentRevisions.id, keep.map((row) => row.id)),
        ));
      }
      await audit(user.id, "cms_content_update", "site_content", item.key, value === "" ? "(خالی)" : `${value.length} نویسه`);
      changed.push(item.label);
    }
    if (!changed.length) return { warning: true, success: "تغییری برای ذخیره نبود؛ همهٔ فیلدهای این گروه مثل قبل است." };
    revalidatePath("/", "layout");
    return { success: `${changed.length} متن ذخیره شد: ${changed.slice(0, 4).join("، ")}${changed.length > 4 ? " و …" : ""}`, savedPage: page };
  } catch {
    return { error: "ذخیرهٔ محتوا ممکن نشد؛ دسترسی یا داده را بررسی کنید." };
  }
}

/** بازگردانی یک نسخهٔ پیشین: مقدار جاری قبل از بازگردانی، خودش نسخهٔ جدید می‌شود. */
export async function revertContentAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireCmsEditor();
    const key = String(data.get("key") || "");
    const revisionId = Number(data.get("revisionId") || 0);
    if (!isContentKey(key) || !Number.isInteger(revisionId) || revisionId <= 0) return { error: "درخواست بازگردانی نامعتبر است." };
    const [revision] = await db.select().from(siteContentRevisions).where(eq(siteContentRevisions.id, revisionId)).limit(1);
    if (!revision || revision.key !== key) return { error: "نسخهٔ موردنظر پیدا نشد." };
    const [existing] = await db.select().from(siteContent).where(eq(siteContent.key, key)).limit(1);
    if (existing && existing.value === revision.value) return { warning: true, success: "این نسخه همان مقدار جاری است." };
    if (existing) {
      await db.insert(siteContentRevisions).values({ key, value: existing.value, changedBy: user.id });
    }
    const meta = contentItemOf(key)!;
    await db.insert(siteContent).values({
      key, page: meta.group.page, section: `${meta.group.pageLabel} — ${meta.item.label}`,
      label: meta.item.label, value: revision.value, updatedBy: user.id, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: siteContent.key,
      set: { value: revision.value, updatedBy: user.id, updatedAt: new Date() },
    });
    await audit(user.id, "cms_content_revert", "site_content", key, `revision=${revisionId}`);
    revalidatePath("/", "layout");
    return { success: "نسخهٔ پیشین بازگردانی شد.", savedKey: key };
  } catch {
    return { error: "بازگردانی نسخه ممکن نشد." };
  }
}

/** حذف دست‌کاری: مقدار به متن پیش‌فرضِ برنامه برمی‌گردد و تاریخچه پاک می‌شود. */
export async function resetContentKeyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireCmsEditor();
    const key = String(data.get("key") || "");
    if (!isContentKey(key)) return { error: "کلید نامعتبر است." };
    const [existing] = await db.select().from(siteContent).where(eq(siteContent.key, key)).limit(1);
    if (!existing) return { warning: true, success: "این متن از قبل پیش‌فرض برنامه است." };
    await db.delete(siteContent).where(eq(siteContent.key, key));
    await audit(user.id, "cms_content_reset", "site_content", key);
    revalidatePath("/", "layout");
    return { success: "متن به پیش‌فرض برنامه بازگشت.", savedKey: key };
  } catch {
    return { error: "بازنشانی متن ممکن نشد." };
  }
}

/** الحاقیهٔ ۲.۱۸.۵ — آپلود لوگوی جدید: اعتبارسنجی سمت سرور (حجم، فرمت واقعی از
 * روی امضای بایت، ابعاد معقول) و ذخیرهٔ بایت‌ها در site_settings؛ URL سرو از
 * روی updatedAt ساخته می‌شود و کش همه‌جا باطل می‌شود. */
export async function uploadLogoAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireCmsEditor();
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "فایلی انتخاب نشده است؛ یک تصویر لوگو انتخاب کنید." };
    if (file.size > MAX_LOGO_BYTES) return { error: "حجم فایل بیش از سقف مجاز است؛ حداکثر ۱ مگابایت." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffLogoImage(bytes);
    if (!sniffed) return { error: "فرمت فایل معتبر نیست؛ فقط PNG، JPG، WEBP یا SVG پذیرفته می‌شود." };
    const name = (file.name || "logo").slice(0, 180);
    await db.insert(siteSettings).values({
      id: 1, logoData: bytes, logoMime: sniffed.mime, logoName: name,
      logoWidth: sniffed.width, logoHeight: sniffed.height, logoSize: bytes.length,
      logoUpdatedAt: new Date(), logoUpdatedBy: user.id,
    }).onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        logoData: bytes, logoMime: sniffed.mime, logoName: name,
        logoWidth: sniffed.width, logoHeight: sniffed.height, logoSize: bytes.length,
        logoUpdatedAt: new Date(), logoUpdatedBy: user.id,
      },
    });
    await audit(user.id, "cms_logo_update", "site_settings", "1", `${sniffed.mime}; ${bytes.length} بایت; ${name}`);
    revalidatePath("/", "layout");
    return { success: "لوگوی جدید ذخیره شد و به‌صورت خودکار در همهٔ بخش‌های سایت جایگزین شد." };
  } catch {
    return { error: "آپلود لوگو ممکن نشد؛ دسترسی یا فایل را بررسی کنید." };
  }
}

/** حذف لوگوی سفارشی و بازگشت به آیکن پیش‌فرض برنامه. */
export async function removeLogoAction(_state: ActionState, data: FormData): Promise<ActionState> {
  try {
    const user = await requireCmsEditor();
    await db.insert(siteSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await db.select({ hasLogo: sql<boolean>`(${siteSettings.logoData} is not null)` }).from(siteSettings).limit(1);
    if (!row?.hasLogo) return { warning: true, success: "لوگوی سفارشی‌ای وجود ندارد؛ هم‌اکنون پیش‌فرض برنامه نمایش داده می‌شود." };
    await db.update(siteSettings).set({
      logoData: null, logoMime: null, logoName: null, logoWidth: null, logoHeight: null,
      logoSize: null, logoUpdatedAt: new Date(), logoUpdatedBy: user.id,
    }).where(eq(siteSettings.id, 1));
    await audit(user.id, "cms_logo_remove", "site_settings", "1");
    revalidatePath("/", "layout");
    return { success: "لوگوی سفارشی حذف شد؛ پیش‌فرض برنامه در همه‌جا بازگشت." };
  } catch {
    return { error: "حذف لوگو ممکن نشد." };
  }
}
