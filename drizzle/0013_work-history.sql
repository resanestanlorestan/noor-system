-- مرحله پنجم: سابقه شغلی فعالان (سوابق اشتغال به کار) با ثبت چندگانه،
-- مستقل از سوابق فعالیت قرآنی.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "activist_id" uuid NOT NULL REFERENCES "quranic_activists"("id"),
        "title" varchar(180) NOT NULL,
        "employer" varchar(180),
        "position" varchar(120),
        "start_date" date,
        "end_date" date,
        "description" text,
        "created_by" uuid NOT NULL REFERENCES "app_users"("id"),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_history_activist_idx" ON "work_history" ("activist_id");
