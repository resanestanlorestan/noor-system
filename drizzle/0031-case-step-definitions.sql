-- الحاقیهٔ ۲.۲۵.۰ — مدیریت پویای مراحل ثبت پرونده
-- جدول تعریف مراحل: مراحل پایهٔ سامانه با همین مایگریشن seed می‌شوند تا از
-- روز نخست همهٔ مراحل فعلی در بخش مدیریت دیده و قابل مدیریت باشند؛ مراحل
-- سفارشی مدیر بعداً از UI افزوده می‌شوند. فیلدهای سفارشی هر مرحله در
-- form_definitions با entity_type='case_step' نگهداری می‌شود (زیرساخت ۲.۲۳.۰).
-- همهٔ دستورات Idempotent.
-- بازگشت (DOWN): DROP TABLE case_step_definitions;

CREATE TABLE IF NOT EXISTS "case_step_definitions" (
  "id" serial PRIMARY KEY,
  "code" varchar(40) NOT NULL UNIQUE,
  "title" varchar(120) NOT NULL,
  "description" varchar(500),
  "kind" varchar(10) NOT NULL DEFAULT 'custom',
  "required" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "updated_by" uuid REFERENCES "app_users"("id"),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "case_step_defs_order_idx" ON "case_step_definitions" ("sort_order", "id");

-- مراحل پایهٔ سامانه با عنوان‌های دقیق فعلی (۲.۱۰.۰)؛ ترتیب با فاصلهٔ ۱۰ تا
-- تا درج مرحلهٔ سفارشی بین مراحل بدون جابه‌جایی دستی ممکن باشد.
INSERT INTO "case_step_definitions" ("id", "code", "title", "description", "kind", "required", "active", "sort_order")
SELECT v.id, v.code, v.title, v.description, 'system', true, true, v.sort_order
FROM (VALUES
  (1, 'identity',   'اطلاعات هویتی و تماس',        'مشخصات فردی، شناسنامه‌ای و شماره‌های تماس', 10),
  (2, 'location',   'سکونت و محل فعالیت',          'استان و شهرستان سکونت و فعالیت قرآنی', 20),
  (3, 'specialties','تخصص‌ها، تحصیلات و سوابق',    'حداقل یک تخصص با جزئیات کامل؛ تحصیلات و سوابق اختیاری', 30),
  (4, 'documents',  'مدارک و تصویر پرسنلی',        'حداقل یک مدرک پشتیبان و تصویر پرسنلی معتبر', 40),
  (5, 'review',     'بازبینی و ارسال',             'بازبینی نهایی، کنترل آمادگی و ارسال برای بررسی', 50)
) AS v(id, code, title, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "case_step_definitions" d WHERE d.code = v.code);

-- ادامهٔ دنبالهٔ serial پس از درج شناسه‌های ثابت مراحل پایه (Idempotent)
SELECT setval(pg_get_serial_sequence('case_step_definitions', 'id'),
  GREATEST((SELECT max("id") FROM "case_step_definitions"), 1));
