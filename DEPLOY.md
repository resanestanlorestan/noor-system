# راهنمای استقرار روی هاست (DEPLOY)

این سند دقیقاً مخصوص همین پروژه نوشته شده است. سامانه «نور» یک اپلیکیشن **Next.js 16 + PostgreSQL** است، نه PHP؛ پس روی هاست‌های اشتراکی صرفاً PHP اجرا نمی‌شود و یکی از سه مسیر زیر را باید انتخاب کنید:

| مسیر | مناسب برای | دشواری | توضیح |
|---|---|---|---|
| **الف) سرور مجازی (VPS)** | استقرار واقعی و پروداکشن | متوسط | کنترل کامل، PostgreSQL داخلی، ارزان‌ترین گزینه پایدار — **پیشنهاد ما** |
| **ب) هاست اشتراکی cPanel با Node.js** | وقتی فقط هاست اشتراکی دارید | متوسط رو به بالا | نیاز به Node.js App Selector + دیتابیس PostgreSQL (معمولاً باید خارجی بگیرید) |
| **ج) پلتفرم ابری** | شروع سریع بدون مدیریت سرور | آسان | لیارا/آروان داخل ایران؛ Vercel + Neon خارج از ایران |

---

## متغیرهای محیطی این پروژه (مشترک بین همهٔ مسیرها)

فایل `.env` را کنار پروژه بسازید (برگرفته از `.env.example`):

```env
# الزامی — رشتهٔ اتصال PostgreSQL
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME

# قویاً توصیه‌شده در پروداکشن — کلید ۶۴ کاراکتری هگز برای رمزنگاری کد ملی و MFA
# تولید: openssl rand -hex 32
APP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# یک‌بارمصرف — فقط برای ساختن اولین کاربر ادمین از طریق صفحهٔ راه‌اندازی
# بعد از ساخت ادمین، این خط را حذف کنید!
BOOTSTRAP_SETUP_CODE=یک-کد-بلند-و-تصادفی

# ارسال ایمیل واقعی — اگر خالی بماند، پیام‌ها فقط در «صندوق پیام‌ها» (/outbox) ذخیره می‌شوند
SMTP_HOST=mail.your-domain.ir
SMTP_PORT=587
SMTP_USER=no-reply@your-domain.ir
SMTP_PASS=********
SMTP_FROM="سامانه نور <no-reply@your-domain.ir>"

# ارسال پیامک واقعی (اختیاری) — در غیر این صورت پیامک‌ها هم به صندوق پیام‌ها می‌روند
# سرویس پیامک‌پنل (https://rest.payamak-panel.com — پنل‌های SMSline و مشابه) — با ست‌کردن این سه متغیر فعال می‌شود
# PAYAMAK_PANEL_USERNAME=نام کاربری پنل پیامک
# PAYAMAK_PANEL_API_KEY=کلید APIKey از صفحه ApiSetting پنل (جایگزین گذرواژه)
# PAYAMAK_PANEL_SENDER=شمارهٔ خط ارسال
# گزینهٔ جایگزین: گذرواژهٔ پنل به‌جای APIKey
# PAYAMAK_PANEL_PASSWORD=
# سرویس کاوه‌نگار — جایگزین؛ اگر متغیرهای پیامک‌پنل ست شده باشند نادیده گرفته می‌شود
# KAVENEGAR_API_KEY=
# KAVENEGAR_SENDER=
```

**نکات حیاتی:**

