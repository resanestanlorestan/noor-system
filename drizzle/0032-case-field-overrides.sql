-- الحاقیهٔ ۲.۲۶.۰ — ویرایش کامل فیلدهای ثابت مراحل ثبت پرونده
-- جدول override فیلدهای ثابت: هر ردیف = یک فیلد ثابت از کاتالوگ (کلید پایدار
-- step_code + field_key) با عنوان/راهنمای جایگزین، برداشتن یا افزودن الزام و
-- مخفی‌سازی. کلیدها در src/lib/case-field-catalog.ts تعریف شده‌اند و هرگز تغییر
-- نمی‌کنند؛ ستون‌های دادهٔ پرونده دست‌نخورده می‌مانند و فقط نمایش و
-- اعتبارسنجیِ ثبت‌های تازه از این لایه پیروی می‌کند. ردیف‌های غایب = رفتار
-- پیش‌فرض کاتالوگ. همهٔ دستورات Idempotent.
-- بازگشت (DOWN): DROP TABLE case_field_overrides;

CREATE TABLE IF NOT EXISTS "case_field_overrides" (
  "id" serial PRIMARY KEY,
  "step_code" varchar(40) NOT NULL,
  "field_key" varchar(100) NOT NULL,
  "label" varchar(200),
  "help" varchar(500),
  "required_override" boolean,
  "hidden" boolean NOT NULL DEFAULT false,
  "updated_by" uuid REFERENCES "app_users"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "case_field_overrides_unique" ON "case_field_overrides" ("step_code", "field_key");
CREATE INDEX IF NOT EXISTS "case_field_overrides_step_idx" ON "case_field_overrides" ("step_code");
