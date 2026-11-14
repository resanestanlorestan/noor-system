"use server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { activists, applications, auditLogs } from "@/db/schema";
import { deliverOutbox, notifyUsers } from "@/lib/messaging";
import { clearFailures, isThrottled, recordFailure, requireUser, throttleKey } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { jalaliToIso, normalizeDigits, normalizeText, validNationalId } from "@/lib/format";
import { protectNationalId } from "@/lib/local-secrets";
import type { ActionState } from "@/lib/action-state";

const field = (data: FormData, key: string, max = 100) => normalizeText(String(data.get(key) || "")).slice(0, max);

export async function claimCaseAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await can(user, "cases.claim"))) return { error: "این عملیات فقط برای حساب فعال قرآنی مجاز است." };
  const [own] = await db.select({ id: activists.id }).from(activists).where(eq(activists.userId, user.id)).limit(1);
  if (own) return { error: "برای حساب شما پیش‌تر پرونده‌ای متصل شده است." };
  const firstName = field(data, "firstName", 80), lastName = field(data, "lastName", 100);
  const nationalId = normalizeDigits(field(data, "nationalId", 20)).replace(/\s/g, "");
  const phone = normalizeDigits(field(data, "phone", 20)).replace(/\s/g, "");
  const birth = field(data, "birthDate", 20);
  if (firstName.length < 2 || lastName.length < 2) return { error: "نام و نام خانوادگی را به‌درستی وارد کنید." };
  if (!validNationalId(nationalId)) return { error: "کد ملی معتبر نیست." };
  if (!/^09\d{9}$/.test(phone)) return { error: "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود." };
  const birthDate = jalaliToIso(birth);
  if (!birthDate) return { error: "تاریخ تولد شمسی معتبر نیست؛ مانند ۱۳۷۵/۰۱/۰۱ وارد کنید." };

  const key = await throttleKey(`claim:${user.id}`);
  if (await isThrottled(key)) return { error: "تعداد تلاش‌ها بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره تلاش کنید." };

  const hash = (await protectNationalId(nationalId)).hash;
  const [candidate] = await db.select({ activist: activists, applicationId: applications.id, createdBy: applications.createdBy, assignedExpertId: applications.assignedExpertId }).from(activists)
    .innerJoin(applications, eq(applications.activistId, activists.id))
    .where(and(eq(activists.nationalIdHash, hash), isNull(activists.userId), eq(activists.phone, phone), eq(activists.birthDate, birthDate), isNull(applications.deletedAt), ne(applications.source, "self")))
    .limit(1);

  const matches = candidate && normalizeText(candidate.activist.firstName).toLowerCase() === firstName.toLowerCase() && normalizeText(candidate.activist.lastName).toLowerCase() === lastName.toLowerCase();
  if (!matches || !candidate) {
    await recordFailure(key);
    return { error: "پرونده‌ای با این مشخصات پیدا نشد. اطلاعات باید دقیقاً با آنچه مدیر یا کارشناس ثبت کرده یکسان باشد." };
  }

  let linked = false;
  try {
    await db.transaction(async (tx) => {
      const changed = await tx.update(activists).set({ userId: user.id }).where(and(eq(activists.id, candidate.activist.id), isNull(activists.userId))).returning({ id: activists.id });
      if (!changed.length) throw new Error("already claimed");
      await tx.insert(auditLogs).values({ actorId: user.id, action: "claim_case", targetType: "application", targetId: candidate.applicationId });
      await notifyUsers(tx, [candidate.createdBy, candidate.assignedExpertId], "اتصال پرونده به حساب فعال", "فعال قرآنی مربوط به این پرونده، حساب کاربری خود را به آن متصل کرد.", candidate.applicationId);
    });
    void deliverOutbox();
    linked = true;
  } catch { return { error: "اتصال پرونده انجام نشد؛ ممکن است هم‌زمان توسط فرد دیگری متصل شده باشد." }; }
  if (linked) { await clearFailures(key); redirect(`/cases/${candidate.applicationId}?m=${stashFlash("پرونده شما با موفقیت به حساب کاربری متصل شد.")}`); }
  return { error: "اتصال پرونده انجام نشد." };
}
