"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { appeals, applications, auditLogs, counties, customRoles, expertReferrals, organizations, provinces, sessions, specialties, userSpecialties, users } from "@/db/schema";
import { audit, hashPassword, requireUser } from "@/lib/auth";
import { normalizeDigits, normalizeText } from "@/lib/format";
import { validIranMobile, validPasswordFormat, PASSWORD_POLICY_ERROR } from "@/lib/validation";
import { can } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-state";
import type { UserRole } from "@/lib/constants";
import { isUuid } from "@/lib/workflow-utils";
const field = (data: FormData, key: string, max = 250) => normalizeText(String(data.get(key) || "")).slice(0, max);

export async function createStaffAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!(await can(actor, "users.manage"))) return { error: "مجوز مدیریت کاربران ندارید." };
  const firstName = field(data, "firstName", 80), lastName = field(data, "lastName", 100);
  const email = field(data, "email", 254).toLowerCase(), role = field(data, "role", 30) as UserRole;
  const phone = normalizeDigits(String(data.get("phone") || "")).slice(0, 20);
  const password = String(data.get("password") || "");
  const allowed: UserRole[] = actor.effectiveRole === "super_admin" ? ["province_admin", "county_admin", "reviewer", "specialist"] : ["county_admin", "reviewer", "specialist"];
  if (firstName.length < 2 || lastName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== "" || !validPasswordFormat(password) || !allowed.includes(role)) return { error: "نام، نام خانوادگی، نقش و گذرواژه معتبر (حداقل ۸ نویسه با حروف بزرگ، کوچک و عدد) را بررسی کنید." };
  if (!validIranMobile(phone)) return { error: "شماره موبایل معتبر الزامی است؛ ورود کاربر با همین شماره انجام می‌شود. مانند ۰۹۱۲۳۴۵۶۷۸۹." };
  const rawProvince = Number(field(data, "provinceId", 10)); const rawCounty = Number(field(data, "countyId", 10));
  const provinceId = actor.effectiveRole === "province_admin" ? actor.provinceId : (rawProvince || null); const countyId = rawCounty || null;
  if (!provinceId || (actor.effectiveRole === "province_admin" && rawProvince !== provinceId)) return { error: "استان مجاز را انتخاب کنید." };
  const [province] = await db.select({ id: provinces.id }).from(provinces).where(eq(provinces.id, provinceId)).limit(1);
  if (!province) return { error: "استان معتبر نیست." };
  if (countyId) {
    const [county] = await db.select().from(counties).where(and(eq(counties.id, countyId), eq(counties.provinceId, provinceId))).limit(1);
    if (!county) return { error: "شهرستان با استان سازگار نیست." };
  }
  if (role === "county_admin" && !countyId) return { error: "برای مدیر شهرستان انتخاب شهرستان الزامی است." };
  if (role === "province_admin" && countyId) return { error: "محدوده مدیر استانی باید کل استان باشد؛ شهرستان را انتخاب نکنید." };
  const [phoneTaken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (phoneTaken) return { error: "این شماره موبایل قبلاً برای حساب دیگری ثبت شده است." };
  const specialtyIds = [...new Set(data.getAll("specialtyIds").map((v) => Number(v)).filter((v) => Number.isSafeInteger(v) && v > 0))];
  if (role === "specialist") {
    if (!specialtyIds.length || specialtyIds.length > 10) return { error: "برای کارشناس تخصصی، حداقل یک حوزه معتبر انتخاب کنید." };
    const found = await db.select({ id: specialties.id }).from(specialties).where(inArray(specialties.id, specialtyIds));
    if (found.length !== specialtyIds.length) return { error: "یکی از حوزه‌های تخصصی معتبر نیست." };
  }
  try {
    const passwordHash = await hashPassword(password);
    const fullName = normalizeText(`${firstName} ${lastName}`);
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({ fullName, firstName, lastName, email: email || null, phone, role, passwordHash, provinceId, countyId }).returning({ id: users.id });
      if (role === "specialist") await tx.insert(userSpecialties).values(specialtyIds.map((specialtyId) => ({ userId: created.id, specialtyId })));
      await tx.insert(auditLogs).values({ actorId: actor.id, action: "create_staff", targetType: "user", targetId: created.id, detail: role });
    });
  } catch { return { error: "ایجاد کاربر انجام نشد؛ ممکن است شماره موبایل یا ایمیل تکراری باشد." }; }
  revalidatePath("/users"); redirect("/users?message=" + encodeURIComponent("کاربر با موفقیت ایجاد شد."));
}

