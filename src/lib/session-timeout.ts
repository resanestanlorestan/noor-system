// الحاقیهٔ ۲.۱۸.۷ — خروج خودکار در صورت عدم فعالیت (Idle Session Timeout)
//
// سقف واحد بی‌فعالیتی که هم سمت سرور (بطلان نشست در getCurrentUser/pingSession)
// و هم سمت مرورگر (کامپوننت IdleTimeout) از همین‌جا می‌خوانند تا هرگز از هم
// جلو نزنند. برای قابل‌تنظیم‌شدن از داشبورد در آینده، کافی است همین مقادیر از
// getSiteSettings()/site_content خوانده شوند و به‌صورت prop به IdleTimeout و
// توابع نشست پاس شوند — ساختار از همین نسخه آمادهٔ آن است (مقدار پیش‌فرض اینجا،
// بدون مایگریشن؛ زیرا هنوز ستونی در تنظیمات برای آن تعریف نشده است).
export const IDLE_TIMEOUT_MINUTES = 15;
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
/** هشدار پیش از خروج خودکار: این فاصله تا پایان سقف، مودال «ادامه فعالیت» باز می‌شود. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;

/** آیا نشستی که آخرین فعالیتش lastSeenAt بوده، اکنون از سقف بی‌فعالیتی گذشته است؟ */
export function isSessionIdle(lastSeenAt: Date, now: Date = new Date(), timeoutMs: number = IDLE_TIMEOUT_MS): boolean {
  return now.getTime() - lastSeenAt.getTime() >= timeoutMs;
}
