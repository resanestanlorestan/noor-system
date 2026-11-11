// (مرحله پنجم) Integration tests: work-history + course cores against the real
// cloned test database, covering permissions, scope, validation and audit rows.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { activists, applications, auditLogs, educationalCourses, users, workHistory } from "@/db/schema";
import { addWorkHistoryCore, removeWorkHistoryCore, addCourseCore, removeCourseCore } from "@/lib/profile-rows";
import type { SessionUser } from "@/lib/auth";

const TEST_EMAIL = `wh-test-${Date.now()}@noor.local`;

let activistUserId: SessionUser;
let managerUserId: SessionUser;
let outsiderUserId: SessionUser;
let activistId: string;

async function loadSessionUser(email: string): Promise<SessionUser> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error("user not found");
  return {
    id: row.id, fullName: row.fullName, firstName: row.firstName, lastName: row.lastName,
    email: row.email, phone: row.phone, role: row.role, effectiveRole: row.role,
    customPermissions: null, provinceId: row.provinceId, countyId: row.countyId,
    mfaEnabled: row.mfaEnabled, mfaSecretCipher: row.mfaSecretCipher, mobileVerifiedAt: row.mobileVerifiedAt,
  };
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  // activist owner (in province 4 like the seed data)
  const [owner] = await db.insert(users).values({
    fullName: "کاربر آزمون سوابق", firstName: "کاربر", lastName: "آزمون",
    email: TEST_EMAIL, passwordHash: "x", role: "activist", active: true, provinceId: 4,
  }).returning();
  activistUserId = await loadSessionUser(TEST_EMAIL);

  // manager inside the same province
  const [manager] = await db.insert(users).values({
    fullName: `مدیر آزمون ${suffix}`, firstName: "مدیر", lastName: "آزمون",
    email: `wh-manager-${suffix}@noor.local`, passwordHash: "x", role: "province_admin", active: true, provinceId: 4,
  }).returning();
  managerUserId = await loadSessionUser(manager.email!);

  // manager from another province (out of scope)
  const [outsider] = await db.insert(users).values({
    fullName: `مدیر خارج ${suffix}`, firstName: "مدیر", lastName: "خارج",
    email: `wh-outsider-${suffix}@noor.local`, passwordHash: "x", role: "province_admin", active: true, provinceId: 3,
  }).returning();
  outsiderUserId = await loadSessionUser(outsider.email!);

  // activist profile owned by the test user with a draft application
  const [person] = await db.insert(activists).values({
    userId: owner.id, firstName: "علی", lastName: "آزمونی", fatherName: "حسن",
    phone: "09121110000", provinceId: 4, job: "معلم",
  }).returning();
  activistId = person.id;
  await db.insert(applications).values({ activistId, createdBy: owner.id, source: "self", status: "draft" });
});

afterAll(async () => {
  // Child tables first (several FKs are RESTRICT by design), then activists, users.
  await db.delete(workHistory).where(eq(workHistory.activistId, activistId));
  await db.delete(educationalCourses).where(eq(educationalCourses.activistId, activistId));
  await db.delete(applications).where(eq(applications.activistId, activistId));
  await db.delete(activists).where(eq(activists.id, activistId));
  // audit_logs.actor_id is RESTRICT — remove test audit rows before users
  const testUsers = await db.select().from(users).where(inArray(users.role, ["activist", "province_admin"]));
  const ids = testUsers.filter((u) => u.email?.includes("@noor.local") || u.fullName.includes("آزمون")).map((u) => u.id);
  if (ids.length) await db.delete(auditLogs).where(inArray(auditLogs.actorId, ids));
  const owner = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
  if (owner.length) await db.delete(users).where(eq(users.id, owner[0].id));
  const others = await db.select().from(users).where(inArray(users.role, ["province_admin"]));
  const toDelete = others.filter((u) => u.fullName.includes("آزمون")).map((u) => u.id);
  if (toDelete.length) await db.delete(users).where(inArray(users.id, toDelete));
});

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
}