export async function updateStaffAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser(); const id = field(data, "userId", 40);
  if (!(await can(actor, "users.manage")) || !isUuid(id) || id === actor.id) return { error: "ویرایش این حساب مجاز نیست." };
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || !["province_admin", "county_admin", "reviewer", "specialist"].includes(target.role) || (actor.effectiveRole === "province_admin" && (!actor.provinceId || target.provinceId !== actor.provinceId || target.role === "province_admin"))) return { error: "حساب خارج از محدوده مدیریت شما است." };
  const firstName = field(data, "firstName", 80), lastName = field(data, "lastName", 100), role = field(data, "role", 30) as UserRole;
  const phone = normalizeDigits(String(data.get("phone") || "")).slice(0, 20);
  const fullName = normalizeText(`${firstName} ${lastName}`);
  const allowed: UserRole[] = actor.effectiveRole === "super_admin" ? ["province_admin", "county_admin", "reviewer", "specialist"] : ["county_admin", "reviewer", "specialist"];
  const rawProvince = Number(field(data, "provinceId", 10)), countyId = Number(field(data, "countyId", 10)) || null;
  const provinceId = actor.effectiveRole === "province_admin" ? actor.provinceId : rawProvince || null;
  if (firstName.length < 2 || lastName.length < 2 || !allowed.includes(role) || !provinceId || (actor.effectiveRole === "province_admin" && rawProvince !== provinceId)) return { error: "نام، نام خانوادگی، نقش و استان مجاز را بررسی کنید." };
  if (!validIranMobile(phone)) return { error: "شماره همراه معتبر الزامی است؛ ورود کاربر با همین شماره انجام می‌شود. مانند ۰۹۱۲۱۲۳۴۵۶۷." };
  const [province] = await db.select({ id: provinces.id }).from(provinces).where(eq(provinces.id, provinceId)).limit(1);
  if (!province) return { error: "استان معتبر نیست." };
  if (countyId) { const [county] = await db.select().from(counties).where(and(eq(counties.id, countyId), eq(counties.provinceId, provinceId))).limit(1); if (!county) return { error: "شهرستان با استان سازگار نیست." }; }
  if (role === "county_admin" && !countyId) return { error: "برای مدیر شهرستان، انتخاب شهرستان الزامی است." };
  if (role === "province_admin" && countyId) return { error: "محدوده مدیر استانی باید کل استان باشد." };
  const specialtyIds = [...new Set(data.getAll("specialtyIds").map((v) => Number(v)).filter((v) => Number.isSafeInteger(v) && v > 0))];
  if (role === "specialist") {
    if (!specialtyIds.length || specialtyIds.length > 10) return { error: "حداقل یک حوزه تخصصی معتبر انتخاب کنید." };
    const found = await db.select({ id: specialties.id }).from(specialties).where(inArray(specialties.id, specialtyIds));
    if (found.length !== specialtyIds.length) return { error: "یکی از حوزه‌های تخصصی معتبر نیست." };
  }
  const currentSpecialties = await db.select({ id: userSpecialties.specialtyId }).from(userSpecialties).where(eq(userSpecialties.userId, id));
  const currentSet = new Set(currentSpecialties.map((item) => item.id)); const nextSet = new Set(specialtyIds);
  const specialtiesChanged = currentSet.size !== nextSet.size || [...currentSet].some((item) => !nextSet.has(item));
  // Custom-role assignment is a global capability reserved to the super admin.
  const rawCustomRole = field(data, "customRoleId", 40);
  const customRoleId = isUuid(rawCustomRole) ? rawCustomRole : null;
  let customRoleChanged = false;
  if (actor.effectiveRole === "super_admin") {
    if (customRoleId) {
      const [customRole] = await db.select({ id: customRoles.id }).from(customRoles).where(eq(customRoles.id, customRoleId)).limit(1);
      if (!customRole) return { error: "نقش سفارشی انتخاب‌شده معتبر نیست." };
    }
    customRoleChanged = (target.customRoleId ?? null) !== customRoleId;
  }
  const changedAccess = target.role !== role || target.provinceId !== provinceId || target.countyId !== countyId || (role === "specialist" && specialtiesChanged) || customRoleChanged;
  if (changedAccess) {
    const [assigned] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.assignedExpertId, id), inArray(applications.status, ["pending", "specialist_review", "needs_correction", "ready"]))).limit(1);
    const [referral] = await db.select({ id: expertReferrals.id }).from(expertReferrals).where(and(eq(expertReferrals.specialistId, id), eq(expertReferrals.status, "pending"))).limit(1);
    const [appeal] = await db.select({ id: appeals.id }).from(appeals).where(and(eq(appeals.assignedTo, id), eq(appeals.status, "open"))).limit(1);
    if (assigned || referral || appeal) return { error: "ابتدا ارجاع‌ها یا اعتراض‌های باز کاربر را تعیین تکلیف کنید." };
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ fullName, role, provinceId, countyId, phone: phone || null, ...(actor.effectiveRole === "super_admin" ? { customRoleId } : {}) }).where(eq(users.id, id));
      if (changedAccess) { await tx.delete(userSpecialties).where(eq(userSpecialties.userId, id)); if (role === "specialist") await tx.insert(userSpecialties).values(specialtyIds.map((specialtyId) => ({ userId:id, specialtyId }))); await tx.delete(sessions).where(eq(sessions.userId, id)); }
      await tx.insert(auditLogs).values({ actorId:actor.id, action:"update_staff", targetType:"user", targetId:id, detail: customRoleChanged ? `${role}|custom:${customRoleId || "none"}` : role });
    });
  } catch { return { error: "ویرایش کاربر انجام نشد؛ دوباره تلاش کنید." }; }
  revalidatePath("/users"); redirect("/users?message=" + encodeURIComponent("اطلاعات کاربر به‌روزرسانی شد."));
}

