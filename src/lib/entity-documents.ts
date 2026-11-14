// مرحله ششم: ارتباط چندشکلی اسناد با موجودیت‌های پرونده.
//
// یک مدرکِ بارگذاری‌شده می‌تواند هم‌زمان به چند موجودیت متصل شود (سابقه
// تحصیلی، سابقه شغلی، گواهینامه). پیوند از سمت موجودیت با ستون document_id
// نگه داشته می‌شود و این ماژول تنها منبعِ مشترکِ ثبت، برداشتن و فهرست‌کردن
// این پیوندهاست — هم اکشن‌های سرور و هم صفحهٔ جزئیات پرونده و هم تست‌های
// Feature از همین‌جا استفاده می‌کنند.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, educationRecords, workHistory } from "@/db/schema";

/** موجودیت‌هایی که می‌توانند به یک مدرک متصل شوند. */
export const documentLinkTargetLabels = {
  education_record: "سابقه تحصیلی",
  work_history: "سابقه شغلی",
  certificate: "گواهینامه / افتخار",
} as const;

export type DocumentLinkTarget = keyof typeof documentLinkTargetLabels;

export function isDocumentLinkTarget(value: string): value is DocumentLinkTarget {
  return Object.hasOwn(documentLinkTargetLabels, value);
}

type OwnedLinkRow = { id: string; documentId: string | null; title: string };

/** ثبت یا تغییر مدرکِ متصل به یک موجودیت؛ خروجی false یعنی رکورد متعلق به این فعال نیست. */
async function setLink(
  target: DocumentLinkTarget,
  recordId: string,
  activistId: string,
  documentId: string | null,
): Promise<boolean> {
  if (target === "education_record") {
    const rows = await db.update(educationRecords).set({ documentId }).where(and(eq(educationRecords.id, recordId), eq(educationRecords.activistId, activistId))).returning({ id: educationRecords.id });
    return rows.length > 0;
  }
  if (target === "work_history") {
    const rows = await db.update(workHistory).set({ documentId }).where(and(eq(workHistory.id, recordId), eq(workHistory.activistId, activistId))).returning({ id: workHistory.id });
    return rows.length > 0;
  }
  const rows = await db.update(certificates).set({ documentId }).where(and(eq(certificates.id, recordId), eq(certificates.activistId, activistId))).returning({ id: certificates.id });
  return rows.length > 0;
}

/** اتصال یک مدرکِ پرونده به موجودیت. */
export function attachEntityDocument(target: DocumentLinkTarget, recordId: string, activistId: string, documentId: string) {
  return setLink(target, recordId, activistId, documentId);
}

/** جداکردن مدرک از موجودیت (ستون document_id خالی می‌شود). */
export function detachEntityDocument(target: DocumentLinkTarget, recordId: string, activistId: string) {
  return setLink(target, recordId, activistId, null);
}

/** عنوان کوتاه هر موجودیت برای نمایش در فهرست پیوندهای معکوس. */
async function loadOwnedRows(target: DocumentLinkTarget, activistId: string): Promise<OwnedLinkRow[]> {
  if (target === "education_record") {
    return db.select({ id: educationRecords.id, documentId: educationRecords.documentId, title: educationRecords.level }).from(educationRecords).where(eq(educationRecords.activistId, activistId));
  }
  if (target === "work_history") {
    return db.select({ id: workHistory.id, documentId: workHistory.documentId, title: workHistory.title }).from(workHistory).where(eq(workHistory.activistId, activistId));
  }
  return db.select({ id: certificates.id, documentId: certificates.documentId, title: certificates.title }).from(certificates).where(eq(certificates.activistId, activistId));
}

export type DocumentLinkEntry = { target: DocumentLinkTarget; recordId: string; title: string };

/**
 * نقشهٔ پیوندهای معکوسِ هر مدرک فعال قرآنی: شناسهٔ مدرک → فهرست موجودیت‌های
 * متصل. صفحهٔ جزئیات پرونده این را زیر هر مدرک نمایش می‌دهد تا دیده شود که
 * یک سند چندشکلی، هم‌زمان به چند موجودیت اشاره می‌کند.
 */
export async function listDocumentLinks(activistId: string): Promise<Map<string, DocumentLinkEntry[]>> {
  const targets = Object.keys(documentLinkTargetLabels) as DocumentLinkTarget[];
  const owned = await Promise.all(targets.map((target) => loadOwnedRows(target, activistId)));
  const index = new Map<string, DocumentLinkEntry[]>();
  targets.forEach((target, position) => {
    for (const row of owned[position]) {
      if (!row.documentId) continue;
      const entries = index.get(row.documentId) ?? [];
      entries.push({ target, recordId: row.id, title: row.title });
      index.set(row.documentId, entries);
    }
  });
  return index;
}
