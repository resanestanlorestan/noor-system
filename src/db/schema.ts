import { sql } from "drizzle-orm";
import { boolean, customType, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { SmsCategory } from "@/lib/sms-templates";

export const roleEnum = pgEnum("app_role", ["super_admin", "province_admin", "county_admin", "reviewer", "specialist", "activist"]);
export const statusEnum = pgEnum("application_status", ["draft", "pending", "needs_correction", "approved", "rejected", "specialist_review", "initial", "completing", "ready"]);
export const sourceEnum = pgEnum("application_source", ["self", "manager", "expert", "paper", "api"]);

export const provinces = pgTable("provinces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
});
export const counties = pgTable("counties", {
  id: serial("id").primaryKey(),
  provinceId: integer("province_id").notNull().references(() => provinces.id),
  name: varchar("name", { length: 80 }).notNull(),
}, (table) => [uniqueIndex("counties_province_name_unique").on(table.provinceId, table.name)]);

// Fine-grained permission matrix (requirement section 12): system roles keep
// their grants in role_permissions; admins can define additional custom roles
// whose base_role only drives data scoping while its grant list drives
// capabilities. A user with customRoleId set gets effectiveRole = baseRole.
export const customRoles = pgTable("custom_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: varchar("label", { length: 100 }).notNull(),
  baseRole: roleEnum("base_role").notNull().default("activist"),
  description: text("description"),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const customRolePermissions = pgTable("custom_role_permissions", {
  customRoleId: uuid("custom_role_id").notNull().references(() => customRoles.id, { onDelete: "cascade" }),
  permissionKey: varchar("permission_key", { length: 60 }).notNull(),
}, (table) => [primaryKey({ columns: [table.customRoleId, table.permissionKey] })]);
export const rolePermissions = pgTable("role_permissions", {
  roleKey: roleEnum("role_key").notNull(),
  permissionKey: varchar("permission_key", { length: 60 }).notNull(),
}, (table) => [primaryKey({ columns: [table.roleKey, table.permissionKey] })]);

export const users = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: varchar("full_name", { length: 140 }).notNull(),
  // Split identity fields (مرحله دوم): registration and forms save these;
  // full_name stays as the derived display value so every existing screen
  // keeps working without change.
  firstName: varchar("first_name", { length: 80 }),
  lastName: varchar("last_name", { length: 100 }),
  // Optional since the mobile-first auth revamp: login works with the phone
  // number, email remains an alternative identifier and notification channel.
  email: varchar("email", { length: 254 }).unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("activist"),
  customRoleId: uuid("custom_role_id").references((): AnyPgColumn => customRoles.id, { onDelete: "set null" }),
  // Optional mobile number used by the overdue-case SMS reminder job.
  phone: varchar("phone", { length: 20 }),
  provinceId: integer("province_id").references(() => provinces.id),
  countyId: integer("county_id").references(() => counties.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Public registration activates the account only after the mobile OTP code
  // is confirmed; this timestamp marks that confirmation.
  mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
  mfaSecretCipher: text("mfa_secret_cipher"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
  // الحاقیهٔ ۲.۱۰.۲ — حذف امن (گمنام‌سازی، مهاجرت ۰۰۱۶): حساب متصل به داده با
  // این ستون از فهرست کاربران خارج و ورودش مسدود می‌شود؛ ردپای ممیزی می‌ماند.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
// Mobile (SMS OTP) password reset (مرحله دوم): mirrors mobile_verification_codes.
// The 6-digit code is stored hashed, expires quickly and caps attempts.
export const mobileResetCodes = pgTable("mobile_reset_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mobile: varchar("mobile", { length: 20 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("mobile_reset_user_idx").on(table.userId)]);

export const mfaRecoveryCodes = pgTable("mfa_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("mfa_recovery_codes_user_idx").on(table.userId)]);
export const pendingMfaSessions = pgTable("pending_mfa_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const sessions = pgTable("user_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // الحاقیهٔ ۲.۱۸.۷ — آخرین فعالیت نشست؛ مبنا بطلان خودکار بی‌فعالیتی در سمت سرور
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_user_idx").on(table.userId)]);
export const loginAttempts = pgTable("login_attempts", {
  identityHash: varchar("identity_hash", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});
export const specialties = pgTable("quranic_specialties", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  title: varchar("title", { length: 100 }).notNull(),
});
export const activists = pgTable("quranic_activists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique().references(() => users.id),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  fatherName: varchar("father_name", { length: 80 }),
  nationalIdCipher: text("national_id_cipher"),
  // الحاقیهٔ ۲.۱۲.۰ — یکتایی کد ملی فقط میان پرونده‌های فعال اعمال می‌شود؛
  // قید UNIQUE ساده به ایندکس یکتای جزئی روی ردیف‌های حذف‌نشده تبدیل شده است
  // تا پس از «حذف از فهرست فعال»، ثبت‌نام مجدد با همان کد ملی ممکن باشد.
  nationalIdHash: varchar("national_id_hash", { length: 64 }),
  nationalIdLast4: varchar("national_id_last4", { length: 4 }),
  birthDate: date("birth_date"),
  gender: varchar("gender", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  alternatePhone: varchar("alternate_phone", { length: 20 }),
  email: varchar("email", { length: 254 }),
  provinceId: integer("province_id").references(() => provinces.id),
  countyId: integer("county_id").references(() => counties.id),
  city: varchar("city", { length: 120 }),
  postalCode: varchar("postal_code", { length: 10 }),
  address: text("address"),
  idCardNumber: varchar("id_card_number", { length: 20 }),
  idIssuePlace: varchar("id_issue_place", { length: 80 }),
  activityProvinceId: integer("activity_province_id"),
  activityCountyId: integer("activity_county_id"),
  activityPlace: varchar("activity_place", { length: 180 }),
  organization: varchar("organization", { length: 180 }),
  // Standalone occupation field (مرحله سوم) — independent from the Quranic
  // organization column; free text (e.g. دانشجو، معلم، کارمند).
  job: varchar("job", { length: 120 }),
  photoDocumentId: uuid("photo_document_id"),
  activityHistory: text("activity_history"),
  teachingHistory: text("teaching_history"),
  achievements: text("achievements"),
  notes: text("notes"),
  // الحاقیهٔ ۲.۱۲.۰ — تحصیلات درون‌بخشی: مقطع دانشگاهی (بی‌سواد تا دکترا) و
  // مقطع حوزوی (سطح ۱ تا ۴) به‌همراه مدرک بارگذاری‌شده هر بخش؛ مقادیر کامل‌تر
  // در education_records هم نگه داشته می‌شود.
  universityLevel: varchar("university_level", { length: 60 }),
  universityDocumentId: uuid("university_document_id"),
  seminaryLevel: varchar("seminary_level", { length: 60 }),
  seminaryDocumentId: uuid("seminary_document_id"),
  // الحاقیهٔ ۲.۱۲.۰ — نوع مدرک حافظ (specialized/general/none) و گواهی بارگذاری‌شده
  memorizationCertType: varchar("memorization_cert_type", { length: 20 }),
  memorizationDocumentId: uuid("memorization_document_id"),
  // الحاقیهٔ ۲.۱۲.۰ — حذف نرم رکورد فعال (هم‌گام با applications.deletedAt):
  // تاریخ‌گذاری یعنی پرونده از فهرست فعال خارج شده و کد ملی آن برای ثبت‌نام
  // مجدد آزاد است؛ رکورد در بانک برای ممیزی می‌ماند.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("activists_scope_idx").on(table.provinceId, table.countyId),
  index("activists_name_idx").on(table.lastName, table.firstName),
  // یکتای جزئی کد ملی — فقط ردیف‌های فعال (بدون حذف) با کد ملی ثبت‌شده
  uniqueIndex("activists_national_id_active_unique").on(table.nationalIdHash).where(sql`${table.deletedAt} is null and ${table.nationalIdHash} is not null`),
]);
export const activistSpecialties = pgTable("activist_specialties", {
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id),
}, (table) => [primaryKey({ columns: [table.activistId, table.specialtyId] })]);
// (مرحله چهارم) Structured per-specialty detail: one row per (activist,
// specialty). `detailValue` holds the single dropdown choice (memorizer:
// "1".."30" or "complete"; reciter: "4".."7"); `detailOptions` holds the
// checklist choices (commentator/judge/trainer/teacher/cultural_activist).
// Author works live in activist_writings below.
export const activistSpecialtyDetails = pgTable("activist_specialty_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id, { onDelete: "cascade" }),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id),
  detailValue: varchar("detail_value", { length: 40 }),
  detailOptions: jsonb("detail_options").$type<string[]>(),
  // الحاقیهٔ ۲.۱۳.۰ — اجزای دقیق حفظ قرآن برای تخصص «حافظ» (مثل "1,2,5,12,20")
  juzParts: varchar("juz_parts", { length: 120 }),
  // الحاقیهٔ ۲.۱۲.۰ — گواهی تخصص: فایل بارگذاری‌شده برای همین تخصص
  certDocumentId: uuid("cert_document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("activist_specialty_details_unique").on(table.activistId, table.specialtyId)]);
// (مرحله چهارم) Multiple book/article entries for the author (مؤلف) specialty.
export const writingTypeEnum = pgEnum("writing_type", ["book", "article"]);
export const activistWritings = pgTable("activist_writings", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id, { onDelete: "cascade" }),
  workType: writingTypeEnum("work_type").notNull().default("book"),
  title: varchar("title", { length: 180 }).notNull(),
  topic: varchar("topic", { length: 180 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("activist_writings_activist_idx").on(table.activistId)]);
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().unique().references(() => activists.id),
  status: statusEnum("status").notNull().default("draft"),
  source: sourceEnum("source").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  assignedExpertId: uuid("assigned_expert_id").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // الحاقیهٔ ۲.۱۰.۴ — حذف دو‌سطحی پرونده: ستون مستقل از وضعیت کاری تا جریان
  // گردش‌کار دست‌نخورده بماند؛ مقداردهی یعنی «حذف با ماندگاری در بانک».
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [index("applications_status_idx").on(table.status), index("applications_expert_idx").on(table.assignedExpertId)]);
export const statusHistory = pgTable("application_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  fromStatus: statusEnum("from_status"),
  toStatus: statusEnum("to_status").notNull(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("status_history_application_idx").on(table.applicationId)]);
export const documents = pgTable("activist_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  storageKey: varchar("storage_key", { length: 80 }).notNull().unique(),
  originalName: varchar("original_name", { length: 180 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  docType: varchar("doc_type", { length: 40 }),
  docNumber: varchar("doc_number", { length: 60 }),
  kind: varchar("kind", { length: 20 }).$type<"evidence" | "id_photo">().notNull().default("evidence"),
  mimeType: varchar("mime_type", { length: 60 }).notNull(),
  size: integer("size").notNull(),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("documents_application_idx").on(table.applicationId)]);
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 80 }).notNull(),
  targetType: varchar("target_type", { length: 60 }).notNull(),
  targetId: varchar("target_id", { length: 80 }),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_actor_idx").on(table.actorId), index("audit_target_idx").on(table.targetType, table.targetId)]);

export const userSpecialties = pgTable("user_specialties", {
  userId: uuid("user_id").notNull().references(() => users.id),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id),
}, (table) => [primaryKey({ columns: [table.userId, table.specialtyId] })]);

export const expertReferrals = pgTable("expert_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id),
  specialistId: uuid("specialist_id").notNull().references(() => users.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  requestNote: text("request_note"),
  status: varchar("status", { length: 20 }).$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  opinion: text("opinion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [index("expert_referrals_specialist_idx").on(table.specialistId), index("expert_referrals_application_idx").on(table.applicationId), uniqueIndex("expert_referrals_one_pending_idx").on(table.applicationId).where(sql`${table.status} = 'pending'`)]);

export const correctionRequests = pgTable("correction_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).$type<"open" | "responded">().notNull().default("open"),
  response: text("response"),
  respondedBy: uuid("responded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (table) => [index("correction_requests_application_idx").on(table.applicationId), uniqueIndex("correction_one_open_idx").on(table.applicationId).where(sql`${table.status} = 'open'`)]);

export const appeals = pgTable("appeals", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).$type<"open" | "resolved">().notNull().default("open"),
  outcome: varchar("outcome", { length: 20 }).$type<"upheld" | "reconsider">(),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [index("appeals_application_idx").on(table.applicationId), index("appeals_assigned_idx").on(table.assignedTo), uniqueIndex("appeals_one_open_idx").on(table.applicationId).where(sql`${table.status} = 'open'`)]);

// مرحله هفتم: یادداشت‌های داخلی کارشناسی روی پرونده — برای تیم بررسی؛
// فعالِ صاحب پرونده این یادداشت‌ها را نمی‌بیند (بازخورد رسمی از مسیر
// درخواست اصلاح و مدارک درخواستی عبور می‌کند).
export const expertNotes = pgTable("expert_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("expert_notes_application_idx").on(table.applicationId), index("expert_notes_author_idx").on(table.authorId)]);

export const applicationVersions = pgTable("application_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("application_version_unique_idx").on(table.applicationId, table.version)]);

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull().unique(),
  type: varchar("type", { length: 120 }),
  provinceId: integer("province_id").references(() => provinces.id),
  countyId: integer("county_id").references(() => counties.id),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  managerName: varchar("manager_name", { length: 140 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activistOrganizations = pgTable("activist_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  role: varchar("role", { length: 120 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("activist_organizations_activist_idx").on(table.activistId), uniqueIndex("activist_organizations_unique_idx").on(table.activistId, table.organizationId)]);

export const recordKindEnum = pgEnum("activity_record_kind", ["activity", "teaching", "judging", "competition", "research"]);

export const activityRecords = pgTable("activity_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  kind: recordKindEnum("kind").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  organization: varchar("organization", { length: 180 }),
  position: varchar("position", { length: 120 }),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  // الحاقیهٔ ۲.۱۲.۰ — رشتهٔ وابسته به نوع سابقه (تدریس/داوری): کلید از courseFieldOptions
  field: varchar("field", { length: 40 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("activity_records_activist_idx").on(table.activistId)]);

export const educationalCourses = pgTable("educational_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  title: varchar("title", { length: 180 }).notNull(),
  provider: varchar("provider", { length: 180 }),
  completedDate: date("completed_date"),
  hours: integer("hours"),
  certificateId: uuid("certificate_id"),
  // الحاقیهٔ ۲.۱۲.۰ — رشتهٔ دوره (courseFieldOptions) و گواهی بارگذاری‌شدهٔ همان دوره
  field: varchar("field", { length: 40 }),
  documentId: uuid("document_id").references(() => documents.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("educational_courses_activist_idx").on(table.activistId)]);

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  title: varchar("title", { length: 180 }).notNull(),
  issuer: varchar("issuer", { length: 180 }),
  issuedDate: date("issued_date"),
  documentId: uuid("document_id").references(() => documents.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("certificates_activist_idx").on(table.activistId)]);

// Educational background (مرحله سوم): multiple seminary/university records per
// activist. `documentId` is reserved for مرحله ششم where uploaded documents get
// linked to education entries.
export const educationTypeEnum = pgEnum("education_type", ["seminary", "university"]);
export const educationRecords = pgTable("education_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  type: educationTypeEnum("type").notNull(),
  level: varchar("level", { length: 60 }).notNull(),
  field: varchar("field", { length: 120 }),
  universityType: varchar("university_type", { length: 60 }),
  centerName: varchar("center_name", { length: 180 }),
  certificate: varchar("certificate", { length: 180 }),
  documentId: uuid("document_id").references(() => documents.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("education_records_activist_idx").on(table.activistId)]);

// (مرحله پنجم) Work history: past professional/job positions of the activist,
// independent from Quranic-activity records. `startDate`/`endDate` are ISO
// strings produced by the shared jalaliToIso parser. `documentId` (مرحله ششم)
// optionally links the entry to one of the case's uploaded documents.
export const workHistory = pgTable("work_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  activistId: uuid("activist_id").notNull().references(() => activists.id),
  title: varchar("title", { length: 180 }).notNull(),
  employer: varchar("employer", { length: 180 }),
  position: varchar("position", { length: 120 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  documentId: uuid("document_id").references(() => documents.id),
  // الحاقیهٔ ۲.۱۲.۰ — نوع همکاری (cooperationTypeOptions: تمام‌وقت، نیمه‌وقت، …)
  cooperationType: varchar("cooperation_type", { length: 40 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("work_history_activist_idx").on(table.activistId)]);

export const documentRequests = pgTable("document_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  title: varchar("title", { length: 120 }).notNull(),
  note: text("note"),
  status: varchar("status", { length: 20 }).$type<"open" | "fulfilled" | "explained">().notNull().default("open"),
  fulfilledDocumentId: uuid("fulfilled_document_id").references(() => documents.id),
  explanation: text("explanation"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("document_requests_application_idx").on(table.applicationId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  applicationId: uuid("application_id").references(() => applications.id),
  title: varchar("title", { length: 140 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("notifications_recipient_idx").on(table.userId, table.readAt)]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("password_reset_user_idx").on(table.userId)]);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  newEmail: varchar("new_email", { length: 254 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("email_verification_user_idx").on(table.userId)]);

// Mobile (SMS OTP) verification for public registration: one row per issued
// code, replaced whenever a new code is requested. Only the SHA-256 digest of
// the 6-digit code is stored. Attempts are capped per code.
export const mobileVerificationCodes = pgTable("mobile_verification_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mobile: varchar("mobile", { length: 20 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("mobile_verification_user_idx").on(table.userId)]);

// Bridge between the no-session verify page (/register/verify/<token>) and the
// pending account; mirrors pendingMfaSessions. TTL-bound and single-purpose.
export const pendingMobileVerifications = pgTable("pending_mobile_verifications", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Overdue-case reminder ledger: one row per (case, recipient) reminder send.
// Drives the cooldown so nobody is reminded twice within the window and gives
// managers an auditable history. The SMS itself lives in message_outbox.
export const caseReminders = pgTable("case_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientPhone: varchar("recipient_phone", { length: 20 }),
  message: text("message").notNull(),
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
  automated: boolean("automated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("case_reminders_application_idx").on(table.applicationId, table.createdAt), index("case_reminders_recipient_idx").on(table.recipientId, table.createdAt)]);

export const messageOutbox = pgTable("message_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: varchar("channel", { length: 10 }).$type<"email" | "sms">().notNull(),
  recipient: varchar("recipient", { length: 254 }).notNull(),
  userId: uuid("user_id").references(() => users.id),
  applicationId: uuid("application_id"),
  subject: varchar("subject", { length: 200 }),
  body: text("body").notNull(),
  status: varchar("status", { length: 10 }).$type<"queued" | "sent" | "failed" | "local">().notNull().default("queued"),
  error: text("error"),
  // الحاقیهٔ ۲.۱۰.۵ — دسته‌بندی کاربردی و کلید قالب مبدا برای فیلتر تاریخچهٔ پیامک
  category: varchar("category", { length: 30 }).$type<SmsCategory>(),
  templateKey: varchar("template_key", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [index("message_outbox_status_idx").on(table.status, table.createdAt), index("message_outbox_user_idx").on(table.userId), index("message_outbox_channel_idx").on(table.channel, table.createdAt)]);

// الحاقیهٔ ۲.۱۰.۵ — قالب‌های پیامک قابل ویرایش از داشبورد؛ رجیستری پیش‌فرض‌ها
// در lib/sms-templates.ts است و ردیف دیتابیس فقط متنِ ویرایش‌شده را نگه می‌دارد.
export const smsTemplates = pgTable("sms_templates", {
  key: varchar("key", { length: 60 }).primaryKey(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// تنظیمات پنل پیامکی (رکورد تک‌تایی «default»): کلید API رمزنگاری‌شده با
// APP_ENCRYPTION_KEY نگه داشته می‌شود و هرگز به کلاینت برنمی‌گردد.
export const smsSettings = pgTable("sms_settings", {
  id: varchar("id", { length: 20 }).primaryKey(),
  provider: varchar("provider", { length: 20 }).$type<"payamak-panel" | "kavenegar" | "">().notNull().default(""),
  username: varchar("username", { length: 120 }).notNull().default(""),
  secretCipher: text("secret_cipher"),
  sender: varchar("sender", { length: 31 }).notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// الحاقیهٔ ۲.۱۶.۰ — دریافت‌کنندگان اطلاع‌رسانی پیامکی مدیران. ردیف‌های «auto»
// از سامانهٔ کاربران همگام می‌شوند (نقش مدیریتی یا سمت سفارشی حاوی «مدیر») و
// شماره‌ها یکتاست؛ فعال/غیرفعال بودن دریافت پیامک برای هر مدیر مستقل است.
export const managerSmsRecipients = pgTable("manager_sms_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceUserId: uuid("source_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  position: varchar("position", { length: 120 }).notNull().default(""),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  smsEnabled: boolean("sms_enabled").notNull().default(true),
  // الحاقیهٔ ۲.۱۶.۱ — کنارگذاشتن: حذف ردیف همگام‌شده یعنی این پرچم تا
  // همگام‌سازی ردیف را دوباره نسازد؛ با «بازگردانی» به فهرست برمی‌گردد.
  excluded: boolean("excluded").notNull().default(false),
  source: varchar("source", { length: 10 }).$type<"auto" | "manual">().notNull().default("manual"),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("manager_sms_recipients_source_idx").on(table.sourceUserId)]);

// گزارش رویدادهای پیامک مدیریتی؛ کلید یکتا (نوع رویداد + پرونده + گیرنده)
// ارسال تکراری برای یک پرونده را در سطح دیتابیس ناممکن می‌کند.
export const managerSmsEvents = pgTable("manager_sms_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: varchar("event_type", { length: 40 }).notNull().default("case_created"),
  entityId: uuid("entity_id"),
  recipientId: uuid("recipient_id").notNull().references((): AnyPgColumn => managerSmsRecipients.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 10 }).$type<"queued" | "sent" | "failed" | "local">().notNull().default("queued"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  outboxId: uuid("outbox_id"),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [uniqueIndex("manager_sms_events_dedupe_idx").on(table.eventType, table.entityId, table.recipientId)]);

// کلید خاموش/روشن ارسال خودکار هنگام ثبت پرونده (رکورد تک‌تایی «default»).
export const managerSmsSettings = pgTable("manager_sms_settings", {
  id: varchar("id", { length: 20 }).primaryKey(),
  autoCaseCreated: boolean("auto_case_created").notNull().default(true),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Group broadcast ledger (Release 2.2): one row per mass message with the
// audience filters it was sent to and the delivery counts. The individual SMS
// rows live in message_outbox, the in-app ones in notifications.
export const messageBroadcasts = pgTable("message_broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: varchar("subject", { length: 160 }).notNull(),
  body: text("body").notNull(),
  audience: jsonb("audience").$type<Record<string, unknown>>().notNull(),
  audienceLabel: text("audience_label").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  smsCount: integer("sms_count").notNull().default(0),
  notificationCount: integer("notification_count").notNull().default(0),
  withoutPhoneCount: integer("without_phone_count").notNull().default(0),
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("message_broadcasts_created_idx").on(table.createdAt)]);

// Events calendar (Release 2.4 — فاز ۲): country/province/county events with
// a per-event SMS reminder window. Participants carry their own status and
// reminded_at, so the cron sweep is idempotent per participant.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  kind: varchar("kind", { length: 20 }).$type<"meeting" | "workshop" | "competition" | "ceremony" | "course">().notNull().default("meeting"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: varchar("location", { length: 160 }),
  provinceId: integer("province_id").references(() => provinces.id, { onDelete: "set null" }),
  countyId: integer("county_id").references(() => counties.id, { onDelete: "set null" }),
  capacity: integer("capacity"),
  reminderHours: integer("reminder_hours").notNull().default(48),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("events_starts_idx").on(table.startsAt), index("events_geo_idx").on(table.provinceId, table.countyId)]);

export const eventParticipants = pgTable("event_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  activistId: uuid("activist_id").notNull().references(() => activists.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 12 }).$type<"invited" | "confirmed" | "attended" | "cancelled">().notNull().default("invited"),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("event_participants_event_activist_unique").on(table.eventId, table.activistId), index("event_participants_event_idx").on(table.eventId), index("event_participants_activist_idx").on(table.activistId)]);




// --- الحاقیهٔ ۲.۱۵.۰ — مدیریت API و اتصال به سامانه‌های خارجی ---

/** کلیدهای API صادرشده برای سامانه‌های خارجی؛ مقدار کلید فقط رمزنگاری‌شده
 *  ذخیره می‌شود و هش آن برای احراز Bearer استفاده می‌گردد. */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 24 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyCipher: text("key_cipher"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  rateLimit: integer("rate_limit").notNull().default(60),
  active: boolean("active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** سامانه‌های خارجی برای ارسال خروجی (تست اتصال و وب‌هوک). توکن فقط رمزنگاری‌شده. */
export const apiIntegrations = pgTable("api_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  authType: varchar("auth_type", { length: 12 }).$type<"none" | "bearer" | "header">().notNull().default("none"),
  authHeaderName: varchar("auth_header_name", { length: 80 }).notNull().default("X-API-Key"),
  tokenCipher: text("token_cipher"),
  headers: jsonb("headers").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  active: boolean("active").notNull().default(true),
  lastStatus: varchar("last_status", { length: 10 }),
  lastLatencyMs: integer("last_latency_ms"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** وب‌هوک‌ها: روی رویدادهای مشخص، بدنهٔ JSON به نشانی مقصد ارسال می‌شود. */
export const apiWebhooks = pgTable("api_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  eventKey: varchar("event_key", { length: 60 }).notNull(),
  integrationId: uuid("integration_id").references(() => apiIntegrations.id, { onDelete: "set null" }),
  url: varchar("url", { length: 500 }).notNull(),
  secretCipher: text("secret_cipher"),
  active: boolean("active").notNull().default(true),
  lastStatusCode: integer("last_status_code"),
  lastDispatchAt: timestamp("last_dispatch_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** تاریخچهٔ همهٔ درخواست‌های ورودی و خروجی API برای مانیتورینگ و ارسال مجدد. */
export const apiRequestLogs = pgTable("api_request_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: varchar("direction", { length: 10 }).$type<"incoming" | "outgoing">().notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  path: varchar("path", { length: 300 }).notNull(),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  integrationId: uuid("integration_id").references(() => apiIntegrations.id, { onDelete: "set null" }),
  webhookId: uuid("webhook_id").references(() => apiWebhooks.id, { onDelete: "set null" }),
  statusCode: integer("status_code"),
  ok: boolean("ok").notNull().default(true),
  durationMs: integer("duration_ms").notNull().default(0),
  payload: text("payload"),
  responseSnippet: varchar("response_snippet", { length: 400 }),
  error: varchar("error", { length: 400 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("api_request_logs_created_idx").on(table.createdAt)]);

/** تنظیمات سراسری API (یک ردیف با شناسهٔ ثابت global). */
export const apiSettings = pgTable("api_settings", {
  id: varchar("id", { length: 20 }).primaryKey().default("global"),
  incomingEnabled: boolean("incoming_enabled").notNull().default(true),
  defaultRateLimit: integer("default_rate_limit").notNull().default(60),
  ipAllowlist: varchar("ip_allowlist", { length: 300 }).notNull().default(""),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** الحاقیهٔ ۲.۱۸.۴ — مدیریت محتوای سایت: مقدار جاری هر کلید محتوا. تا پیش از
 * نخستین ویرایشِ مدیر، جدول خالی است و مقدار پیش‌فرضِ رجیستری کد سرو می‌شود؛
 * پس از ویرایش، مقدار دیتابیس در همهٔ صفحات بر پیش‌فرض مقدم می‌شود. */
export const siteContent = pgTable("site_content", {
  key: varchar("key", { length: 120 }).primaryKey(),
  page: varchar("page", { length: 60 }).notNull(),
  section: varchar("section", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/** تاریخچهٔ نسخه‌های پیشین هر کلید محتوا برای بازگردانی؛ هنگام هر ذخیره،
 * مقدار قبلی به‌عنوان یک نسخه ثبت می‌شود و سقف نگهداری ۱۵ نسخه است. */
export const siteContentRevisions = pgTable("site_content_revisions", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 120 }).notNull().references(() => siteContent.key, { onDelete: "cascade" }),
  value: text("value").notNull(),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("site_content_revisions_key_idx").on(table.key, table.changedAt)]);

/** نوع باینری postgres برای نگهداری بایت‌های فایل لوگو. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** الحاقیهٔ ۲.۱۸.۵ — تنظیمات سایت (فعلاً فقط لوگو): بایت‌های فایل + متادیتای
 * نمایش. URL سرو، در کد از روی updatedAt ساخته می‌شود تا کش مرورگر با هر
 * تغییر باطل شود و تا پیش از آپلود همه‌جا آیکن پیش‌فرض نمایش داده می‌شود. */
export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  logoData: bytea("logo_data"),
  logoMime: varchar("logo_mime", { length: 60 }),
  logoName: varchar("logo_name", { length: 180 }),
  logoWidth: integer("logo_width"),
  logoHeight: integer("logo_height"),
  logoSize: integer("logo_size"),
  logoUpdatedAt: timestamp("logo_updated_at", { withTimezone: true }),
  logoUpdatedBy: uuid("logo_updated_by").references(() => users.id, { onDelete: "set null" }),
});

// --- الحاقیهٔ ۲.۱۹.۰ — مدیریت کلاس‌ها و دوره‌های آموزشی با ثبت‌نام هوشمند ---
export const classStatusEnumValues = ["draft", "active", "full", "cancelled", "held"] as const;
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 160 }).notNull(),
  topic: varchar("topic", { length: 200 }).notNull(),
  description: text("description"),
  syllabus: text("syllabus"),
  status: varchar("status", { length: 12 }).$type<(typeof classStatusEnumValues)[number]>().notNull().default("draft"),
  formatType: varchar("format_type", { length: 10 }).$type<"in_person" | "online" | "hybrid">().notNull().default("in_person"),
  capacity: integer("capacity").notNull().default(20),
  startsOn: date("starts_on").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull().default("08:00"),
  endTime: varchar("end_time", { length: 5 }).notNull().default("10:00"),
  location: varchar("location", { length: 180 }),
  address: text("address"),
  teacherName: varchar("teacher_name", { length: 120 }).notNull(),
  teacherPhone: varchar("teacher_phone", { length: 20 }),
  teacherUserId: uuid("teacher_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),
  posterData: bytea("poster_data"),
  posterMime: varchar("poster_mime", { length: 60 }),
  posterName: varchar("poster_name", { length: 180 }),
  posterSize: integer("poster_size"),
  reminderHours: integer("reminder_hours").notNull().default(48),
  waitlistRespondHours: integer("waitlist_respond_hours").notNull().default(24),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("classes_status_idx").on(table.status), index("classes_starts_idx").on(table.startsOn)]);

export const classesCounties = pgTable("classes_counties", {
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  countyId: integer("county_id").notNull().references(() => counties.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.classId, table.countyId] })]);

export const classesSpecialties = pgTable("classes_specialties", {
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.classId, table.specialtyId] })]);

export const classSessions = pgTable("class_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  sessionNo: integer("session_no").notNull(),
  startsOn: date("starts_on").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull().default("08:00"),
  endTime: varchar("end_time", { length: 5 }).notNull().default("10:00"),
  location: varchar("location", { length: 180 }),
  teacherName: varchar("teacher_name", { length: 120 }),
  notes: text("notes"),
}, (table) => [uniqueIndex("class_sessions_class_no_unique").on(table.classId, table.sessionNo)]);

export const classRegistrations = pgTable("class_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 12 }).$type<"registered" | "cancelled">().notNull().default("registered"),
  source: varchar("source", { length: 10 }).$type<"self" | "waitlist" | "admin">().notNull().default("self"),
  approvedBy: uuid("approved_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  cancelReason: text("cancel_reason"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("class_registrations_class_idx").on(table.classId),
  index("class_registrations_user_idx").on(table.userId),
  // ثبت‌نام تکراری فعال برای یک (کلاس، کاربر) در سطح دیتابیس ناممکن است
  uniqueIndex("class_registrations_active_unique").on(table.classId, table.userId).where(sql`${table.status} = 'registered'`),
]);

export const classWaitlist = pgTable("class_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 14 }).$type<"waiting" | "invited" | "converted" | "declined" | "no_response" | "cancelled">().notNull().default("waiting"),
  position: integer("position").notNull(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  respondDeadline: timestamp("respond_deadline", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("class_waitlist_class_idx").on(table.classId, table.position),
  // هر فرد در هر لحظه فقط یک ردیف فعال (در انتظار/دعوت‌شده) در هر کلاس دارد
  uniqueIndex("class_waitlist_active_unique").on(table.classId, table.userId).where(sql`${table.status} in ('waiting', 'invited')`),
]);

export const classAttendance = pgTable("class_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references((): AnyPgColumn => classSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 12 }).$type<"present" | "absent" | "late" | "excused">().notNull().default("absent"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("class_attendance_session_user_unique").on(table.sessionId, table.userId)]);

export const classAttendanceLogs = pgTable("class_attendance_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  attendanceId: uuid("attendance_id").notNull().references((): AnyPgColumn => classAttendance.id, { onDelete: "cascade" }),
  oldStatus: varchar("old_status", { length: 12 }),
  newStatus: varchar("new_status", { length: 12 }).notNull(),
  note: text("note"),
  changedBy: uuid("changed_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classSmsLog = pgTable("class_sms_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references((): AnyPgColumn => classes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 20 }).$type<"invite" | "reminder" | "change" | "cancel" | "waitlist_invite" | "waitlist_expired" | "manual">().notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 10 }).$type<"queued" | "sent" | "failed" | "local">().notNull().default("queued"),
  error: text("error"),
  outboxId: uuid("outbox_id"),
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  index("class_sms_log_class_idx").on(table.classId, table.kind),
  // دعوت فعال‌سازی و یادآور هر (کلاس، فرد) فقط یک‌بار؛ دعوت لیست انتظار می‌تواند
  // پس از عدم پاسخ تکرار شود، لذا ایدمپوتنسش با گذار وضعیت تضمین می‌شود
  uniqueIndex("class_sms_log_dedupe_idx").on(table.classId, table.userId, table.kind)
    .where(sql`${table.kind} in ('invite', 'reminder')`),
]);
