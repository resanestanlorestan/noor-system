"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { originUrl } from "@/lib/request-url";
import { consumeEmailVerificationToken, issueEmailVerificationToken, pendingVerificationRecentlyIssued } from "@/lib/email-tokens";
import { deliverOutbox, emailVerificationEmail, localDeliveryMode, queueEmail } from "@/lib/messaging";
import type { ActionState } from "@/lib/action-state";

export async function resendVerificationAction(_state: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  void data;
  if (user.emailVerifiedAt) return { error: "ایمیل حساب شما از قبل تأیید شده است." };
  if (!user.email) return { error: "برای حساب شما ایمیل ثبت نشده است؛ ثبت ایمیل اختیاری است." };
  if (await pendingVerificationRecentlyIssued(user.id, 5)) return { error: "پیوند تأیید به‌تازگی ارسال شده است؛ چند دقیقه صبر کنید." };
  const email = user.email;
  const token = await db.transaction(async (tx) => {
    const created = await issueEmailVerificationToken(tx, user.id, null);
    const template = emailVerificationEmail(`${await originUrl()}/verify-email/${created}`);
    await queueEmail(tx, email, template.subject, template.body, { userId: user.id });
    return created;
  });
  await db.insert(auditLogs).values({ actorId: user.id, action: "resend_email_verification", targetType: "user", targetId: user.id });
  void deliverOutbox();
  return { success: "پیوند تأیید ایمیل ارسال شد.", devLink: localDeliveryMode() ? `/verify-email/${token}` : undefined };
}

/** Applies an e-mail verification (or change) token; used by the /verify-email page. */
export async function applyEmailVerification(token: string) {
  const consumed = await consumeEmailVerificationToken(token);
  if (!consumed) return { ok: false as const };
  return await db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, consumed.userId)).limit(1);
    if (!user) return { ok: false as const };
    if (consumed.newEmail) {
      const [conflict] = await tx.select({ id: users.id }).from(users).where(eq(users.email, consumed.newEmail)).limit(1);
      if (conflict) return { ok: false as const, conflict: true };
      await tx.update(users).set({ email: consumed.newEmail, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
      await tx.insert(auditLogs).values({ actorId: user.id, action: "change_email", targetType: "user", targetId: user.id, detail: `${user.email} → ${consumed.newEmail}` });
      return { ok: true as const, changedTo: consumed.newEmail, oldEmail: user.email };
    }
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "verify_email", targetType: "user", targetId: user.id });
    return { ok: true as const, verified: true };
  });
}
