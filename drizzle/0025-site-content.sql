-- الحاقیهٔ ۲.۱۸.۴ — مدیریت محتوای سایت (CMS): متن‌های سایت داینامیک از دیتابیس
-- site_content = مقدار جاری هر کلید محتوا؛ site_content_revisions = تاریخچهٔ
-- نسخه‌های پیشین برای بازگردانی. تا پیش از نخستین ویرایش، جدول خالی است و
-- مقادیر پیش‌فرضِ ثبت‌شده در رجیستری کد (src/lib/site-content.ts) سرو می‌شوند.
CREATE TABLE IF NOT EXISTS site_content (
  key varchar(120) PRIMARY KEY,
  page varchar(60) NOT NULL,
  section varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS site_content_revisions (
  id serial PRIMARY KEY,
  key varchar(120) NOT NULL REFERENCES site_content(key) ON DELETE CASCADE,
  value text NOT NULL,
  changed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_content_revisions_key_idx ON site_content_revisions (key, changed_at DESC);
-- مجوز جدید فقط برای مدیر ارشد (ماتریس مجوزها مرجع اجراست؛ سایر نقش‌ها از
-- صفحهٔ «نقش‌ها و مجوزها» قابل تخصیص‌اند).
INSERT INTO role_permissions (role_key, permission_key) VALUES ('super_admin','cms.manage') ON CONFLICT DO NOTHING;
