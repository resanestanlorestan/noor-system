-- الحاقیهٔ ۲.۱۲.۰ — ثبت‌نام یک‌مرحله‌ای، تحصیلات/حافظ/همکاری درون‌بخشی و
-- رفع باگ «کد ملی تکراری پس از حذف پرونده».
-- ستون‌های جدید رکورد فعال: مقطع دانشگاهی و حوزوی به‌همراه مدرک هر بخش،
-- نوع مدرک حافظ و گواهی آن؛ و حذف نرم هم‌گام با applications.deleted_at.
--> statement-breakpoint
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "university_level" varchar(60);
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "university_document_id" uuid;
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "seminary_level" varchar(60);
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "seminary_document_id" uuid;
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "memorization_cert_type" varchar(20);
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "memorization_document_id" uuid;
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "quranic_activists" ADD COLUMN IF NOT EXISTS "deleted_by" uuid REFERENCES "app_users"("id");
--> statement-breakpoint
-- گواهی تخصص: فایل بارگذاری‌شده برای هر تخصص
ALTER TABLE "activist_specialty_details" ADD COLUMN IF NOT EXISTS "cert_document_id" uuid;
--> statement-breakpoint
-- کشویی وابستهٔ رشته برای سوابق فعالیت (تدریس/داوری)
ALTER TABLE "activity_records" ADD COLUMN IF NOT EXISTS "field" varchar(40);
--> statement-breakpoint
-- رشتهٔ دوره + گواهی بارگذاری‌شدهٔ همان دوره
ALTER TABLE "educational_courses" ADD COLUMN IF NOT EXISTS "field" varchar(40);
ALTER TABLE "educational_courses" ADD COLUMN IF NOT EXISTS "document_id" uuid REFERENCES "activist_documents"("id");
--> statement-breakpoint
-- نوع همکاری در سوابق همکاری و شغلی
ALTER TABLE "work_history" ADD COLUMN IF NOT EXISTS "cooperation_type" varchar(40);
--> statement-breakpoint
-- رفع باگ کد ملی تکراری: قید UNIQUE ساده به ایندکس یکتای جزئی «فقط ردیف‌های
-- فعال (بدون حذف) با کد ملی ثبت‌شده» تبدیل می‌شود؛ پس از حذف نرم، ثبت‌نام
-- مجدد با همان کد ملی آزاد است و برای پرونده‌های فعال همچنان یکتا باقی می‌ماند.
ALTER TABLE "quranic_activists" DROP CONSTRAINT IF EXISTS "quranic_activists_national_id_hash_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "activists_national_id_active_unique" ON "quranic_activists" ("national_id_hash") WHERE "deleted_at" IS NULL AND "national_id_hash" IS NOT NULL;
