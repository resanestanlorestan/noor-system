-- الحاقیهٔ ۲.۲۳.۰ — مدیریت تخصص‌های قرآنی و فرم‌ساز پویا
-- (۱) ستون‌های مدیریت تخصص: فعال/غیرفعال، توضیح راهنما، ترتیب نمایش؛
-- (۲) جداول فرم‌ساز عمومی: تعریف فرم (پیش‌نویس + نسخهٔ منتشرشده)،
-- تاریخچهٔ نسخه‌های منتشرشده برای سازگاری پاسخ‌های قدیمی، و پاسخ‌های
-- ساختاریافتهٔ هر پرونده با ارجاع به نسخهٔ فرم. همهٔ دستورات Idempotent.
-- بازگشت (DOWN): DROP TABLE form_answers, form_definition_versions, form_definitions;
--               ALTER TABLE quranic_specialties DROP COLUMN active, description, sort_order;

ALTER TABLE "quranic_specialties" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "quranic_specialties" ADD COLUMN IF NOT EXISTS "description" varchar(500);
ALTER TABLE "quranic_specialties" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
-- ترتیب اولیهٔ پایدار = ترتیب شناسهٔ موجود (فقط بار اول که همه صفرند)
UPDATE "quranic_specialties" SET "sort_order" = "id" WHERE "sort_order" = 0;

-- مجوز فرم‌ساز برای نقش‌های مدیریتی؛ Idempotent (برای ماتریس موجود در DB)
INSERT INTO "role_permissions" ("role_key", "permission_key")
  SELECT r.role_key, 'forms.manage' FROM (VALUES ('super_admin'::"app_role"), ('province_admin'::"app_role")) AS r(role_key)
  WHERE NOT EXISTS (SELECT 1 FROM "role_permissions" p WHERE p.role_key = r.role_key AND p.permission_key = 'forms.manage');

CREATE TABLE IF NOT EXISTS "form_definitions" (
  "id" serial PRIMARY KEY,
  "entity_type" varchar(30) NOT NULL DEFAULT 'specialty',
  "entity_id" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 0,
  "draft_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "published_config" jsonb,
  "updated_by" uuid REFERENCES "app_users"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "form_definitions_entity_uq" ON "form_definitions" ("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "form_definition_versions" (
  "id" serial PRIMARY KEY,
  "definition_id" integer NOT NULL REFERENCES "form_definitions"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "config" jsonb NOT NULL,
  "published_by" uuid REFERENCES "app_users"("id"),
  "published_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "form_versions_uq" ON "form_definition_versions" ("definition_id", "version");

CREATE TABLE IF NOT EXISTS "form_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "definition_id" integer NOT NULL REFERENCES "form_definitions"("id"),
  "version" integer NOT NULL,
  "application_id" uuid NOT NULL REFERENCES "applications"("id"),
  "activist_id" uuid REFERENCES "quranic_activists"("id"),
  "specialty_id" integer REFERENCES "quranic_specialties"("id"),
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "form_answers_case_uq" ON "form_answers" ("application_id", "definition_id");
CREATE INDEX IF NOT EXISTS "form_answers_definition_idx" ON "form_answers" ("definition_id");
CREATE INDEX IF NOT EXISTS "form_answers_specialty_idx" ON "form_answers" ("specialty_id");