describe("work history core (مرحله پنجم)", () => {
  it("owner adds a valid work row with jalali dates", async () => {
    const result = await addWorkHistoryCore(activistUserId, formData({
      activistId,
      title: "دبیر قرآن دبیرستان شهید بهشتی",
      employer: "آموزش و پرورش",
      position: "دبیر",
      startDate: "۱۳۹۵/۰۴/۰۱",
      endDate: "۱۳۹۸/۰۶/۳۱",
      description: "تدریس قرآن و احکام",
    }));
    expect(result.success).toBeTruthy();
    const rows = await db.select().from(workHistory).where(eq(workHistory.activistId, activistId));
    expect(rows).toHaveLength(1);
    expect(rows[0].startDate).toBe("2016-06-21");
    expect(rows[0].endDate).toBe("2019-09-22");
    expect(rows[0].createdBy).toBe(activistUserId.id);
  });

  it("rejects a title shorter than 3 chars", async () => {
    const result = await addWorkHistoryCore(activistUserId, formData({ activistId, title: "اب" }));
    expect(result.error).toContain("عنوان سابقه کاری");
  });

  it("rejects end date before start date", async () => {
    const result = await addWorkHistoryCore(activistUserId, formData({
      activistId, title: "شغل آزمون ترتیب", startDate: "۱۳۹۸/۰۱/۰۱", endDate: "۱۳۹۵/۰۱/۰۱",
    }));
    expect(result.error).toContain("تاریخ پایان نمی‌تواند قبل از تاریخ شروع");
  });

  it("rejects an invalid jalali date explicitly", async () => {
    const result = await addWorkHistoryCore(activistUserId, formData({
      activistId, title: "شغل آزمون تاریخ بد", startDate: "۱۳۹۸/۱۳/۴۰",
    }));
    expect(result.error).toContain("تاریخ شروع شمسی معتبر نیست");
  });

  it("same-province manager may add, different-province manager is denied", async () => {
    const ok = await addWorkHistoryCore(managerUserId, formData({ activistId, title: "سابقه مدیر هم‌استان" }));
    expect(ok.success).toBeTruthy();

    const denied = await addWorkHistoryCore(outsiderUserId, formData({ activistId, title: "سابقه مدیر خارج از محدوده" }));
    expect(denied.error).toContain("مجوز دسترسی ندارید");
    const rows = await db.select().from(workHistory).where(eq(workHistory.activistId, activistId));
    expect(rows).toHaveLength(2);
  });

  it("removal works for the owner and writes an audit row", async () => {
    const rows = await db.select().from(workHistory).where(eq(workHistory.activistId, activistId));
    // normalizeText converts ZWNJ to plain space, so search with a plain space
    const target = rows.find((r) => r.title.replace(/\u200c/g, " ") === "سابقه مدیر هم استان")!;
    expect(target).toBeTruthy();
    const result = await removeWorkHistoryCore(activistUserId, formData({ activistId, rowId: target.id }));
    expect(result.success).toBeTruthy();
    const after = await db.select().from(workHistory).where(eq(workHistory.activistId, activistId));
    expect(after).toHaveLength(1);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, activistUserId.id), eq(auditLogs.action, "remove_work_history")));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("removal with unknown row id returns a friendly error", async () => {
    const result = await removeWorkHistoryCore(activistUserId, formData({ activistId, rowId: randomUUID() }));
    expect(result.error).toContain("یافت نشد");
  });
});

describe("course cores (مرحله پنجم)", () => {
  it("adds a course with provider, jalali date and hours", async () => {
    const result = await addCourseCore(activistUserId, formData({
      activistId, title: "دوره مربیگری حفظ قرآن", provider: "دارالقرآن امام علی",
      completedDate: "۱۴۰۲/۱۱/۱۵", hours: "۶۰",
    }));
    expect(result.success).toBeTruthy();
    const rows = await db.select().from(educationalCourses).where(eq(educationalCourses.activistId, activistId));
    expect(rows).toHaveLength(1);
    expect(rows[0].hours).toBe(60);
    expect(rows[0].completedDate).toBe("2024-02-04");
  });

  it("rejects hours outside 1..2000", async () => {
    const result = await addCourseCore(activistUserId, formData({ activistId, title: "دوره ساعت نامعتبر", hours: "۳۵۰۰" }));
    expect(result.error).toContain("۱ تا ۲۰۰۰");
  });

  it("rejects invalid jalali completion date", async () => {
    const result = await addCourseCore(activistUserId, formData({ activistId, title: "دوره تاریخ بد", completedDate: "۱۴۰۳/۰۵/۳۲" }));
    expect(result.error).toContain("تاریخ تکمیل شمسی معتبر نیست");
  });

  it("persian digits for hours are normalized", async () => {
    const result = await addCourseCore(activistUserId, formData({ activistId, title: "دوره ارقام فارسی", hours: "۲۴" }));
    expect(result.success).toBeTruthy();
    const rows = await db.select().from(educationalCourses).where(eq(educationalCourses.activistId, activistId));
    expect(rows.some((r) => r.hours === 24)).toBe(true);
  });

  it("course removal by owner", async () => {
    const rows = await db.select().from(educationalCourses).where(eq(educationalCourses.activistId, activistId));
    const target = rows.find((r) => r.title === "دوره ارقام فارسی")!;
    expect(target).toBeTruthy();
    const result = await removeCourseCore(activistUserId, formData({ activistId, rowId: target.id }));
    expect(result.success).toBeTruthy();
    const after = await db.select().from(educationalCourses).where(eq(educationalCourses.activistId, activistId));
    // only two courses were accepted in total (two others were rejected by validation)
    expect(after).toHaveLength(1);
  });
});
