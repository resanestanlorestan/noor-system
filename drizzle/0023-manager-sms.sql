-- الحاقیهٔ ۲.۱۶.۰ — مدیریت اطلاع‌رسانی پیامکی مدیران
-- دریافت‌کنندگان پیامک (همگام‌شونده از سامانهٔ کاربران + ردیف دستی)،
-- رویدادهای ارسال با کلید ضدتکرار (نوع رویداد + پرونده + گیرنده) و
-- کلید خاموش/روشن ارسال خودکار هنگام ثبت پرونده.

CREATE TABLE IF NOT EXISTS manager_sms_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  full_name varchar(120) NOT NULL,
  position varchar(120) NOT NULL DEFAULT '',
  phone varchar(20) NOT NULL UNIQUE,
  sms_enabled boolean NOT NULL DEFAULT true,
  source varchar(10) NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_sms_recipients_source_idx ON manager_sms_recipients (source_user_id);

CREATE TABLE IF NOT EXISTS manager_sms_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(40) NOT NULL DEFAULT 'case_created',
  entity_id uuid,
  recipient_id uuid NOT NULL REFERENCES manager_sms_recipients(id) ON DELETE CASCADE,
  phone varchar(20) NOT NULL,
  message text NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'queued',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  outbox_id uuid,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
-- ضدتکرار: برای هر رویداد و هر پرونده، فقط یک پیامک به هر گیرنده
CREATE UNIQUE INDEX IF NOT EXISTS manager_sms_events_dedupe_idx
  ON manager_sms_events (event_type, entity_id, recipient_id);

CREATE TABLE IF NOT EXISTS manager_sms_settings (
  id varchar(20) PRIMARY KEY,
  auto_case_created boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO manager_sms_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
