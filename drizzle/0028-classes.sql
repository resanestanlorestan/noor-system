-- الحاقیهٔ ۲.۱۹.۰ — سیستم مدیریت کلاس‌ها و دوره‌های آموزشی با ثبت‌نام هوشمند:
-- کلاس‌های تک‌جلسه‌ای/چندجلسه‌ای با هدف‌گیری چند گروه تخصصی و چند شهرستان از
-- میان داده‌های موجود سامانه (بدون تعریف دوباره)، شناسایی جامعهٔ هدف از پروندهٔ
-- تکمیل‌شدهٔ فعالان، پیامک دعوت/یادآور/تغییر/لغو با جلوگیری از تکرار در سطح
-- دیتابیس (الگوی manager_sms_events)، ثبت‌نام کنترل‌شده با ظرفیت، لیست انتظار
-- با دعوت خودکار و مهلت پاسخ، حضور و غیاب به تفکیک جلسه با سوابق تغییر.
--> statement-breakpoint
create table if not exists "classes" (
  "id" uuid primary key default gen_random_uuid(),
  "title" varchar(160) not null,
  "topic" varchar(200) not null,
  "description" text,
  "syllabus" text,
  "status" varchar(12) not null default 'draft',
  "format_type" varchar(10) not null default 'in_person',
  "capacity" integer not null default 20,
  "starts_on" date not null,
  "start_time" varchar(5) not null default '08:00',
  "end_time" varchar(5) not null default '10:00',
  "location" varchar(180),
  "address" text,
  "teacher_name" varchar(120) not null,
  "teacher_phone" varchar(20),
  "teacher_user_id" uuid references "app_users"("id") on delete set null,
  "registration_deadline" timestamptz,
  "poster_data" bytea,
  "poster_mime" varchar(60),
  "poster_name" varchar(180),
  "poster_size" integer,
  "reminder_hours" integer not null default 48,
  "waitlist_respond_hours" integer not null default 24,
  "created_by" uuid references "app_users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "classes_status_idx" on "classes" ("status");
--> statement-breakpoint
create index if not exists "classes_starts_idx" on "classes" ("starts_on");
--> statement-breakpoint
create table if not exists "classes_counties" (
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "county_id" integer not null references "counties"("id") on delete cascade,
  primary key ("class_id", "county_id")
);
--> statement-breakpoint
create table if not exists "classes_specialties" (
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "specialty_id" integer not null references "quranic_specialties"("id") on delete cascade,
  primary key ("class_id", "specialty_id")
);
--> statement-breakpoint
create table if not exists "class_sessions" (
  "id" uuid primary key default gen_random_uuid(),
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "session_no" integer not null,
  "starts_on" date not null,
  "start_time" varchar(5) not null default '08:00',
  "end_time" varchar(5) not null default '10:00',
  "location" varchar(180),
  "teacher_name" varchar(120),
  "notes" text,
  unique ("class_id", "session_no")
);
--> statement-breakpoint
create table if not exists "class_registrations" (
  "id" uuid primary key default gen_random_uuid(),
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "user_id" uuid not null references "app_users"("id") on delete cascade,
  "status" varchar(12) not null default 'registered',
  "source" varchar(10) not null default 'self',
  "approved_by" uuid references "app_users"("id") on delete set null,
  "approved_at" timestamptz,
  "decision_note" text,
  "cancel_reason" text,
  "registered_at" timestamptz not null default now(),
  "cancelled_at" timestamptz,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "class_registrations_class_idx" on "class_registrations" ("class_id");
--> statement-breakpoint
create index if not exists "class_registrations_user_idx" on "class_registrations" ("user_id");
--> statement-breakpoint
-- جلوگیری از ثبت‌نام تکراری یک فرد در یک کلاس (فقط ردیف فعال)؛ پس از انصراف،
-- ثبت‌نام دوباره مجاز است.
create unique index if not exists "class_registrations_active_unique" on "class_registrations" ("class_id", "user_id") where "status" = 'registered';
--> statement-breakpoint
create table if not exists "class_waitlist" (
  "id" uuid primary key default gen_random_uuid(),
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "user_id" uuid not null references "app_users"("id") on delete cascade,
  "status" varchar(14) not null default 'waiting',
  "position" integer not null,
  "invited_at" timestamptz,
  "respond_deadline" timestamptz,
  "responded_at" timestamptz,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "class_waitlist_class_idx" on "class_waitlist" ("class_id", "position");
--> statement-breakpoint
-- هر فرد در هر لحظه فقط یک ردیف فعال در لیست انتظار هر کلاس دارد.
create unique index if not exists "class_waitlist_active_unique" on "class_waitlist" ("class_id", "user_id") where "status" in ('waiting', 'invited');
--> statement-breakpoint
create table if not exists "class_attendance" (
  "id" uuid primary key default gen_random_uuid(),
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "session_id" uuid not null references "class_sessions"("id") on delete cascade,
  "user_id" uuid not null references "app_users"("id") on delete cascade,
  "status" varchar(12) not null default 'absent',
  "notes" text,
  "recorded_by" uuid references "app_users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  unique ("session_id", "user_id")
);
--> statement-breakpoint
create table if not exists "class_attendance_logs" (
  "id" uuid primary key default gen_random_uuid(),
  "attendance_id" uuid not null references "class_attendance"("id") on delete cascade,
  "old_status" varchar(12),
  "new_status" varchar(12) not null,
  "note" text,
  "changed_by" uuid references "app_users"("id") on delete set null,
  "changed_at" timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists "class_sms_log" (
  "id" uuid primary key default gen_random_uuid(),
  "class_id" uuid not null references "classes"("id") on delete cascade,
  "user_id" uuid references "app_users"("id") on delete set null,
  "kind" varchar(20) not null,
  "phone" varchar(20) not null,
  "message" text not null,
  "status" varchar(10) not null default 'queued',
  "error" text,
  "outbox_id" uuid,
  "created_by" uuid references "app_users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "sent_at" timestamptz
);
--> statement-breakpoint
create index if not exists "class_sms_log_class_idx" on "class_sms_log" ("class_id", "kind");
--> statement-breakpoint
-- دعوت و یادآور فعال‌سازی برای هر (کلاس، فرد) فقط یک‌بار؛ دعوت لیست انتظار
-- خارج از قید یکتاست چون پس از «عدم پاسخ» ممکن است همان فرد دوباره دعوت شود —
-- ایدمپوتنس آن با خودِ گذار وضعیت waiting→invited تضمین می‌شود.
create unique index if not exists "class_sms_log_dedupe_idx" on "class_sms_log" ("class_id", "user_id", "kind") where "kind" in ('invite', 'reminder');
--> statement-breakpoint
insert into "role_permissions" ("role_key", "permission_key") values
  ('super_admin','classes.manage'), ('province_admin','classes.manage'), ('county_admin','classes.manage'),
  ('super_admin','classes.teach')
  on conflict do nothing;
