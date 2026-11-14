// Formal case dossier (دوزیه رسمی پرونده — Release 2.3).
// One loader shared by the printable /cases/[id]/dossier page and the feature
// tests: everything shown in the dossier is assembled here, strictly inside
// the caller's geographic scope (via getCaseForUser).
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activistOrganizations, activityRecords, activistSpecialties, activistSpecialtyDetails, activistWritings, applications, certificates,
  counties, documents, educationalCourses, educationRecords, organizations, provinces, specialties, statusHistory, users, workHistory,
} from "@/db/schema";
import type { AppUser } from "@/lib/auth";
import { getCaseForUser } from "@/lib/data";
import { computeScore, rankLevel } from "@/lib/ranking";
import { activityRecordKindLabels, documentTypeLabels, educationTypeLabels, formatSpecialtyDetail, sourceLabels, statusLabels, writingTypeLabels } from "@/lib/constants";
import { isoToJalali } from "@/lib/format";

const dash = "—";
const faDigits = (value: string) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const jalali = (value: string | null) => (value ? faDigits(isoToJalali(value)) : dash);
const periodOf = (start: string | null, end: string | null) => (!start && !end ? dash : `${start ? jalali(start) : "؟"} تا ${end ? jalali(end) : "اکنون"}`);
const faLongDate = (date: Date) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(date);

export type DossierSection = {
  id: string; main: string; extra: string | null; kindLabel: string | null; period: string;
};

type CaseRow = NonNullable<Awaited<ReturnType<typeof getCaseForUser>>>;

export type DossierData = {
  caseId: string; status: string; statusLabel: string; sourceLabel: string; createdAt: Date;
  person: CaseRow["activist"];
  specialtyTitles: string[];
  specialtyDetailLines: Array<{ id: string; title: string; detail: string }>;
  writings: DossierSection[];
  provinceName: string | null; countyName: string | null;
  activityProvinceName: string | null; activityCountyName: string | null;
  activities: DossierSection[];
  education: DossierSection[];
  workHistory: DossierSection[];
  courses: DossierSection[];
  certificateRows: DossierSection[];
  organizations: DossierSection[];
  documentList: Array<{ id: string; title: string; typeName: string | null; docNumber: string | null }>;
  history: Array<{ id: string; text: string; actor: string; at: string; note: string | null }>;
  score: number; levelLabel: string; levelColor: string;
};

