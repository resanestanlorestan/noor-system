-- Release 2.1: overdue-case SMS reminders (یادآور پیامکی پرونده‌های معوق).
-- 1) app_users.phone — optional mobile number for staff SMS reminders.
-- 2) case_reminders — per-send ledger driving the cooldown + audit history.
-- 3) role_permissions — grants for the new reminders.send capability
--    (mirrors roleDefaultPermissions in src/lib/permissions.ts).
--> statement-breakpoint
alter table "app_users" add column if not exists "phone" varchar(20);
--> statement-breakpoint
create table if not exists "case_reminders" (
  "id" uuid primary key default gen_random_uuid() not null,
  "application_id" uuid not null references "applications"("id") on delete cascade,
  "recipient_id" uuid not null references "app_users"("id") on delete cascade,
  "recipient_phone" varchar(20),
  "message" text not null,
  "sent_by" uuid references "app_users"("id") on delete set null,
  "automated" boolean not null default false,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "case_reminders_application_idx" on "case_reminders" ("application_id", "created_at");
--> statement-breakpoint
create index if not exists "case_reminders_recipient_idx" on "case_reminders" ("recipient_id", "created_at");
--> statement-breakpoint
-- New capability grants; must match roleDefaultPermissions (pinned by tests/permissions.test.ts).
insert into "role_permissions" ("role_key", "permission_key") values
  ('super_admin','reminders.send'),('province_admin','reminders.send'),('county_admin','reminders.send')
on conflict do nothing;
