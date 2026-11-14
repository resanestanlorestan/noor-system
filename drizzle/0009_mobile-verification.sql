-- الحاقیه ۲.۵.۰ — تأیید شماره موبایل هنگام ثبت‌نام عمومی:
-- حساب تازه‌ساخت تا پیش از تأیید کد پیامکی غیرفعال می‌ماند (app_users.mobile_verified_at)
-- کدهای ۶ رقمی فقط به‌صورت هش در mobile_verification_codes نگهداری می‌شوند
-- و نشست صفحهٔ تأیید بدون ورود از طریق pending_mobile_verifications پیوند می‌خورد.
--> statement-breakpoint
alter table "app_users" add column "mobile_verified_at" timestamptz;
--> statement-breakpoint
create table "mobile_verification_codes" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null references "app_users" ("id") on delete cascade,
  "mobile" varchar(20) not null,
  "code_hash" varchar(64) not null,
  "attempts" integer default 0 not null,
  "expires_at" timestamptz not null,
  "used_at" timestamptz,
  "created_at" timestamptz default now() not null
);
--> statement-breakpoint
create index "mobile_verification_user_idx" on "mobile_verification_codes" ("user_id");
--> statement-breakpoint
create table "pending_mobile_verifications" (
  "token_hash" varchar(64) primary key not null,
  "user_id" uuid not null references "app_users" ("id") on delete cascade,
  "expires_at" timestamptz not null,
  "created_at" timestamptz default now() not null
);
