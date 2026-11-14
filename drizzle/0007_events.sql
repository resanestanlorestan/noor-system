-- Release 2.4 — فاز ۲: تقویم رویدادها و یادآور پیامکی پیش از رویداد.
-- 1) events — رویدادهای کشوری/استانی/شهرستانی با آستانه یادآور مستقل
-- 2) event_participants — دعوت فعالان به رویداد + وضعیت حضور + زمان یادآور
-- 3) role_permissions — مجوز events.manage (مطابق roleDefaultPermissions در
--    src/lib/permissions.ts؛ توسط tests/permissions.test.ts پین می‌شود).
--> statement-breakpoint
create table if not exists "events" (
  "id" uuid primary key default gen_random_uuid() not null,
  "title" varchar(160) not null,
  "description" text,
  "kind" varchar(20) not null default 'meeting',
  "starts_at" timestamptz not null,
  "ends_at" timestamptz,
  "location" varchar(160),
  "province_id" integer references "provinces"("id") on delete set null,
  "county_id" integer references "counties"("id") on delete set null,
  "capacity" integer,
  "reminder_hours" integer not null default 48,
  "created_by" uuid references "app_users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "events_starts_idx" on "events" ("starts_at");
--> statement-breakpoint
create index if not exists "events_geo_idx" on "events" ("province_id", "county_id");
--> statement-breakpoint
create table if not exists "event_participants" (
  "id" uuid primary key default gen_random_uuid() not null,
  "event_id" uuid not null references "events"("id") on delete cascade,
  "activist_id" uuid not null references "quranic_activists"("id") on delete cascade,
  "status" varchar(12) not null default 'invited',
  "reminded_at" timestamptz,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create unique index if not exists "event_participants_event_activist_unique" on "event_participants" ("event_id", "activist_id");
--> statement-breakpoint
create index if not exists "event_participants_event_idx" on "event_participants" ("event_id");
--> statement-breakpoint
create index if not exists "event_participants_activist_idx" on "event_participants" ("activist_id");
--> statement-breakpoint
-- New capability grants; must match roleDefaultPermissions (pinned by tests/permissions.test.ts).
insert into "role_permissions" ("role_key", "permission_key") values
  ('super_admin','events.manage'),('province_admin','events.manage'),('county_admin','events.manage')
on conflict do nothing;
