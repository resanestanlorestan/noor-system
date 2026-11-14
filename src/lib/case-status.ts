// مرحله هشتم: صفحهٔ مستقل «وضعیت پرونده‌ها» با تایم‌لاین هشت‌مرحله‌ای.
// این ماژول مدل مراحل عمر پرونده، ساخت تایم‌لاین هر پرونده از روی
// application_status_history و بارگذاری داده‌های محدود به دسترسی کاربر را
// جمع می‌کند تا صفحه و تست‌ها از یک منبع واحد استفاده کنند.
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activists, applications, counties, provinces, statusHistory } from "@/db/schema";
import { scopeCondition } from "@/lib/data";
import type { MaybeSessionUser } from "@/lib/auth";
import { statusLabels, type AppStatus } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/format";

/** هشت مرحلهٔ عمر پرونده به ترتیب طبیعی گردش کار. */
export const CASE_STAGES = [
  { key: "initial", label: "ثبت‌نام اولیه", hint: "ایجاد پرونده در سامانه", color: "#8ba0b0" },
  { key: "draft", label: "پیش‌نویس", hint: "تکمیل اطلاعات پایه توسط فعال", color: "#9db1c4" },
  { key: "completing", label: "در حال تکمیل", hint: "بارگذاری مدارک و تکمیل بخش‌ها", color: "#c5a76c" },
  { key: "ready", label: "آماده ارسال", hint: "کنترل کامل بودن و آماده‌سازی", color: "#78b395" },
  { key: "pending", label: "در انتظار بررسی", hint: "ارسال‌شده به کارتابل بررسی", color: "#d6a64b" },
  { key: "specialist_review", label: "بررسی تخصصی", hint: "نظر تخصصی در جریان است", color: "#8b9fc5" },
  { key: "needs_correction", label: "نیازمند اصلاح", hint: "شاخهٔ برگشتی برای رفع نقص", color: "#df8b67" },
  { key: "final", label: "نتیجه نهایی", hint: "تأییدشده یا ردشده", color: "#46a16f" },
] as const;
export type CaseStageKey = (typeof CASE_STAGES)[number]["key"];

const STATUS_TO_STAGE: Record<AppStatus, CaseStageKey> = {
  initial: "initial",
  draft: "draft",
  completing: "completing",
  ready: "ready",
  pending: "pending",
  specialist_review: "specialist_review",
  needs_correction: "needs_correction",
  approved: "final",
  rejected: "final",
};
const STAGE_ORDER = Object.fromEntries(CASE_STAGES.map((stage, index) => [stage.key, index])) as Record<CaseStageKey, number>;

/** هر وضعیت پایگاه‌داده به کدام مرحله از تایم‌لاین هشت‌مرحله‌ای می‌رسد. */
export const stageKeyForStatus = (status: AppStatus): CaseStageKey => STATUS_TO_STAGE[status];

export type StageVisit = { reached: boolean; reachedAt: Date | null; isCurrent: boolean };
export type CaseTimeline = {
  caseId: string;
  activistName: string;
  province: string | null;
  county: string | null;
  status: AppStatus;
  statusLabel: string;
  outcome: "approved" | "rejected" | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  waitingDays: number;
  stages: Record<CaseStageKey, StageVisit>;
};

type HistoryRow = { toStatus: AppStatus | null; createdAt: Date };

/**
 * تایم‌لاین هشت‌مرحله‌ای یک پرونده: برای هر مرحله آخرین زمان ورود به آن
 * (بر اساس status_history) و وضعیت جاری محاسبه می‌شود. مراحلِ عبورنشده
 * هم با reached=false برمی‌گردند تا رندر ریل تایم‌لاین ثابت بماند.
 */
export function buildCaseTimeline(input: {
  caseId: string;
  activistName: string;
  province: string | null;
  county: string | null;
  status: AppStatus;
  statusLabel: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  history: HistoryRow[];
}): CaseTimeline {
  const visits = {} as Record<CaseStageKey, StageVisit>;
  for (const stage of CASE_STAGES) visits[stage.key] = { reached: false, reachedAt: null, isCurrent: false };
  // نقطهٔ شروع: ثبت‌نام اولیه از زمان ساخت پرونده در دسترس است حتی اگر ردیف
  // history برای آن ثبت نشده باشد (پرونده‌های قدیمی یا ساخت سازمانی).
  visits.initial = { reached: true, reachedAt: input.createdAt, isCurrent: false };
  for (const row of input.history) {
    if (!row.toStatus) continue;
    const key = STATUS_TO_STAGE[row.toStatus as AppStatus];
    const visit = visits[key];
    if (!visit) continue;
    // آخرین ورود به هر مرحله ملاک است (مرحلهٔ اصلاح ممکن است چند بار تکرار شود).
    if (!visit.reached || (row.createdAt && (!visit.reachedAt || row.createdAt > visit.reachedAt))) {
      visit.reached = true;
      visit.reachedAt = row.createdAt ?? visit.reachedAt;
    }
  }
  const currentKey = STATUS_TO_STAGE[input.status];
  visits[currentKey] = {
    ...visits[currentKey],
    reached: true,
    reachedAt: visits[currentKey].reachedAt ?? input.updatedAt,
    isCurrent: true,
  };
  const waitingDays = Math.max(0, Math.floor((Date.now() - new Date(input.updatedAt).getTime()) / 86_400_000));
  return {
    caseId: input.caseId,
    activistName: input.activistName,
    province: input.province,
    county: input.county,
    status: input.status,
    statusLabel: input.statusLabel,
    outcome: input.status === "approved" || input.status === "rejected" ? input.status : null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    submittedAt: input.submittedAt,
    waitingDays,
    stages: visits,
  };
}