export async function toggleUserAction(data: FormData) {
  const actor = await requireUser(); const id = field(data, "userId", 40);
  if (!(await can(actor, "users.manage")) || !isUuid(id) || id === actor.id) redirect("/users?message=" + encodeURIComponent("این عملیات مجاز نیست."));
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.role === "super_admin" || (actor.effectiveRole === "province_admin" && (!actor.provinceId || target.provinceId !== actor.provinceId || target.role === "province_admin"))) redirect("/users?message=" + encodeURIComponent("کاربر خارج از محدوده مجاز است."));
  if (target.active) {
    const [assigned] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.assignedExpertId, id), inArray(applications.status, ["pending", "specialist_review", "needs_correction", "ready"]))).limit(1);
    const [referral] = await db.select({ id: expertReferrals.id }).from(expertReferrals).where(and(eq(expertReferrals.specialistId, id), eq(expertReferrals.status, "pending"))).limit(1);
    const [appeal] = await db.select({ id: appeals.id }).from(appeals).where(and(eq(appeals.assignedTo, id), eq(appeals.status, "open"))).limit(1);
    if (assigned || referral || appeal) redirect("/users?message=" + encodeURIComponent("ابتدا ارجاع‌ها یا اعتراض‌های باز کاربر را تعیین تکلیف کنید."));
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ active: !target.active }).where(eq(users.id, target.id));
    if (target.active) await tx.delete(sessions).where(eq(sessions.userId, target.id));
    await tx.insert(auditLogs).values({ actorId:actor.id, action:target.active ? "deactivate_user" : "activate_user", targetType:"user", targetId:target.id });
  });
  revalidatePath("/users");
}

