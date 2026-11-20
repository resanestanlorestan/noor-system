-- الحاقیهٔ ۲.۱۸.۷ — خروج خودکار در صورت عدم فعالیت (Idle Session Timeout):
-- ستون «آخرین فعالیت نشست» روی جدول نشست‌ها؛ در هر درخواست احراز هویت‌شده
-- تازه می‌شود و نشست‌هایی که از سقف مجاز (پیش‌فرض ۱۵ دقیقه) بی‌فعال مانده‌اند
-- در سمت سرور باطل می‌شوند — خروج خودکار فقط به تایمر مرورگر وابسته نیست.
-- مقدار پیش‌فرض now() یعنی نشست‌های موجود هنگام استقرار با فرجهٔ تازه شروع
-- می‌شوند و هیچ‌کس در میانهٔ استقرار بی‌دلیل بیرون انداخته نمی‌شود.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON user_sessions (last_seen_at);
