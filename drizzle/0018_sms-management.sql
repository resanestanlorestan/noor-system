-- الحاقیهٔ ۲.۱۰.۵ — پنل مدیریت پیامک‌ها در داشبورد مدیریت: متن‌ها و قالب‌ها
-- از دیتابیس خوانده می‌شوند (بدون تغییر کد)، تنظیمات پنل پیامکی با کلید
-- رمزنگاری‌شده ذخیره می‌شود، تاریخچهٔ پیامک‌ها دسته‌بندی و قابل فیلتر است.
--> statement-breakpoint
create table if not exists "sms_templates" (
  "key" varchar(60) primary key,
  "body" text not null,
  "enabled" boolean not null default true,
  "updated_by" uuid references "app_users"("id"),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists "sms_settings" (
  "id" varchar(20) primary key,
  "provider" varchar(20) not null default '',
  "username" varchar(120) not null default '',
  "secret_cipher" text,
  "sender" varchar(31) not null default '',
  "enabled" boolean not null default false,
  "updated_by" uuid references "app_users"("id"),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint
insert into "sms_settings" ("id") values ('default') on conflict do nothing;
--> statement-breakpoint
alter table "message_outbox" add column if not exists "category" varchar(30);
--> statement-breakpoint
alter table "message_outbox" add column if not exists "template_key" varchar(60);
--> statement-breakpoint
create index if not exists "message_outbox_channel_idx" on "message_outbox" ("channel", "created_at");
--> statement-breakpoint
insert into "role_permissions" ("role_key", "permission_key") values ('super_admin','sms.manage') on conflict do nothing;
