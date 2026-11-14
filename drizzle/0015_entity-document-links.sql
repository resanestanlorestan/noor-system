-- مرحله ششم: ارتباط چندشکلی اسناد با موجودیت‌ها. ستون document_id روی
-- education_records و certificates از قبل وجود دارد؛ این مایگریشن همان ستون
-- را به work_history می‌افزاید تا هر سابقه شغلی هم بتواند به یکی از مدارک
-- بارگذاری‌شدهٔ پرونده متصل شود. هر سند می‌تواند هم‌زمان به چند موجودیت
-- (سابقه تحصیلی، سابقه شغلی، گواهینامه) اشاره کند و پیوند از سمت موجودیت
-- نگه داشته می‌شود.
--> statement-breakpoint
ALTER TABLE "work_history" ADD COLUMN IF NOT EXISTS "document_id" uuid REFERENCES "activist_documents"("id");
