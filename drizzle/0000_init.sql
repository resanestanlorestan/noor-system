CREATE TYPE "public"."activity_record_kind" AS ENUM('activity', 'teaching', 'judging', 'competition', 'research');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('super_admin', 'province_admin', 'county_admin', 'reviewer', 'specialist', 'activist');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('self', 'manager', 'expert');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'pending', 'needs_correction', 'approved', 'rejected', 'specialist_review', 'initial', 'completing', 'ready');--> statement-breakpoint
CREATE TABLE "activist_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL,
	"organization_id" integer NOT NULL,
	"role" varchar(120),
	"start_date" date,
	"end_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activist_specialties" (
	"activist_id" uuid NOT NULL,
	"specialty_id" integer NOT NULL,
	CONSTRAINT "activist_specialties_activist_id_specialty_id_pk" PRIMARY KEY("activist_id","specialty_id")
);
--> statement-breakpoint
CREATE TABLE "quranic_activists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"father_name" varchar(80),
	"national_id_cipher" text,
	"national_id_hash" varchar(64),
	"national_id_last4" varchar(4),
	"birth_date" date,
	"gender" varchar(20),
	"phone" varchar(20),
	"alternate_phone" varchar(20),
	"email" varchar(254),
	"province_id" integer,
	"county_id" integer,
	"city" varchar(120),
	"address" text,
	"activity_place" varchar(180),
	"organization" varchar(180),
	"activity_history" text,
	"teaching_history" text,
	"achievements" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quranic_activists_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "quranic_activists_national_id_hash_unique" UNIQUE("national_id_hash")
);
--> statement-breakpoint
CREATE TABLE "activity_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL,
	"kind" "activity_record_kind" NOT NULL,
	"title" varchar(180) NOT NULL,
	"organization" varchar(180),
	"description" text,
	"start_date" date,
	"end_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"assigned_to" uuid,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"outcome" varchar(20),
	"resolution" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"source" "application_source" NOT NULL,
	"created_by" uuid NOT NULL,
	"assigned_expert_id" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_activist_id_unique" UNIQUE("activist_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(60) NOT NULL,
	"target_id" varchar(80),
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"issuer" varchar(180),
	"issued_date" date,
	"document_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"response" text,
	"responded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "counties" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_id" integer NOT NULL,
	"name" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"note" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"fulfilled_document_id" uuid,
	"explanation" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activist_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"storage_key" varchar(80) NOT NULL,
	"original_name" varchar(180) NOT NULL,
	"title" varchar(120) NOT NULL,
	"mime_type" varchar(60) NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activist_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "educational_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"provider" varchar(180),
	"completed_date" date,
	"hours" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expert_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"specialty_id" integer NOT NULL,
	"specialist_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"request_note" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"opinion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"identity_hash" varchar(64) PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"title" varchar(140) NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"type" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "pending_mfa_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_review_marks" (
	"session_hash" varchar(64) NOT NULL,
	"section_id" varchar(40) NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_review_marks_session_hash_section_id_pk" PRIMARY KEY("session_hash","section_id")
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	CONSTRAINT "provinces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quranic_specialties" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(100) NOT NULL,
	CONSTRAINT "quranic_specialties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"actor_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_specialties" (
	"user_id" uuid NOT NULL,
	"specialty_id" integer NOT NULL,
	CONSTRAINT "user_specialties_user_id_specialty_id_pk" PRIMARY KEY("user_id","specialty_id")
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(140) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "app_role" DEFAULT 'activist' NOT NULL,
	"province_id" integer,
	"county_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"mfa_secret_cipher" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_enabled_at" timestamp with time zone,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activist_organizations" ADD CONSTRAINT "activist_organizations_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_organizations" ADD CONSTRAINT "activist_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_organizations" ADD CONSTRAINT "activist_organizations_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_specialties" ADD CONSTRAINT "activist_specialties_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_specialties" ADD CONSTRAINT "activist_specialties_specialty_id_quranic_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."quranic_specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quranic_activists" ADD CONSTRAINT "quranic_activists_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quranic_activists" ADD CONSTRAINT "quranic_activists_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quranic_activists" ADD CONSTRAINT "quranic_activists_county_id_counties_id_fk" FOREIGN KEY ("county_id") REFERENCES "public"."counties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_submitted_by_app_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_assigned_to_app_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_resolved_by_app_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_expert_id_app_users_id_fk" FOREIGN KEY ("assigned_expert_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_document_id_activist_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."activist_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requested_by_app_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_responded_by_app_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counties" ADD CONSTRAINT "counties_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_requested_by_app_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_fulfilled_document_id_activist_documents_id_fk" FOREIGN KEY ("fulfilled_document_id") REFERENCES "public"."activist_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_documents" ADD CONSTRAINT "activist_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activist_documents" ADD CONSTRAINT "activist_documents_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educational_courses" ADD CONSTRAINT "educational_courses_activist_id_quranic_activists_id_fk" FOREIGN KEY ("activist_id") REFERENCES "public"."quranic_activists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educational_courses" ADD CONSTRAINT "educational_courses_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_specialty_id_quranic_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."quranic_specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_specialist_id_app_users_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_requested_by_app_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_mfa_sessions" ADD CONSTRAINT "pending_mfa_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_specialties" ADD CONSTRAINT "user_specialties_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_specialties" ADD CONSTRAINT "user_specialties_specialty_id_quranic_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."quranic_specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_county_id_counties_id_fk" FOREIGN KEY ("county_id") REFERENCES "public"."counties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activist_organizations_activist_idx" ON "activist_organizations" USING btree ("activist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activist_organizations_unique_idx" ON "activist_organizations" USING btree ("activist_id","organization_id");--> statement-breakpoint
CREATE INDEX "activists_scope_idx" ON "quranic_activists" USING btree ("province_id","county_id");--> statement-breakpoint
CREATE INDEX "activists_name_idx" ON "quranic_activists" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "activity_records_activist_idx" ON "activity_records" USING btree ("activist_id");--> statement-breakpoint
CREATE INDEX "appeals_application_idx" ON "appeals" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "appeals_assigned_idx" ON "appeals" USING btree ("assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_one_open_idx" ON "appeals" USING btree ("application_id") WHERE "appeals"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "application_version_unique_idx" ON "application_versions" USING btree ("application_id","version");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_expert_idx" ON "applications" USING btree ("assigned_expert_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "certificates_activist_idx" ON "certificates" USING btree ("activist_id");--> statement-breakpoint
CREATE INDEX "correction_requests_application_idx" ON "correction_requests" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "correction_one_open_idx" ON "correction_requests" USING btree ("application_id") WHERE "correction_requests"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "counties_province_name_unique" ON "counties" USING btree ("province_id","name");--> statement-breakpoint
CREATE INDEX "document_requests_application_idx" ON "document_requests" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "activist_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "educational_courses_activist_idx" ON "educational_courses" USING btree ("activist_id");--> statement-breakpoint
CREATE INDEX "expert_referrals_specialist_idx" ON "expert_referrals" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "expert_referrals_application_idx" ON "expert_referrals" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_referrals_one_pending_idx" ON "expert_referrals" USING btree ("application_id") WHERE "expert_referrals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_user_idx" ON "mfa_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_history_application_idx" ON "application_status_history" USING btree ("application_id");