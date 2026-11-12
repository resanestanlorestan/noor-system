-- مرحله چهارم اصلاحات: تخصص‌های قرآنی چندگانه با جزئیات ساختاریافته.
-- جزئیات هر تخصص (میزان حفظ، سطح قرائت، چک‌لیست‌ها) و آثار مؤلف (کتاب/مقاله).
-- کاملاً افزودنی: هیچ داده‌ای حذف یا تغییر نمی‌شود.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activist_specialty_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL REFERENCES "quranic_activists"("id") ON DELETE CASCADE,
	"specialty_id" integer NOT NULL REFERENCES "quranic_specialties"("id"),
	"detail_value" varchar(40),
	"detail_options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activist_specialty_details_unique" ON "activist_specialty_details" ("activist_id","specialty_id");
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "writing_type" AS ENUM ('book', 'article');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activist_writings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activist_id" uuid NOT NULL REFERENCES "quranic_activists"("id") ON DELETE CASCADE,
	"work_type" "writing_type" DEFAULT 'book' NOT NULL,
	"title" varchar(180) NOT NULL,
	"topic" varchar(180),
	"created_by" uuid NOT NULL REFERENCES "app_users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activist_writings_activist_idx" ON "activist_writings" ("activist_id");
--> statement-breakpoint
-- همگام‌سازی عناوین مرجع تخصص‌ها (کدها ثابت می‌مانند؛ فقط برچسب نمایشی):
UPDATE "quranic_specialties" SET "title" = 'مفسر و تدبّرگر قرآن' WHERE "code" = 'commentator';
UPDATE "quranic_specialties" SET "title" = 'فعال قرآنی' WHERE "code" = 'cultural_activist';
UPDATE "quranic_specialties" SET "title" = 'معلم قرآن' WHERE "code" = 'trainer';
UPDATE "quranic_specialties" SET "title" = 'داور و ممتحن قرآنی' WHERE "code" = 'judge';