export type CaseStatusBundle = { timelines: CaseTimeline[]; totals: Record<CaseStageKey, number>; total: number; truncated: boolean };

/** شمارش پرونده‌های هر مرحله از روی سطرهای گروه‌بندی‌شدهٔ پایگاه‌داده. */
export function totalsFromGroups(groups: { status: AppStatus; total: number }[]): Record<CaseStageKey, number> {
  const totals = Object.fromEntries(CASE_STAGES.map((stage) => [stage.key, 0])) as Record<CaseStageKey, number>;
  for (const group of groups) {
    const key = STATUS_TO_STAGE[group.status];
    if (key) totals[key] += Number(group.total);
  }
  return totals;
}

export function stageTotals(timelines: CaseTimeline[]): Record<CaseStageKey, number> {
  return totalsFromGroups(timelines.map((timeline) => ({ status: timeline.status, total: 1 })));
}

/**
 * دادهٔ صفحهٔ «وضعیت پرونده‌ها»: شمارش هر مرحله روی کل محدودهٔ مجاز کاربر
 * (گروه‌بندی در پایگاه‌داده) به‌همراه تایم‌لاین هشت‌مرحله‌ای آخرین پرونده‌ها.
 * برای جلوگیری از کوئری N+1، تاریخچهٔ وضعیت همهٔ پرونده‌های فهرست در یک
 * کوئری گرفته و در حافظه گروه می‌شود.
 */
export async function listCaseStatus(actor: MaybeSessionUser, limit = 40): Promise<CaseStatusBundle> {
  // الحاقیهٔ ۲.۱۰.۴ — وضعیت‌ها فقط از روی پرونده‌های فعال محاسبه می‌شوند
  const scope = and(scopeCondition(actor), isNull(applications.deletedAt));
  const [groups, rows, totalCount] = await Promise.all([
    db.select({ status: applications.status, total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(scope).groupBy(applications.status),
    db
      .select({
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        submittedAt: applications.submittedAt,
        firstName: activists.firstName,
        lastName: activists.lastName,
        province: provinces.name,
        county: counties.name,
      })
      .from(applications)
      .innerJoin(activists, eq(applications.activistId, activists.id))
      .leftJoin(provinces, eq(activists.provinceId, provinces.id))
      .leftJoin(counties, eq(activists.countyId, counties.id))
      .where(scope)
      .orderBy(desc(applications.updatedAt))
      .limit(limit),
    db.select({ total: count() }).from(applications).innerJoin(activists, eq(applications.activistId, activists.id)).where(scope),
  ]);
  const total = Number(totalCount[0]?.total ?? 0);
  const totals = totalsFromGroups(groups.map((group) => ({ status: group.status as AppStatus, total: Number(group.total) })));
  if (!rows.length) return { timelines: [], totals, total, truncated: false };

  const caseIds = rows.map((row) => row.id);
  const history = await db
    .select({ applicationId: statusHistory.applicationId, toStatus: statusHistory.toStatus, createdAt: statusHistory.createdAt })
    .from(statusHistory)
    .where(inArray(statusHistory.applicationId, caseIds))
    .orderBy(asc(statusHistory.createdAt));
  const historyByCase = new Map<string, HistoryRow[]>();
  for (const row of history) {
    const bucket = historyByCase.get(row.applicationId);
    if (bucket) bucket.push({ toStatus: row.toStatus, createdAt: row.createdAt });
    else historyByCase.set(row.applicationId, [{ toStatus: row.toStatus, createdAt: row.createdAt }]);
  }

  const timelines = rows.map((row) =>
    buildCaseTimeline({
      caseId: row.id,
      activistName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "بدون نام",
      province: row.province,
      county: row.county,
      status: row.status,
      statusLabel: statusLabels[row.status],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      submittedAt: row.submittedAt,
      history: historyByCase.get(row.id) ?? [],
    }));
  // پرونده‌های پیش‌رفته‌تر بالاتر: مرتب‌سازی بر اساس مرحلهٔ جاری و سپس تازه‌ترین به‌روزرسانی.
  timelines.sort((a, b) => STAGE_ORDER[STATUS_TO_STAGE[b.status]] - STAGE_ORDER[STATUS_TO_STAGE[a.status]] || b.updatedAt.getTime() - a.updatedAt.getTime());
  return { timelines, totals, total, truncated: total > timelines.length };
}

/** برچسب فارسی تاریخ هر مرحله برای نمایش روی ریل تایم‌لاین. */
export function stageDateLabel(value: Date | null): string {
  if (!value) return "—";
  return faDate(value);
}

/** خلاصهٔ متنی وضعیت هر مرحله برای tooltip و صفحه‌خوان‌ها. */
export function stageVisitLabel(stageLabel: string, visit: StageVisit): string {
  if (visit.isCurrent) return `${stageLabel} — مرحلهٔ جاری`;
  if (visit.reached) return `${stageLabel} — ${stageDateLabel(visit.reachedAt)}`;
  return `${stageLabel} — طی نشده`;
}

export { faNumber };
