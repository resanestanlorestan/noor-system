-- الحاقیهٔ ۲.۱۶.۱ — رفع اشکال «حذف مدیر همگام‌شده بی‌اثر بود»: پرچم کنارگذاشتن؛
-- حذف ردیف همگام‌شده یعنی excluded=true تا همگام‌سازی آن را دوباره نسازد و
-- پیامکی هم نگیرد؛ با «بازگردانی» قابل بازگشت به فهرست است.
ALTER TABLE manager_sms_recipients ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
