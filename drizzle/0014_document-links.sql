-- مرحله ششم: اتصال چندوجهی اسناد به رکوردهای پرونده. یک مدرک بارگذاری‌شده
-- می‌تواند چند رکورد را مستند کند و هر رکورد می‌تواند چند مدرک داشته باشد؛
-- مالکیت مدرک همچنان با پرونده (activist_documents.application_id) است.
--> statement-breakpoint
CREATE TYPE "document_link_target" AS ENUM ('education_record', 'work_history', 'educational_course', 'certificate', 'activity_record', 'writing');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "document_id" uuid NOT NULL REFERENCES "activist_documents"("id") ON DELETE CASCADE,
        "target_type" "document_link_target" NOT NULL,
        "target_id" uuid NOT NULL,
        "created_by" uuid NOT NULL REFERENCES "app_users"("id"),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_links_target_idx" ON "document_links" ("target_type", "target_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_links_unique" ON "document_links" ("document_id", "target_type", "target_id");
--> statement-breakpoint
-- Backfill: direct FK links already recorded before this stage become
-- polymorphic links so every view reads from one source of truth.
INSERT INTO "document_links" ("document_id", "target_type", "target_id", "created_by")
SELECT "document_id", 'certificate', "id", "created_by" FROM "certificates" WHERE "document_id" IS NOT NULL
ON CONFLICT ("document_id", "target_type", "target_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "document_links" ("document_id", "target_type", "target_id", "created_by")
SELECT "document_id", 'education_record', "id", "created_by" FROM "education_records" WHERE "document_id" IS NOT NULL
ON CONFLICT ("document_id", "target_type", "target_id") DO NOTHING;