function slugify(title: string) {
  const base = title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return (base || "specialty") + "-" + Math.random().toString(36).slice(2, 8);
}
export async function addSpecialtyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser(); if (!(await can(actor, "settings.references"))) return { error: "مجوز مدیریت تخصص‌ها و سازمان‌ها را ندارید." };
  const title = field(data, "title", 100);
  if (title.length < 2) return { error: "عنوان تخصص را به‌درستی وارد کنید." };
  const [existing] = await db.select({ id: specialties.id }).from(specialties).where(eq(specialties.title, title)).limit(1);
  if (existing) return { error: "این عنوان تخصص قبلاً ثبت شده است." };
  try { const [created] = await db.insert(specialties).values({ code: slugify(title), title }).returning({ id: specialties.id }); await audit(actor.id, "add_specialty", "specialty", String(created.id), title); }
  catch { return { error: "ثبت تخصص انجام نشد؛ دوباره تلاش کنید." }; }
  revalidatePath("/settings"); return { success: "تخصص جدید به فهرست اضافه شد." };
}

export async function addCountyAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser(); if (!(await can(actor, "settings.geo"))) return { error: "مجوز مدیریت تقسیمات جغرافیایی را ندارید." };
  const name = field(data, "name", 80), provinceId = Number(field(data, "provinceId", 10));
  if (name.length < 2 || !provinceId) return { error: "نام شهرستان و استان را وارد کنید." };
  const [province] = await db.select({ id: provinces.id }).from(provinces).where(eq(provinces.id, provinceId)).limit(1);
  if (!province) return { error: "استان معتبر نیست." };
  try { const [created] = await db.insert(counties).values({ name, provinceId }).returning({ id: counties.id }); await audit(actor.id, "add_county", "county", String(created.id)); }
  catch { return { error: "ثبت انجام نشد؛ ممکن است شهرستان تکراری باشد." }; }
  revalidatePath("/settings"); return { success: "شهرستان به فهرست اضافه شد." };
}

export async function addOrganizationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireUser(); if (!(await can(actor, "settings.references"))) return { error: "مجوز مدیریت تخصص‌ها و سازمان‌ها را ندارید." };
  const name = field(data, "name", 180); const type = field(data, "type", 120);
  const address = field(data, "address", 250); const managerName = field(data, "managerName", 140);
  const rawPhone = normalizeDigits(String(data.get("phone") || "")).slice(0, 20);
  if (name.length < 2) return { error: "نام سازمان را به‌درستی وارد کنید." };
  if (managerName && managerName.length < 3) return { error: "نام مدیر مؤسسه را کامل وارد کنید یا خالی بگذارید." };
  if (rawPhone && !/^0\d{9,10}$/.test(rawPhone)) return { error: "شماره تماس مؤسسه را معتبر وارد کنید؛ مانند ۰۲۱۱۲۳۴۵۶۷۸." };
  const provinceId = Number(field(data, "provinceId", 10)) || null; const countyId = Number(field(data, "countyId", 10)) || null;
  if (countyId && !provinceId) return { error: "برای انتخاب شهرستان، ابتدا استان را انتخاب کنید." };
  if (provinceId) {
    const [province] = await db.select({ id: provinces.id }).from(provinces).where(eq(provinces.id, provinceId)).limit(1);
    if (!province) return { error: "استان معتبر نیست." };
  }
  if (countyId) {
    const [county] = await db.select().from(counties).where(and(eq(counties.id, countyId), eq(counties.provinceId, provinceId!))).limit(1);
    if (!county) return { error: "شهرستان با استان سازگار نیست." };
  }
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, name)).limit(1);
  if (existing) return { error: "این سازمان قبلاً در فهرست ثبت شده است." };
  try {
    const [created] = await db.insert(organizations).values({
      name, type: type || null, provinceId, countyId, address: address || null,
      phone: rawPhone || null, managerName: managerName || null,
    }).returning({ id: organizations.id });
    await audit(actor.id, "add_organization", "organization", String(created.id));
  } catch { return { error: "ثبت سازمان انجام نشد؛ دوباره تلاش کنید." }; }
  revalidatePath("/settings"); return { success: "سازمان جدید به فهرست اضافه شد." };
}
