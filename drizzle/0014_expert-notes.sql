-- مرحله هفتم: یادداشت‌های کارشناسی روی پرونده + مجوز ثبت آن.
-- یادداشت‌های داخلی تیم بررسی؛ فعالِ صاحب پرونده این رکوردها را نمی‌بیند.
--> statement-breakpoint
create table if not exists "expert_notes" (
        "id" uuid primary key default gen_random_uuid() not null,
        "application_id" uuid not null references "applications"("id"),
        "author_id" uuid not null references "app_users"("id"),
        "content" text not null,
        "created_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create index if not exists "expert_notes_application_idx" on "expert_notes" ("application_id");
--> statement-breakpoint
create index if not exists "expert_notes_author_idx" on "expert_notes" ("author_id");
--> statement-breakpoint
-- Seed the new capability for the review staff; mirrors roleDefaultPermissions
-- in src/lib/permissions.ts (super_admin receives the full catalogue).
insert into "role_permissions" ("role_key", "permission_key") values
  ('super_admin','cases.expert_notes'),
  ('province_admin','cases.expert_notes'),
  ('county_admin','cases.expert_notes'),
  ('reviewer','cases.expert_notes')
on conflict do nothing;
