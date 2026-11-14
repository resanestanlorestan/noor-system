-- مرحله دوم اصلاحات: ورود با شماره موبایل، ایمیل اختیاری، تفکیک نام و نام خانوادگی،
-- و جدول کد بازیابی گذرواژه با پیامک.
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "first_name" varchar(80);
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "last_name" varchar(100);
--> statement-breakpoint
-- Backfill: splitting legacy full_name on the first space. Single-word names
-- keep last_name NULL; app code always recomposes full_name on save.
UPDATE "app_users" SET
  "first_name" = btrim(substring("full_name" FROM 1 FOR GREATEST(position(' ' IN "full_name") - 1, 0))),
  "last_name" = CASE WHEN position(' ' IN "full_name") > 0
    THEN btrim(substring("full_name" FROM position(' ' IN "full_name") + 1))
    ELSE NULL END;
--> statement-breakpoint
UPDATE "app_users" SET "first_name" = "full_name" WHERE "first_name" IS NULL OR "first_name" = '';
--> statement-breakpoint
-- Email becomes optional: login works with the mobile number, email stays as
-- an alternative identifier. UNIQUE still holds (Postgres allows many NULLs).
ALTER TABLE "app_users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_users_phone_unique" ON "app_users" ("phone") WHERE "phone" IS NOT NULL;
--> statement-breakpoint
-- Mobile (SMS OTP) password reset: same shape as mobile_verification_codes.
-- Only the SHA-256 digest of the 6-digit code is stored; attempts are capped.
CREATE TABLE IF NOT EXISTS "mobile_reset_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
	"mobile" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mobile_reset_user_idx" ON "mobile_reset_codes" ("user_id");
