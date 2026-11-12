# پشتیبان‌گیری و بازیابی تولیدی — Release 2.4 (فاز ۴)

این مستندات چرخه کامل پشتیبان‌گیری پایگاه داده تولیدی سامانه نور را پوشش می‌دهد: اسکریپت‌ها، زمان‌بندی خودکار، بازیابی آزمون‌شده و کارت پایش داشبورد.

## ۱. چه چیزی پشتیبان گرفته می‌شود؟

| موضوع | ابزار | محل |
| --- | --- | --- |
| پایگاه داده PostgreSQL (کل اسکیما + داده) | `scripts/backup-production.sh` با `pg_dump --format=custom` | `backups/noor-YYYYMMDD-HHMMSS.dump` |
| صحت فایل پشتیبان | checksum SHA-256 در کنار هر فایل | `backups/noor-….dump.sha256` |
| مدارک خصوصی بارگذاری‌شده (`.private-app/uploads`) | بایگانی سیستم فایل سرور (tar/cp خارج از این اسکریپت) | طبق سیاست سازمان |

قالب custom دو مزیت دارد: فشرده‌شده است و `pg_restore` می‌تواند به‌صورت انتخابی (فقط جدول‌های مشخص) بازیابی کند.

## ۲. اجرای پشتیبان‌گیری

```bash
cd /path/to/noor-system
set -a && . ./.env && set +a     # بارگذاری DATABASE_URL
bash scripts/backup-production.sh
```

خروجی هر اجرا:

- یک فایل `noor-YYYYMMDD-HHMMSS.dump` + checksum آن در `backups/`
- فایل نشانگر `.private-app/last-backup` (JSON: زمان، مسیر، حجم، sha256، مدت اجرا) — مبنای کارت «آخرین پشتیبان موفق» داشبورد
- یک ردیف `production_backup` در جدول `audit_logs`
- نگهداری **۱۴ نسخه اخیر**؛ نسخه‌های قدیمی‌تر و checksum آن‌ها خودکار حذف می‌شوند (قابل تغییر با `BACKUP_KEEP`)

## ۳. زمان‌بندی خودکار (cPanel → Cron Jobs)

خط پیشنهادی برای اجرای روزانه ساعت ۰۳:۱۵:

```
15 3 * * * cd /home/USER/noor-system && set -a && . ./.env && set +a && bash scripts/backup-production.sh >> backups/cron.log 2>&1
```

روی VPS همین خط در `crontab -e` (کاربر مالک برنامه) قرار می‌گیرد. خروجی‌های هر اجرا در `backups/cron.log` قابل بازبینی است.

## ۴. بازیابی

### ۴.۱ بررسی صحت فایل (بدون تغییر دیتابیس)

```bash
bash scripts/restore-production.sh backups/noor-20261109-031500.dump --verify
# → VERIFY-OK — dump سالم است (… بخش داده جدولی).
```

قبل از هر بازیابی، checksum فایل کنترل می‌شود؛ عدم تطابق یعنی فایل خراب یا دستکاری‌شده و اسکریپت متوقف می‌شود.

### ۴.۲ بازیابی واقعی

```bash
set -a && . ./.env && set +a
bash scripts/restore-production.sh backups/noor-20261109-031500.dump
# تأیید با تایپ «بله» (یا RESTORE_CONFIRM=yes برای اتوماسیون)
```

بازیابی با `--clean --if-exists` انجام می‌شود؛ پس از پایان، سرویس Node (PM2: `pm2 restart noor`) را ری‌استارت کنید تا استخر اتصالات تازه شود.

### ۴.۳ بازیابی انتخابی جدول‌ها

```bash
pg_restore --list backups/noor-20261109-031500.dump | less          # فهرست محتوا
pg_restore --clean --if-exists --dbname="$DATABASE_URL" --table=applications backups/noor-….dump
```

## ۵. کارت «آخرین پشتیبان موفق» داشبورد

داشبورد مدیر کل یک کارت پایش دارد که فایل نشانگر را می‌خواند: زمان آخرین پشتیبان موفق، حجم فایل و مسیر آن. اگر نشانگر نباشد، کارت یادآورِ راه‌اندازی کرون نمایش می‌دهد. این کارت فقط برای مدیر کل دیده می‌شود و هیچ اطلاعات حساسی ندارد.

## ۶. تمرین بازیابی و ذخیره‌سازی خارج از سرور

- **تمرین ماهانه**: یک نسخه را روی محیط آزمون با `--verify` و سپس بازیابی واقعی روی دیتابیس آزمونی امتحان کنید؛ پشتیبانِ بازیابی‌نشده، پشتیبان نیست.
- **خارج از سرور**: حداقل هفته‌ای یک‌بار جدیدترین `.dump` را به محل دیگری (فضای ابری، سرور دیگر) منتقل کنید؛ نگهداری پشتیبان فقط روی همان سرور در برابر خرابی دیسک محافظت نمی‌کند.
- **رمزگذاری نسخه‌های خارج‌شده**: برای انتقال، از `age`/`gpg` استفاده کنید: `gpg -c backups/noor-….dump`.

## ۷. محیط‌های بدون کلاینت pg در PATH

اسکریپت‌ها و تست‌ها کلاینت‌ها را از متغیرهای محیطی هم می‌پذیرند:

```bash
PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump \
PG_RESTORE=/usr/lib/postgresql/17/bin/pg_restore \
PSQL=/usr/lib/postgresql/17/bin/psql \
bash scripts/backup-production.sh
```

همین سه override (`PG_DUMP`، `PG_RESTORE`، `PSQL`) برای اجرای `tests/backup.test.ts` با Vitest هم کار می‌کند؛ بدون کلاینت pg، آن مجموعه به‌صورت خودکار skip می‌شود:

```bash
PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump \
PG_RESTORE=/usr/lib/postgresql/17/bin/pg_restore \
PSQL=/usr/lib/postgresql/17/bin/psql \
npx vitest run tests/backup.test.ts
```

## ۸. چک‌لیست پس از راه‌اندازی تولید

- [ ] یک اجرای دستی `backup-production.sh` و دیدن کارت داشبورد
- [ ] ثبت خط cron و بازبینی `backups/cron.log` روز بعد
- [ ] یک `--verify` موفق و ثبت نتیجه در گزارش عملیاتی
- [ ] انتقال نسخه به محل دوم و آزمون بازگشایی checksum آنجا