- اگر `APP_ENCRYPTION_KEY` را ست نکنید، کلید تصادفی در `.private-app/encryption-key` ساخته می‌شود؛ در پروداکشن حتماً خودتان ست کنید و از آن بکاپ بگیرید — **تغییر این کلید بعد از ثبت داده، کدهای ملی و MFA ذخیره‌شده را غیرقابل خواندن می‌کند.**
- بدون `SMTP_HOST` سامانه در «حالت دریافت محلی» است: لینک‌های تأیید ایمیل/بازیابی گذرواژه در همان صفحهٔ UI و در `/outbox` نمایش داده می‌شوند. برای تست خوب است، برای پروداکشن واقعی SMTP بگذارید.
- برای پیامک واقعی با پیامک‌پنل: `PAYAMAK_PANEL_USERNAME` (نام کاربری پنل) + `PAYAMAK_PANEL_API_KEY` (کلید صفحهٔ ApiSetting؛ طبق مستندات رسمی جایگزین گذرواژه می‌شود) + `PAYAMAK_PANEL_SENDER` (شماره خط). به‌جای APIKey می‌توان `PAYAMAK_PANEL_PASSWORD` را گذاشت. در صورت تمایل به کاوه‌نگار، `KAVENEGAR_API_KEY` کافی است. اولویت با پیامک‌پنل است. **توجه:** با تنظیم بودن سرویس پیامک، فعال‌سازی حساب‌های ثبت‌نام عمومی تنها پس از تأیید کد پیامکی انجام می‌شود؛ اگر سرویس پیامک تنظیم نشده باشد حساب بلافاصله فعال می‌شود.

---

## مسیر الف — سرور مجازی (VPS) — پیشنهادی

### ۱. پیش‌نیازها

Ubuntu 22.04/24.04 با حداقل ۱ گیگ رم:

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-contrib
sudo npm i -g pm2

