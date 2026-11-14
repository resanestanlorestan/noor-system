"use server";

// مرحله هفتم: یادداشت‌های کارشناسی روی پرونده.
// یادداشت داخلی برای تیم بررسی است — دسترسی نوشتن با مجوز ریزدانه
// «cases.expert_notes» کنترل می‌شود و فعالِ صاحب پرونده این بخش را نمی‌بیند.
// بازخورد رسمی به فعال همچنان فقط از مسیر درخواست اصلاح و مدارک درخواستی عبور می‌کند.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stashFlash } from "@/lib/flash";
import { db } from "@/db";
import { auditLogs, expertNotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { can } from "@/lib/permissions";
import { normalizeText } from "@/lib/format";

const field = (data: FormData, key: string, max = 2000) => normalizeText(String(data.get(key) || "")).slice(0, max);
const finish: (id: string, message: string) => never = (id, message) => redirect(`/cases/${id}?m=${stashFlash(message)}`);

export async function addExpertNoteAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const user = await requireUser();
  const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.expert_notes"))) finish(id, "ثبت یادداشت کارشناسی برای شما مجاز نیست.");
  const content = field(data, "content", 2000);
  if (content.length < 3) finish(id, "متن یادداشت باید دست‌کم ۳ نویسه باشد.");
  await db.transaction(async (tx) => {
    await tx.insert(expertNotes).values({ applicationId: id, authorId: user.id, content });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "add_expert_note", targetType: "application", targetId: id });
  });
  revalidatePath(`/cases/${id}`); revalidatePath("/cases");
  finish(id, "یادداشت کارشناسی ثبت شد.");
}

export async function deleteExpertNoteAction(data: FormData) {
  const id = field(data, "caseId", 40);
  const noteId = field(data, "noteId", 80);
  const user = await requireUser();
  const row = await getCaseForUser(user, id);
  if (!row || !(await can(user, "cases.expert_notes"))) finish(id, "حذف یادداشت برای شما مجاز نیست.");
  const deleted = await db.transaction(async (tx) => {
    // فقط نویسنده یادداشت اجازه حذف دارد تا ردپای بررسی دیگر کارشناسان دست‌نخورده بماند.
    const [note] = await tx.select().from(expertNotes).where(and(eq(expertNotes.id, noteId), eq(expertNotes.applicationId, id), eq(expertNotes.authorId, user.id))).limit(1);
    if (!note) return false;
    await tx.delete(expertNotes).where(eq(expertNotes.id, note.id));
    await tx.insert(auditLogs).values({ actorId: user.id, action: "delete_expert_note", targetType: "application", targetId: id, detail: note.content.slice(0, 200) });
    return true;
  });
  revalidatePath(`/cases/${id}`); revalidatePath("/cases");
  finish(id, deleted ? "یادداشت حذف شد." : "تنها نویسنده یادداشت می‌تواند آن را حذف کند.");
}
