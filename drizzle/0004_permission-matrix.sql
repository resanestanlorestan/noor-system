-- Phase 4 (gap item 17): fine-grained permission matrix.
-- role_permissions: grants for the six built-in roles (presence = allowed).
-- custom_roles / custom_role_permissions: admin-defined roles; base_role only
-- drives data scoping, the grant list drives capabilities.
--> statement-breakpoint
create table if not exists "custom_roles" (
  "id" uuid primary key default gen_random_uuid() not null,
  "label" varchar(100) not null,
  "base_role" "app_role" not null default 'activist',
  "description" text,
  "created_by" uuid references "app_users"("id"),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists "custom_role_permissions" (
  "custom_role_id" uuid not null references "custom_roles"("id") on delete cascade,
  "permission_key" varchar(60) not null,
  primary key ("custom_role_id", "permission_key")
);
--> statement-breakpoint
create table if not exists "role_permissions" (
  "role_key" "app_role" not null,
  "permission_key" varchar(60) not null,
  primary key ("role_key", "permission_key")
);
--> statement-breakpoint
alter table "app_users" add column if not exists "custom_role_id" uuid references "custom_roles"("id") on delete set null;
--> statement-breakpoint
-- Seed defaults; must mirror roleDefaultPermissions in src/lib/permissions.ts.
insert into "role_permissions" ("role_key", "permission_key") values
  -- super_admin: full catalogue
  ('super_admin','cases.view_all'),('super_admin','cases.create'),('super_admin','cases.edit'),('super_admin','cases.submit'),
  ('super_admin','cases.review'),('super_admin','cases.decide'),('super_admin','cases.assign_expert'),('super_admin','cases.refer_specialist'),
  ('super_admin','cases.specialist_opinion'),('super_admin','cases.request_revision'),('super_admin','cases.appeal_submit'),
  ('super_admin','cases.appeal_manage'),('super_admin','cases.restore_version'),('super_admin','cases.claim'),('super_admin','cases.export'),
  ('super_admin','users.manage'),('super_admin','settings.geo'),('super_admin','settings.references'),
  ('super_admin','reports.view'),('super_admin','audit.view'),('super_admin','outbox.view'),('super_admin','permissions.manage'),
  -- province_admin
  ('province_admin','cases.view_all'),('province_admin','cases.create'),('province_admin','cases.edit'),('province_admin','cases.submit'),
  ('province_admin','cases.review'),('province_admin','cases.decide'),('province_admin','cases.assign_expert'),('province_admin','cases.refer_specialist'),
  ('province_admin','cases.request_revision'),('province_admin','cases.appeal_manage'),('province_admin','cases.restore_version'),
  ('province_admin','cases.export'),('province_admin','users.manage'),('province_admin','reports.view'),
  -- county_admin
  ('county_admin','cases.view_all'),('county_admin','cases.create'),('county_admin','cases.edit'),('county_admin','cases.submit'),
  ('county_admin','cases.review'),('county_admin','cases.decide'),('county_admin','cases.assign_expert'),('county_admin','cases.refer_specialist'),
  ('county_admin','cases.request_revision'),('county_admin','cases.appeal_manage'),('county_admin','cases.restore_version'),
  ('county_admin','cases.export'),('county_admin','reports.view'),
  -- reviewer
  ('reviewer','cases.view_all'),('reviewer','cases.create'),('reviewer','cases.edit'),('reviewer','cases.submit'),
  ('reviewer','cases.review'),('reviewer','cases.refer_specialist'),('reviewer','cases.restore_version'),
  -- specialist
  ('specialist','cases.view_all'),('specialist','cases.specialist_opinion'),
  -- activist
  ('activist','cases.create'),('activist','cases.edit'),('activist','cases.submit'),('activist','cases.request_revision'),
  ('activist','cases.appeal_submit'),('activist','cases.restore_version'),('activist','cases.claim')
on conflict do nothing;