export async function loadDossier(user: AppUser, caseId: string): Promise<DossierData | null> {
  const row = await getCaseForUser(user, caseId);
  if (!row) return null;
  const { application: app, activist: person } = row;
  const [specialtyRows, writingRows, activityRows, courseRows, certificateRows, organizationRows, documentRows, historyRows, provinceRows, countyRows, activityProvinceRows, activityCountyRows, educationRows, workHistoryRows] = await Promise.all([
    db.select({ id: specialties.id, title: specialties.title, code: specialties.code, detailValue: activistSpecialtyDetails.detailValue, detailOptions: activistSpecialtyDetails.detailOptions }).from(activistSpecialties).innerJoin(specialties, eq(activistSpecialties.specialtyId, specialties.id)).leftJoin(activistSpecialtyDetails, and(eq(activistSpecialtyDetails.specialtyId, activistSpecialties.specialtyId), eq(activistSpecialtyDetails.activistId, activistSpecialties.activistId))).where(eq(activistSpecialties.activistId, person.id)),
    db.select({ id: activistWritings.id, workType: activistWritings.workType, title: activistWritings.title, topic: activistWritings.topic }).from(activistWritings).where(eq(activistWritings.activistId, person.id)).orderBy(desc(activistWritings.createdAt)),
    db.select().from(activityRecords).where(eq(activityRecords.activistId, person.id)).orderBy(desc(activityRecords.startDate)),
    db.select().from(educationalCourses).where(eq(educationalCourses.activistId, person.id)).orderBy(desc(educationalCourses.completedDate)),
    db.select().from(certificates).where(eq(certificates.activistId, person.id)).orderBy(desc(certificates.issuedDate)),
    db.select({ id: activistOrganizations.id, name: organizations.name, role: activistOrganizations.role, startDate: activistOrganizations.startDate, endDate: activistOrganizations.endDate }).from(activistOrganizations).innerJoin(organizations, eq(activistOrganizations.organizationId, organizations.id)).where(eq(activistOrganizations.activistId, person.id)),
    db.select({ id: documents.id, title: documents.title, docType: documents.docType, docNumber: documents.docNumber }).from(documents).where(eq(documents.applicationId, caseId)).orderBy(desc(documents.createdAt)),
    db.select({ event: statusHistory, actor: users.fullName }).from(statusHistory).innerJoin(users, eq(statusHistory.actorId, users.id)).where(eq(statusHistory.applicationId, caseId)).orderBy(desc(statusHistory.createdAt)).limit(30),
    person.provinceId ? db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, person.provinceId)).limit(1) : Promise.resolve([] as Array<{ name: string }>),
    person.countyId ? db.select({ name: counties.name }).from(counties).where(eq(counties.id, person.countyId)).limit(1) : Promise.resolve([] as Array<{ name: string }>),
    person.activityProvinceId ? db.select({ name: provinces.name }).from(provinces).where(eq(provinces.id, person.activityProvinceId)).limit(1) : Promise.resolve([] as Array<{ name: string }>),
    person.activityCountyId ? db.select({ name: counties.name }).from(counties).where(eq(counties.id, person.activityCountyId)).limit(1) : Promise.resolve([] as Array<{ name: string }>),
    db.select().from(educationRecords).where(eq(educationRecords.activistId, person.id)).orderBy(desc(educationRecords.createdAt)),
    db.select().from(workHistory).where(eq(workHistory.activistId, person.id)).orderBy(desc(workHistory.createdAt)),
  ]);

  const counts = {
    activity: activityRows.filter((item) => item.kind === "activity").length,
    teaching: activityRows.filter((item) => item.kind === "teaching").length,
    judging: activityRows.filter((item) => item.kind === "judging").length,
    competition: activityRows.filter((item) => item.kind === "competition").length,
    research: activityRows.filter((item) => item.kind === "research").length,
    courses: courseRows.length, courseHours: courseRows.reduce((sum, item) => sum + (item.hours || 0), 0),
    certificates: certificateRows.length, attended: 0,
  };
  const score = computeScore(counts);
  const level = rankLevel(score);

  return {
    caseId, status: app.status, statusLabel: statusLabels[app.status], sourceLabel: sourceLabels[app.source], createdAt: app.createdAt,
    person,
    specialtyTitles: specialtyRows.map((item) => item.title),
    specialtyDetailLines: specialtyRows
      .map((item) => ({ id: String(item.id), title: item.title, detail: formatSpecialtyDetail(item.code, item.detailValue, item.detailOptions) || "" }))
      .filter((item) => item.detail),
    writings: writingRows.map((item) => ({ id: item.id, main: item.title, extra: [writingTypeLabels[item.workType], item.topic ? `موضوع: ${item.topic}` : null].filter(Boolean).join(" · "), kindLabel: null, period: dash })),
    provinceName: provinceRows[0]?.name ?? null, countyName: countyRows[0]?.name ?? null,
    activityProvinceName: activityProvinceRows[0]?.name ?? null, activityCountyName: activityCountyRows[0]?.name ?? null,
    activities: activityRows.map((item) => ({ id: item.id, main: item.title, extra: [item.organization, item.position].filter(Boolean).join(" · ") || null, kindLabel: activityRecordKindLabels[item.kind], period: periodOf(item.startDate, item.endDate) })),
    education: educationRows.map((item) => ({ id: item.id, main: `${educationTypeLabels[item.type]} · ${item.level}`, extra: [item.field, item.centerName, item.certificate ? `مدرک: ${item.certificate}` : null].filter(Boolean).join(" · ") || null, kindLabel: null, period: dash })),
    workHistory: workHistoryRows.map((item) => ({ id: item.id, main: item.title, extra: [item.employer, item.position].filter(Boolean).join(" · ") || null, kindLabel: null, period: periodOf(item.startDate, item.endDate) })),
    courses: courseRows.map((item) => ({ id: item.id, main: item.title, extra: item.provider, kindLabel: item.hours ? `${faDigits(String(item.hours))} ساعت` : null, period: jalali(item.completedDate) })),
    certificateRows: certificateRows.map((item) => ({ id: item.id, main: item.title, extra: item.issuer, kindLabel: null, period: jalali(item.issuedDate) })),
    organizations: organizationRows.map((item) => ({ id: item.id, main: item.name, extra: item.role, kindLabel: null, period: periodOf(item.startDate, item.endDate) })),
    documentList: documentRows.map((item) => ({ id: item.id, title: item.title, typeName: item.docType && item.docType in documentTypeLabels ? documentTypeLabels[item.docType as keyof typeof documentTypeLabels] : null, docNumber: item.docNumber })),
    history: historyRows.map(({ event, actor }) => ({
      id: event.id,
      text: event.fromStatus && event.fromStatus !== event.toStatus ? `${statusLabels[event.fromStatus]} ← ${statusLabels[event.toStatus]}` : statusLabels[event.toStatus],
      actor, at: faLongDate(event.createdAt),
      note: event.note,
    })),
    score, levelLabel: level.label, levelColor: level.color,
  };
}