# نسخه‌ها را چک کنید
node -v   # >= 20
psql --version
```

### ۲. ساخت دیتابیس

```bash
sudo -u postgres psql <<'SQL'
CREATE USER noor WITH PASSWORD 'یک-رمز-خیلی-قوی';
CREATE DATABASE noor_prod OWNER noor;
\c noor_prod
GRANT ALL ON SCHEMA public TO noor;
SQL
```

Postgres فقط روی localhost گوش می‌دهد (پیش‌فرض) — همین را نگه دارید؛ نیازی به بازکردن پورت ۵۴۳۲ به بیرون نیست.

### ۳. دریافت کد و نصب

```bash
sudo adduser --disabled-password --gecos "" noor
sudo -iu noor
git clone <آدرس-ریپو> && cd noor-system   # یا آپلود و بازکردن noor-system-developed.zip
npm ci
```

### ۴. مایگریشن دیتابیس (یک‌بار)

فایل‌های SQL به ترتیب شماره اجرا شوند:

```bash
psql "$DATABASE_URL" -f drizzle/0000_init.sql
psql "$DATABASE_URL" -f drizzle/0001_messaging-and-tokens.sql
```

یا معادل آن با drizzle-kit (فایل `drizzle.config.ts` خودش `DATABASE_URL` را از `.env` می‌خواند):

```bash
npx drizzle-kit push --force
```

⚠️ اسکریپت `scripts/seed.ts` فقط برای دادهٔ **نمونهٔ محلی** است — روی پروداکشن اجرا نکنید (حساب‌های نمونه با گذرواژه‌های عمومی می‌سازد).

### ۵. فایل `.env` پروداکشن

طبق جدول بالا پر کنید و دسترسی فایل را محدود کنید:

```bash
chmod 600 .env
```

### ۶. بیلد و اجرا با PM2

```bash
npm run build
pm2 start npm --name noor -- start    # روی پورت 3000 بالا می‌آید
pm2 save
pm2 startup                            # دستور چاپ‌شده را با sudo اجرا کنید
```

### ۷. Nginx به‌عنوان پروکسی + SSL

```nginx
server {
    listen 80;
    server_name noor.your-domain.ir;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # این چهار خط مهم‌اند: لینک‌های ایمیل (تأیید/بازیابی) از همین هدرها ساخته می‌شوند
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 90;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/noor /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d noor.your-domain.ir
```

**کوکی‌های ورود این پروژه در حالت پروداکشن `secure` هستند؛ یعنی بدون HTTPS عملاً هیچ‌کس لاگین نمی‌شود. SSL را حتماً فعال کنید.**

### ۸. اولین ادمین

1. با `BOOTSTRAP_SETUP_CODE` وارد صفحهٔ راه‌اندازی شوید و حساب ادمین اصلی را بسازید.
2. `BOOTSTRAP_SETUP_CODE` را از `.env` حذف کنید و `pm2 restart noor` بزنید.
3. بقیهٔ ادمین‌ها/کارشناس‌ها از داخل پنل توسط سوپرادمین ساخته می‌شوند.

### ۹. بکاپ خودکار تولیدی

اسکریپت رسمی `scripts/backup-production.sh` (`pg_dump --format=custom` + checksum SHA-256 + نگهداری ۱۴ نسخه اخیر + ثبت در رویدادهای حساس):

```bash
# crontab -e  (کاربر noor)
15 3 * * * cd /home/noor/noor-system && set -a && . ./.env && set +a && bash scripts/backup-production.sh >> backups/cron.log 2>&1
```

داشبورد مدیر کل کارت «آخرین پشتیبان موفق» را از نشانگر همین اسکریپت می‌خواند؛ بازیابی با `scripts/restore-production.sh <dump> --verify` و چرخه کامل در [`docs/BACKUP-RESTORE.md`](./docs/BACKUP-RESTORE.md) مستند است. فایل بکاپ را به‌صورت دوره‌ای به مقصدی خارج از سرور (فضای ابری/لوکال خودتان) منتقل کنید.

### فایروال

فقط ۲۲/۸۰/۴۴۳ باز باشد:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

---

## مسیر ب — هاست اشتراکی cPanel با Node.js

> 📘 **راهنمای کامل و قدم‌به‌قدم cPanel در فایل [`CPANEL-SETUP.md`](./CPANEL-SETUP.md)** آمده است (چک‌لیست هاست، دیتابیس خارجی، server.js، تنظیمات Setup Node.js App، SSL، SMTP هاست، عیب‌یابی و به‌روزرسانی). خلاصهٔ مفهوم در ادامه آمده است.

پیش‌نیاز واقعی: هاست شما باید **Setup Node.js App** (کلادلینوکس/Passenger) داشته باشد **و** به PostgreSQL دسترسی بدهید. چون اکثر هاست‌های اشتراکی ایرانی فقط MySQL می‌دهند و این پروژه PostgreSQL می‌خواهد، رایج‌ترین ترکیب عملی این است:

> **اپ روی هاست cPanel + دیتابیس PostgreSQL خارجی** (مثل سرویس‌های PostgreSQL ابری — Neon، Supabase یا دیتابیس Postgres پلتفرم‌های ایرانی مثل لیارا/آروان). کافی است `DATABASE_URL` را به رشتهٔ اتصال همان سرویس بدهید؛ درایور پروژه (`pg`/postgres.js) با اتصال TLS این سرویس‌ها سازگار است.

### مراحل

1. **روی سیستم خودتان بیلد بگیرید** (هاست اشتراکی معمولاً رمز کافی برای بیلد Next.js ندارد):

   ```bash
   npm ci
   npm run build
   ```

2. **آپلود** کل پروژه (شامل `package.json`، `.next/`، `src/`، `public/`، `drizzle/`) به پوشهٔ اپ در هاست. `node_modules` را آپلود نکنید؛ در ترمینال هاست (یا بخش npm هاست) بزنید:

   ```bash
   npm ci --omit=dev
   ```

   اگر هاست به npm دسترسی ندارد، `node_modules` را هم zip کرده و آپلود کنید (با همین معماری سیستم عامل — لینوکس x64).

3. در cPanel → **Setup Node.js App**:
   - Node نسخهٔ ۲۰ به بالا
   - Application root: پوشهٔ پروژه
   - Application startup file: `server.js` (فایل زیر را بسازید)
   - بعد از ثبت، دکمهٔ **Run NPM Install** و سپس **Restart**

   ```js
   // server.js — نقطهٔ ورود Passenger برای Next.js
   process.env.NODE_ENV = "production";
   const { createServer } = require("http");
   const next = require("next");

   const port = process.env.PORT || 3000;
   const app = next({ dev: false });
   const handle = app.getRequestHandler();

   app.prepare().then(() => {
     createServer((req, res) => handle(req, res)).listen(port);
     console.log("Noor system ready on port " + port);
   });
   ```

4. **متغیرهای محیطی** را در همان بخش Node.js App (Environment variables) وارد کنید: `DATABASE_URL`، `APP_ENCRYPTION_KEY`، `BOOTSTRAP_SETUP_CODE`، مقادیر SMTP. (یا فایل `.env` را کنار پروژه بگذارید.)

5. **مایگریشن**: یک‌بار از طریق ترمینال هاست یا سیستم خودتان با همان `DATABASE_URL` خارجی:

   ```bash
   psql "$DATABASE_URL" -f drizzle/0000_init.sql
   psql "$DATABASE_URL" -f drizzle/0001_messaging-and-tokens.sql
   ```

6. **SSL هاست را حتماً فعال کنید** (AutoSSL / Let's Encrypt) — به دلیل کوکی‌های secure.

### محدودیت‌های هاست اشتراکی که باید بدانید

- منابع محدود است؛ صف‌های سنگین خروجی اکسل/گزارش‌های بزرگ ممکن است به limiter هاست بخورند.
- کارهای زمان‌بندی‌شده از cron هاست به سه endpoint/اسکریپت متصل می‌شوند: یادآور معوق‌ها (`/api/cron/reminders`)، یادآور رویدادها (`/api/cron/events`) و بکاپ روزانه (`scripts/backup-production.sh`). هر سه با یک `CRON_SECRET` مشترک و خطوط آماده در `CPANEL-SETUP.md` و `docs/BACKUP-RESTORE.md`.
- نسخهٔ Node هاست باید ≥ ۲۰ باشد؛ Next.js 16 روی Node قدیمی‌تر بیلد نمی‌شود.

---

## مسیر ج — پلتفرم‌های ابری

### داخل ایران (لیارا / ابر آروان و مشابه)

1. یک اپ **Next.js** و یک سرویس **PostgreSQL** بسازید.
2. متغیرهای `.env` را در پنل پلتفرم ست کنید (پنل‌ها معمولاً `.env` را از دیپلوی حذف می‌کنند).
3. دیپلوی: در لیارا با CLI:

   ```bash
   npm i -g @liara/cli
   liara login
   liara deploy
   ```

   پلتفرم خودش `npm run build` و `npm start` را اجرا می‌کند.
4. مایگریشن: یک‌بار از سیستم خودتان به دیتابیس ابری وصل شده و فایل‌های `drizzle/*.sql` را با psql اجرا کنید.

### خارج از ایران (Vercel + Neon/Supabase)

1. دیتابیس را در Neon/Supabase بسازید و `DATABASE_URL` آن را بردارید.
2. مایگریشن را یک‌بار از سیستم خودتان اجرا کنید (psql یا `npx drizzle-kit push`).
3. ریپو را به Vercel وصل کنید؛ `DATABASE_URL` و بقیهٔ متغیرها را در Project Settings → Environment Variables ست کنید. Vercel خودش بیلد می‌کند.
4. نکته: `next.config.ts` و `src/middleware.ts` (CSP) نیازی به تغییر برای Vercel ندارند.
5. برای SMTP از سرویسی مثل Resend/Postmark استفاده کنید و همان مقادیر را در `SMTP_*` بگذارید.

---

## چک‌لیست نهایی امنیتی پروداکشن

- [ ] `NODE_ENV=production` (در VPS با `pm2 start npm --name noor -- start` خودکار نیست؛ با اکوسیستم env یا `pm2 start npm --name noor --production -- start` مطمئن شوید — Next خودش در `next start` حالت پروداکشن است).
- [ ] HTTPS فعال و گواهی معتبر (کوکی‌های secure).
- [ ] `APP_ENCRYPTION_KEY` ست‌شده و بکاپ‌شده در جای امن.
- [ ] `BOOTSTRAP_SETUP_CODE` بعد از ساخت ادمین اول **حذف شده**.
- [ ] رمز دیتابیس قوی و Postgres فقط روی localhost/شبکهٔ خصوصی.
- [ ] SMTP واقعی + تنظیم SPF/DKIM دامنه، تا ایمیل‌ها به Spam نروند.
- [ ] بکاپ روزانهٔ `scripts/backup-production.sh` با cron + تمرین `restore-production.sh --verify` + انتقال بکاپ به خارج از سرور.
- [ ] قبل از هر دیپلوی: `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] فایروال فقط ۲۲/۸۰/۴۴۳.
- [ ] هیچ دادهٔ seed نمونه‌ای روی پروداکشن نیست.
