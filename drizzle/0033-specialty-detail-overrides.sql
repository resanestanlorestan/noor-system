-- الحاقیهٔ ۲.۲۸.۰ — پویاسازی کامل فیلدهای جزئیات تخصص‌های قرآنی
-- جدول override فیلد جزئیات هر تخصص: هر ردیف = یک کد تخصص (کلید پایدار) با
-- نوع فیلد، عنوان، راهنما، سقف انتخاب و فهرست کامل گزینه‌ها [{key,label,hidden}].
-- کلیدهای گزینه هرگز تغییر نمی‌کنند (الگوی ۲.۱۲.۰) و فقط برچسب/نوع/ترتیب
-- از این لایه خوانده می‌شود؛ بدون ردیف، پیش‌فرض ثابت کد
-- (specialtyDetailSpec در src/lib/constants.ts) برقرار است — حتی تخصص‌های
-- افزوده‌شده از پنل (کد sp…) هم از این پس می‌توانند فیلد جزئیات داشته باشند.
-- همهٔ دستورات Idempotent.
-- بازگشت (DOWN): DROP TABLE specialty_detail_overrides;

CREATE TABLE IF NOT EXISTS "specialty_detail_overrides" (
  "id" serial PRIMARY KEY,
  "code" varchar(40) NOT NULL,
  "kind" varchar(20) NOT NULL DEFAULT 'none',
  "label" varchar(200),
  "hint" varchar(500),
  "max_options" integer,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_by" uuid REFERENCES "app_users"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "specialty_detail_overrides_code_uq" ON "specialty_detail_overrides" ("code");
