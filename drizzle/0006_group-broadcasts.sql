-- Release 2.2: group broadcast messaging (اطلاع‌رسانی گروهی به فعالان).
-- 1) message_broadcasts — ledger of manual mass messages: what was sent,
--    to which audience (stored filters + human-readable label) and the
--    delivery counts (SMS / in-app notification / skipped).
-- 2) role_permissions — grants for the new messages.broadcast capability
--    (mirrors roleDefaultPermissions in src/lib/permissions.ts).
--> statement-breakpoint
create table if not exists "message_broadcasts" (
  "id" uuid primary key default gen_random_uuid() not null,
  "subject" varchar(160) not null,
  "body" text not null,
  "audience" jsonb not null,
  "audience_label" text not null,
  "recipient_count" integer not null default 0,
  "sms_count" integer not null default 0,
  "notification_count" integer not null default 0,
  "without_phone_count" integer not null default 0,
  "sent_by" uuid references "app_users"("id") on delete set null,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "message_broadcasts_created_idx" on "message_broadcasts" ("created_at");
--> statement-breakpoint
-- New capability grants; must match roleDefaultPermissions (pinned by tests/permissions.test.ts).
insert into "role_permissions" ("role_key", "permission_key") values
  ('super_admin','messages.broadcast'),('province_admin','messages.broadcast'),('county_admin','messages.broadcast')
on conflict do nothing;
