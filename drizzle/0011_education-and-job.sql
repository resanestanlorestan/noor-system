-- مرحله سوم اصلاحات: فیلد مستقل «شغل» برای فعالان و جدول اطلاعات تحصیلی
-- (حوزوی/دانشگاهی) با ثبت چندگانه.
--> statement-breakpoint
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "job" varchar(120);
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "education_type" AS ENUM ('seminary', 'university');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "education_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL REFERENCES "quranic_activists"("id"),
	"type" "education_type" NOT NULL,
	"level" varchar(60) NOT NULL,
	"field" varchar(120),
	"center_name" varchar(180),
	"certificate" varchar(180),
	"document_id" uuid REFERENCES "activist_documents"("id"),
	"created_by" uuid NOT NULL REFERENCES "app_users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "education_records_activist_idx" ON "education_records" ("activist_id");
