-- الحاقیهٔ ۲.۱۸.۵ — مدیریت لوگوی سایت: بایت‌های فایل لوگو در دیتابیس نگه داشته
-- می‌شود (نه فایل‌سیستم) تا با مسیر عمومی /api/site/logo سرو و با هر استقرار
-- بدون گام اضافه منتقل شود؛ ردیف همیشه یکی است (گارد CHECK id=1). تا پیش از
-- نخستین آپلود، فیلدهای لوگو خالی‌اند و همه‌جا آیکن پیش‌فرض برنامه دیده می‌شود.
CREATE TABLE IF NOT EXISTS site_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_data bytea,
  logo_mime varchar(60),
  logo_name varchar(180),
  logo_width integer,
  logo_height integer,
  logo_size integer,
  logo_updated_at timestamptz,
  logo_updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL
);
INSERT INTO site_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
