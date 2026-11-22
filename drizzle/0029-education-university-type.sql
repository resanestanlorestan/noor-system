-- الحاقیهٔ ۲.۱۹.۴ — فیلد «نوع دانشگاه» برای تحصیلات دانشگاهی (کاردانی تا دکترا)
-- ستون‌های رشته (field) و نام مرکز (center_name) از قبل موجودند؛ این مایگریشن
-- فقط نوع دانشگاه را (یکی از هشت گزینهٔ ثابت یا خالی) اضافه می‌کند. Idempotent.
ALTER TABLE "education_records" ADD COLUMN IF NOT EXISTS "university_type" varchar(60);
