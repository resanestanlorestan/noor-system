// Feature-test helpers: real Server Actions against the real PostgreSQL
// `noor_feature` database, with the Next.js request context (cookies,
// redirect, revalidate) simulated in-process. Sessions are created through
// the genuine createSession() so the token → tokenHash → user lookup path
// is exercised end to end.
import { vi } from "vitest";
import { eq, sql } from "drizzle-orm";

// --- Next.js request-context mocks (hoisted) ---
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "x-real-ip": "127.0.0.1" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  unstable_noStore: () => undefined,
}));

// --- App imports (after the mocks and after tests/feature/env.ts set the DB URL) ---
import { db, pool } from "@/db";
import * as s from "@/db/schema";
import { createSession, hashPassword, type AppUser } from "@/lib/auth";
import { ensureReferenceData } from "@/lib/data";

export type UserKey = "super" | "prov" | "rev" | "spec" | "act" | "county" | "provFars";
export type Fixture = {
  users: Record<UserKey, AppUser>;
  specialtyId: number;
  tehranProvinceId: number;
  tehranCountyId: number;
  islamshahrCountyId: number;
};

export const FEATURE_PASSWORD = "Feature2026!x";
// NOTE: value re-exports (db, s, eq) intentionally live in the test files —
// modules containing vi.mock are transformed to lazy imports, so value
// bindings exported from here would be snapshotted before "@/db" resolves.

let fixturePromise: Promise<Fixture> | null = null;

/** Idempotent reference data + six-role user fixtures. */
export function featureSeed(): Promise<Fixture> {
  fixturePromise ??= (async () => {
    await ensureReferenceData();
    const provinces = await db.select().from(s.provinces);
    const tehran = provinces.find((p) => p.name === "تهران")!;
    const fars = provinces.find((p) => p.name === "فارس")!;
    let counties = await db.select().from(s.counties);
    const tehranCounty = counties.find((c) => c.provinceId === tehran.id && c.name === "تهران")!;
    // Second county inside Tehran province, used for county-scoping assertions.
    await db.insert(s.counties).values({ provinceId: tehran.id, name: "اسلامشهر" }).onConflictDoNothing();
    counties = await db.select().from(s.counties);
    const islamshahr = counties.find((c) => c.provinceId === tehran.id && c.name === "اسلامشهر")!;
    const [specialty] = await db.select().from(s.specialties).where(eq(s.specialties.code, "commentator"));

    const passwordHash = await hashPassword(FEATURE_PASSWORD);
    const rows = [
      { key: "super", fullName: "مدیر ارشد سامانه", email: "super@feature.local", role: "super_admin" as const, provinceId: null as number | null, countyId: null as number | null },
      { key: "prov", fullName: "مدیر استان تهران", email: "prov@feature.local", role: "province_admin" as const, provinceId: tehran.id, countyId: null },
      { key: "rev", fullName: "کارشناس بررسی", email: "rev@feature.local", role: "reviewer" as const, provinceId: tehran.id, countyId: null },
      { key: "spec", fullName: "کارشناس تخصصی", email: "spec@feature.local", role: "specialist" as const, provinceId: tehran.id, countyId: null },
      { key: "act", fullName: "فعال نمونه", email: "act@feature.local", role: "activist" as const, provinceId: null, countyId: null },
      { key: "county", fullName: "مدیر شهرستان تهران", email: "county@feature.local", role: "county_admin" as const, provinceId: tehran.id, countyId: tehranCounty.id },
      { key: "provFars", fullName: "مدیر استان فارس", email: "prov-fars@feature.local", role: "province_admin" as const, provinceId: fars.id, countyId: null },
    ];
    await db.insert(s.users).values(rows.map(({ key: _key, ...row }) => ({ ...row, passwordHash }))).onConflictDoNothing();
    const stored = await db.select().from(s.users);
    const users = Object.fromEntries(rows.map(({ key, email }) => [key, stored.find((row) => row.email === email)!])) as Fixture["users"];
    await db.insert(s.userSpecialties).values({ userId: users.spec.id, specialtyId: specialty.id }).onConflictDoNothing();

    return { users, specialtyId: specialty.id, tehranProvinceId: tehran.id, tehranCountyId: tehranCounty.id, islamshahrCountyId: islamshahr.id };
  })();
  return fixturePromise;
}

/** Clears the cookie jar and signs in a fixture user via the real createSession. */
export async function loginAs(key: UserKey) {
  jar.clear();
  const { users } = await featureSeed();
  await createSession(users[key].id);
  return users[key];
}

/** Clears the cookie jar: the next action must redirect to /login. */
export function logout() { jar.clear(); }

const CASE_TABLES = [
  "applications", "quranic_activists", "activist_specialties", "activist_specialty_details", "activist_writings",
  "application_status_history",
  "activist_documents", "audit_logs", "expert_referrals", "expert_notes", "correction_requests", "appeals",
  "application_versions", "activist_organizations", "activity_records", "educational_courses",
  "education_records", "certificates", "document_requests", "notifications", "message_outbox",
  "user_sessions", "login_attempts", "mfa_recovery_codes", "pending_mfa_sessions",
  "password_reset_tokens", "email_verification_tokens", "case_reminders", "message_broadcasts", "events",
];

/** Truncates all workflow tables, keeping the seeded users and reference data. */
export async function resetCaseData() {
  await db.execute(sql.raw(`truncate table ${CASE_TABLES.join(", ")} restart identity cascade`));
  jar.clear();
}

export async function closeDb() { await pool.end(); }

// --- Redirect inspection (mirrors Next.js digest format) ---
export async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  throw new Error("expected the action to redirect, but it returned normally");
}

export function messageOf(url: string) {
  return new URL(url, "http://feature.local").searchParams.get("message") ?? "";
}

export function caseIdOf(url: string) {
  return url.replace(/^\/cases\//, "").split("?")[0];
}

// --- Data builders ---
export function nationalId(base9: string) {
  const sum = [...base9].reduce((acc, digit, i) => acc + Number(digit) * (10 - i), 0);
  const rem = sum % 11;
  return base9 + String(rem < 2 ? rem : 11 - rem);
}

export function form(entries: Record<string, string | string[] | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((item) => fd.append(key, item));
    else fd.set(key, value);
  }
  return fd;
}

const PDF_BYTES = Buffer.from("%PDF-1.4\n%feature-test-document\n");

export function pdfFile(name = "madrak.pdf") {
  return new File([PDF_BYTES], name, { type: "application/pdf" });
}

/** A profile that passes missingRequired() once one evidence document is uploaded.
 *  Since مرحله سوم every identity field except the email is mandatory, so the
 *  builder fills them all (idCardNumber, idIssuePlace, alternatePhone included).
 *  Since مرحله چهارم the chosen specialty (commentator) also carries its
 *  structured checklist detail; tests that exercise the detail validation
 *  override `specialties`/`specialtyDetails` themselves. */
export function completeProfile(f: Fixture, overrides: Record<string, string | string[]> = {}) {
  return form({
    firstName: "زهرا", lastName: "موسوی", fatherName: "حسین",
    nationalId: nationalId("123456789"), birthDate: "1375/01/01",
    gender: "female", phone: "09121110001",
    idCardNumber: "1234567", idIssuePlace: "تهران", alternatePhone: "09351110001",
    provinceId: String(f.tehranProvinceId), countyId: String(f.tehranCountyId),
    city: "تهران", address: "تهران، خیابان آزمون",
    specialties: [String(f.specialtyId)],
    specialtyDetails: JSON.stringify([{ code: "commentator", options: ["tafsir", "tadabbor"] }]),
    ...overrides,
  });
}
