# راهنمای نصب و کانفیگ سامانه نور روی cPanel — قدم به قدم

این سند مکمل `DEPLOY.md` است و دقیقاً مسیر نصب روی **هاست اشتراکی cPanel** را باز می‌کند. ترتیب گام‌ها مهم است؛ از گام ۰ شروع کنید و رد نشوید.

---

## نصب خودکار با `install.sh` (مسیر پیشنهادی)

پکیج آمادهٔ `noor-cpanel-installer.zip` همه‌چیز را دارد: کد، خروجی بیلد (`.next`)، نقطهٔ ورود `server.js` و نصب‌کنندهٔ خودکار. روی هاست فقط ۴ قدم:

1. **آپلود:** `noor-cpanel-installer.zip` را در File Manager داخل `/home/USERNAME/` آپلود کنید (خارج از `public_html`) و Extract بزنید → پوشهٔ `noor-app` ساخته می‌شود.
2. **ترمینال:** در cPanel → Terminal را باز کنید و بزنید:
   ```bash
   cd ~/noor-app && bash install.sh
   ```
3. **پاسخ به ۲-۳ پرسش:** رشتهٔ اتصال دیتابیس (گام ۱ پایین)، دامنه و مسیر docroot. نصب‌کننده خودش Node مناسب را پیدا می‌کند، `npm ci` را می‌زند، مایگریشن‌ها را بدون psql اعمال می‌کند، `.env` را با کلیدهای امن می‌سازد و اپ را در cPanel ثبت/ری‌استارت می‌کند.
4. **پایان:** پیام خلاصه شامل کد راه‌اندازی (`/setup`) است. SSL را از SSL/TLS Status فعال کنید و تمام.

حالت بدون پرسش (برای تکرار یا اسکریپت):

```bash
bash install.sh --yes --db-url "postgresql://user:pass@host:5432/db" --domain noor.example.ir --docroot /home/USER/public_html
```

به‌روزرسانی نسخه‌های بعدی: ZIP جدید را روی همان پوشه Extract کنید و بزنید `bash install.sh --update`.

> اگر نصب‌کننده در ثبت خودکار موفق نشد (بسته به تنظیمات هاست)، دقیقاً همان مقادیری که چاپ می‌کند را در «Setup Node.js App» دستی وارد کنید — بقیهٔ مراحل (npm، مایگریشن، .env) انجام شده است. عیب‌یابی: جدول انتهای همین سند.

بخش‌های پایین، شرح کامل همان مراحل به‌صورت دستی است — برای فهمیدن زیرساخت یا وقتی نصب خودکار در هاست شما کار نکند.

---

**تصویر کلی معماری نهایی:**

```
مرورگر → Apache/دامنهٔ شما (cPanel) → Passenger → اپ Node.js (server.js + Next 16)
                                                      ↓
                                         PostgreSQL خارجی (لیارا / Neon / Supabase)
ایمیل: از SMTP خود هاست cPanel | مدارک خصوصی: پوشهٔ .private-app/uploads
```

---

## گام ۰ — چک‌لیست قبل از شروع (مهم‌ترین گام!)

قبل از هر کاری با پشتیبانی هاستینگ چک کنید یا در cPanel ببینید:

| # | چه چیزی | حداقل لازم | کجا چک شود |
|---|---|---|---|
| 1 | آیکون **Setup Node.js App** | حتماً باشد، Node نسخهٔ **۲۰ یا بالاتر** | صفحهٔ اصلی cPanel → بخش Software |
| 2 | سهمیهٔ Inode (تعداد فایل) | حداقل **۶۰,۰۰۰** (نصب کامل حدود ۳۰ هزار فایل مصرف می‌کند) | پنل هاست / پشتیبانی |
| 3 | فضای دیسک | حداقل **۲ گیگابایت** (node_modules پروداکشن ≈ ۶۵۰MB + .next ≈ ۱۴۰MB) | صفحهٔ اصلی cPanel |
| 4 | ترمینال SSH | برای npm install و psql خیلی کمک می‌کند (Terminal در cPanel) | صفحهٔ اصلی cPanel |
| 5 | اتصال خروجی به پورت **5432** | چون دیتابیس خارجی است | فقط از پشتیبانی هاست بپرسید |
| 6 | SSL برای دامنه | AutoSSL / Let's Encrypt | SSL/TLS Status |
| 7 | حداقل رم اپ | ~۵۱۲MB تا ۱GB برای اجرا | پلن هاست (برای بیلد روی هاست ۲GB لازم است — بیلد را محلی بگیرید) |

> ⛔ **اگر آیکون Setup Node.js App در cPanel شما نیست، همین‌جا متوقف شوید.** اپ‌های Next.js روی هاستی بدون Node.js اجرا نمی‌شوند؛ آن‌وقت فقط سه راه دارید: ارتقای پلن، سرور مجازی، یا پلتفرم ابری (بخش «مسیر الف/ج» در `DEPLOY.md`).

---

## گام ۱ — دیتابیس PostgreSQL خارجی

هاست‌های cPanel تقریباً همیشه فقط MySQL می‌دهند و این پروژه PostgreSQL می‌خواهد؛ پس دیتابیس را از یک سرویس جدا بگیرید:

- **داخل ایران:** سرویس PostgreSQL لیارا یا آروان (پرداخت ریالی، پینگ کم)
- **خارج:** Neon یا Supabase (پلن رایگان برای شروع کافی است)

1. دیتابیس بسازید و **Connection String** را کپی کنید. شکل کلی:

   ```
   postgresql://USER:PASSWORD@HOST:5432/DBNAME
   ```

2. برای سرویس‌های ابری، `?sslmode=require` را به انتهای رشته اضافه کنید (با درایور `pg` همین پروژه تست شده و TLS را فعال می‌کند):

   ```
   postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
   ```

3. **مایگریشن جدول‌ها** را از سیستم خودتان اجرا کنید (روی هاست psql ندارید):

   ```bash
   export DATABASE_URL="postgresql://...?sslmode=require"
   psql "$DATABASE_URL" -f drizzle/0000_init.sql
   psql "$DATABASE_URL" -f drizzle/0001_messaging-and-tokens.sql
   ```

   (یا یک‌بار `npx drizzle-kit push --force` از پوشهٔ پروژه — فایل `drizzle.config.ts` خودش `DATABASE_URL` را می‌خواند.)

4. تست اتصال: `psql "$DATABASE_URL" -c "select 1;"` باید `1` برگرداند.

> ⚠️ اگر `psql` به‌خاطر IP محدود شود، در پنل سرویس دیتابیس، IP سرور هاستتان را به allowlist اضافه کنید (Neon/Supabase پیش‌فرض بازند؛ لیارا گزینهٔ IP محدود دارد).

---

## گام ۲ — آماده‌سازی روی سیستم خودتان (بیلد محلی)

**روی هاست بیلد نگیرید** — بیلد Next.js رم زیاد می‌خواهد و روی هاست اشتراکی معمولاً کرش می‌کند یا اکانت را به limiter می‌خورد.

```bash
# 1) کد را بگیرید (کلون یا بازکردن noor-system-developed.zip)
cd noor-system
npm ci                # نه npm install — lockfile قفل‌شده است

# 2) فایل .env محلی برای بیلد/تست بسازید (همان الگوی .env.example)
#    DATABASE_URL را به دیتابیس گام ۱ بدهید

# 3) بیلد
npm run build

# 4) تست سریع محلی با همان server.js که روی هاست می‌رود:
node server.js        # ← بعد از ساختن فایل گام ۴؛ http://localhost:3000 را چک کنید
```

اگر `node server.js` لوکال درست بالا آمد، یعنی همان دقیقاً روی cPanel هم بالا می‌آید.

---

## گام ۳ — آپلود به هاست

یک ZIP بسازید که **شامل این‌ها باشد:**

| شامل شود | توضیح |
|---|---|
| `.next/` | خروجی بیلد (بیلد محلی) |
| `package.json` + `package-lock.json` | برای نصب وابستگی‌ها |
| `server.js` | نقطهٔ ورود (گام ۴) |
| `next.config.ts`، `tsconfig.json`، `postcss.config.mjs` | کانفیگ‌ها |
| `src/` و `public/` | کد و فایل‌های استاتیک |
| `drizzle/` | فایل‌های مایگریشن (برای ارجاع/به‌روزرسانی بعدی) |

| مستثنی شود | دلیل |
|---|---|
| `node_modules/` | روی هاست با npm نصب می‌شود (نسخهٔ لینوکسی باید نصب شود، نه ویندوزی) |
| `.git/`، `.env`، `.private-app/`، `tests/`، `.github/` | غیرلازم روی هاست |

1. در cPanel → **File Manager** → به `/home/USERNAME/` بروید و پوشهٔ جدید `noor-app` بسازید.
   > 📌 **پوشهٔ اپ را داخل `public_html` نسازید** — سورس، `.env` و مدارک خصوصی نباید از وب قابل دسترسی باشند. Passenger خودش از طریق `PassengerAppRoot` به آن وصل می‌شود.
2. ZIP را آپلود و در همان‌جا Extract کنید.
3. در File Manager روی `noor-app` → راست‌کلیک → از بخش permissions، فایل `.env` (گام بعد) را روی `600` بگذارید.

---

## گام ۴ — فایل `server.js` (نقطهٔ ورود Passenger)

این فایل را در ریشهٔ `noor-app` بسازید (محتوایش در ZIP آپدیت‌شده هم هست):

```js
// server.js — نقطهٔ ورود Passenger برای Next.js 16
process.env.NODE_ENV = "production";

const { createServer } = require("http");
const next = require("next");

const port = Number(process.env.PORT) || 3000; // Passenger پورت را خودش می‌دهد
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log("Noor system ready on port " + port);
  });
});
```

نکات فنی (بررسی‌شده با این پروژه):

- Next 16 با `require("next")` سازگار است (خروجی CJS دارد).
- فایل `.env` را **خود Next به‌صورت خودکار از پوشهٔ اپ لود می‌کند**؛ نیازی به dotenv یا ست‌کردن دستی در cPanel نیست (هر دو روش کار می‌کند؛ `.env` ساده‌تر است).
- `NODE_ENV=production` باعث می‌شود کوکی‌های نشست `secure` شوند → **بدون HTTPS ورود کار نمی‌کند** (گام ۶).

---

## گام ۵ — فایل `.env` پروداکشن

در File Manager، داخل `noor-app` فایل `.env` بسازید:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require

APP_ENCRYPTION_KEY=خروجی openssl rand -hex 32
BOOTSTRAP_SETUP_CODE=یک-کد-بلند-تصادفی-مثل-kX9mQ2vT7pLw4zRb8nCd6fJh3sYg5tVq

SMTP_HOST=mail.your-domain.ir
SMTP_PORT=465
SMTP_USER=no-reply@your-domain.ir
SMTP_PASS=رمز-ایمیلی-که-در-گام-۸-می‌سازید
SMTP_FROM="سامانه نور <no-reply@your-domain.ir>"
```

- `APP_ENCRYPTION_KEY` حتماً ست کنید و **بکاپ بگیرید** — این کلید برای رمزنگاری کد ملی و راز MFA است؛ تغییرش بعد از ثبت داده، آن‌ها را غیرقابل بازیابی می‌کند.
- اگر SMTP را خالی بگذارید، سامانه در «حالت دریافت محلی» می‌ماند: پیام‌ها فقط در `/outbox` ذخیره و لینک‌ها در UI نمایش داده می‌شوند (برای بررسی صحت راه‌اندازی مناسب است).
- بعد از ساخت ادمین اول (گام ۷)، خط `BOOTSTRAP_SETUP_CODE` را **حذف** کنید.

---

## گام ۶ — ساخت اپ در cPanel (Setup Node.js App)

1. cPanel → **Setup Node.js App** → **Create Application**
2. فیلدها:

   | فیلد | مقدار |
   |---|---|
   | Node.js version | **20.x یا بالاتر** (Next 16 روی قدیمی‌تر اجرا نمی‌شود) |
   | Application mode | **Production** |
   | Application root | `noor-app` (همان پوشهٔ گام ۳) |
   | Application URL | دامنه یا ساب‌دامنهٔ شما (مثلاً `noor.your-domain.ir`) |
   | Application startup file | `server.js` |

3. **Run NPM Install** را بزنید (اولین نصب ممکن است ۲–۵ دقیقه طول بکشد).

   اگر ترمینال دارید، دقیق‌ترش این است (npm ci با lockfile):

   ```bash
   source /home/USERNAME/nodevenv/noor-app/20/bin/activate
   cd /home/USERNAME/noor-app
   npm ci --omit=dev
   ```
   > اگر `npm ci` خطای sync داد، `npm install` بزنید. (در این ریپو lockfile همگام شده است.)

4. دکمهٔ **Restart** را بزنید و آدرس `Application URL` را باز کنید — باید صفحهٔ ورود بیاید.

---

## گام ۷ — SSL و اجبار به HTTPS

1. cPanel → **SSL/TLS Status** → کنار دامنه **Run AutoSSL** (یا Let's Encrypt).
2. برای اجبار به HTTPS، در File Manager داخل `public_html` (یا docroot همان دامنه) فایل `.htaccess` را ویرایش/بسازید و این را بالا اضافه کنید:

   ```apache
   RewriteEngine On
   RewriteCond %{HTTPS} off
   RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
   ```

3. چک نهایی: آدرس سایت با `https` باز شود؛ اگر گواهی نامعتبر باشد مرورگر بلاک می‌کند و کوکی نشست هم ست نمی‌شود.

> لینک‌های داخل ایمیل‌ها (تأیید ایمیل/بازیابی گذرواژه) به‌صورت خودکار از هدرهای `Host` / `X-Forwarded-*` همان درخواست ساخته می‌شوند؛ روی cPanel معمولاً درست درمی‌آید. اگر روزی دامنهٔ لینک‌ها اشتباه شد، تنظیم دامنه/پروکسی را چک کنید.

---

## گام ۸ — ساخت ادمین اول و بستن درگاه راه‌اندازی

1. در `.env` مقدار `BOOTSTRAP_SETUP_CODE` را گذاشته‌اید → آدرس `/setup` را باز کنید.
2. کد را وارد کنید و **حساب ادمین اصلی** را با ایمیل و گذرواژهٔ قوی بسازید.
3. از `.env` خط `BOOTSTRAP_SETUP_CODE` را پاک کنید → Node.js App → **Restart**.
4. ورود با ادمین جدید را تست کنید. اگر در `/setup` خطای «کد نامعتبر» دیدید، یعنی حذف موفق بوده — این مسیر دیگر کسی را راه نمی‌برد.
5. از داخل پنل، فعال‌سازی **MFA** برای ادمین (صفحهٔ حساب کاربری) را جدی بگیرید.

---

## گام ۹ — ایمیل واقعی با SMTP خودِ هاست cPanel

هاست cPanel خودش میل‌سرور دارد؛ سرویس جدا لازم نیست:

1. cPanel → **Email Accounts** → بسازید: `no-reply@your-domain.ir` (فضای کمی کافی است).
2. مقادیر را در `.env` بگذارید: `SMTP_HOST=mail.your-domain.ir`، `SMTP_PORT=465` (پورت ۴۶۵ = SSL؛ خود اپ این را تشخیص می‌دهد)، یوزر/پس همان ایمیل.
3. cPanel → **Email Deliverability** → برای دامنه **SPF و DKIM** را فعال کنید تا ایمیل‌ها به Spam نروند.
4. تست: از صفحهٔ ورود «گذرواژه را فراموش کرده‌اید؟» را با ایمیل ادمین امتحان کنید؛ باید واقعاً ایمیل برسد.

پیامک (اختیاری): اگر `PAYAMAK_PANEL_USERNAME` (نام کاربری پنل پیامک) + `PAYAMAK_PANEL_API_KEY` (کلید صفحهٔ ApiSetting پنل؛ جایگزین گذرواژه) و `PAYAMAK_PANEL_SENDER` (شمارهٔ خط ارسال) را در `.env` بگذارید، پیامک‌ها با سرویس پیامک‌پنل (`https://rest.payamak-panel.com` — شامل پنل‌های SMSline و مشابه) ارسال می‌شوند؛ گزینهٔ جایگزین `KAVENEGAR_API_KEY` (کاوه‌نگار) است. در غیر این صورت پیامک‌ها در صندوق پیام‌ها ذخیره می‌شوند. با تنظیم بودن سرویس پیامک، ثبت‌نام عمومی نیاز به تأیید کد پیامکی دارد و حساب پیش از تأیید غیرفعال می‌ماند.

---

## گام ۱۰ — بکاپ تولیدی و نگهداری

اسکریپت رسمی بکاپ (`scripts/backup-production.sh`) پایگاه داده را با قالب custom و checksum SHA-256 در `backups/` نگهداری می‌کند (۱۴ نسخه اخیر) و هر اجرا در رویدادهای حساس ثبت می‌شود:

1. یک cron روزانه (مثلاً ساعت ۳:۱۵ صبح) در cPanel → Cron Jobs:
   ```bash
   cd /home/USERNAME/noor-app && set -a && . ./.env && set +a && bash scripts/backup-production.sh >> backups/cron.log 2>&1
   ```
2. بعد از اولین اجرا، کارت «آخرین پشتیبان موفق» داشبورد مدیر کل پر می‌شود.
3. بازیابی فقط با `bash scripts/restore-production.sh <dump> --verify` (اول بررسی، بعد تأیید «بله») — مستندات کامل: [`docs/BACKUP-RESTORE.md`](./docs/BACKUP-RESTORE.md).

| چه چیزی | چطور | چرا حیاتی |
|---|---|---|
| دیتابیس | کرون روزانهٔ `backup-production.sh` (بند بالا) | همهٔ داده‌ها |
| پوشهٔ `.private-app/` | File Manager → Compress → دانلود | **کلید رمزنگاری + فایل مدارک خصوصی کاربران**؛ بدون آن، بکاپ دیتابیس برای کد ملی/MFA بی‌فایده است |
| `.env` | کپی خارج از هاست | کلیدها |

- بدون بکاپ `.private-app/encryption-key` (یا `APP_ENCRYPTION_KEY`)، حتی دیتابیس کامل قابل بازگشت نیست — این را به تیم یادآوری کنید.
- نسخهٔ `.dump` را حداقل هفته‌ای یک‌بار به محل دوم (فضای ابری) منتقل کنید.
- سهمیه inode را گاهی چک کنید (node_modules ~۳۰هزار فایل).

---

## گام ۱۱ — کارهای خودکار (Cron Jobs)

سه کار زمان‌بندی‌شده روی cPanel ثبت می‌شود؛ همه با همان `CRON_SECRET` محافظت می‌شوند:

1. در `.env` هاست یک کلید محرمانه بگذارید (هر رشتهٔ تصادفی طولانی):
   ```
   CRON_SECRET=یک-رشته-تصادفی-طولانی
   ```
   و Node.js App را **Restart** کنید. تا وقتی این متغیر تنظیم نشده باشد endpointهای کرون کلاً پاسخ 404 می‌دهند.
2. cPanel → **Cron Jobs** → سه کرون:
   ```bash
   # یادآور خودکار پیامکی پرونده‌های معوق (مثلاً ۸ صبح)
   0 8 * * * curl -fsS "https://دامنه-شما/api/cron/reminders?key=همان-CRON-SECRET" > /dev/null
   # یادآور پیامکی پیش از رویدادها (مثلاً هر ساعت)
   0 * * * * curl -fsS "https://دامنه-شما/api/cron/events?key=همان-CRON-SECRET" > /dev/null
   # بکاپ روزانهٔ دیتابیس (مثلاً ۳:۱۵ صبح)
   15 3 * * * cd /home/USERNAME/noor-app && set -a && . ./.env && set +a && bash scripts/backup-production.sh >> backups/cron.log 2>&1
   ```
3. رفتار endpoint یادآور معوق‌ها:
   - پرونده‌های بیش از ۱۴ روز بدون به‌روزرسانی در وضعیت‌های «در انتظار بررسی» / «بررسی تخصصی» را پیدا می‌کند (با `?days=7` یا `?days=30` قابل تغییر).
   - به مسئول هر پرونده (کارشناس ارجاع‌شده → ثبت‌کنندهٔ سازمانی → خودِ فعال) پیامک و اعلان داخلی می‌دهد؛ هر پرونده حداکثر هر ۳ روز یک یادآور (بازهٔ خنکایی) — اجرای تکراری بی‌خطر است.
4. رفتار endpoint یادآور رویدادها:
   - برای هر رویداد، در فاصلهٔ تعیین‌شدهٔ همان رویداد (پیش‌فرض ۴۸ ساعت؛ ۲۴/۷۲/۱۶۸ هم قابل انتخاب) به هر دعوت‌شدهٔ بدون یادآور قبلی یک پیامک اطلاع‌رسانی می‌دهد؛ دعوت‌شدهٔ «منصرف» یادآور نمی‌گیرد.
   - خروجی JSON: `{"ok":true,"considered":..,"sent":..,"withSms":..}`.
5. گیرندگان کارکنان باید شمارهٔ همراهشان در «مدیریت کاربران → ویرایش» ثبت شده باشد؛ شمارهٔ فعال از پروندهٔ او برداشته می‌شود.
6. اگر متغیرهای پیامک‌پنل (`PAYAMAK_PANEL_USERNAME` / `PAYAMAK_PANEL_PASSWORD`) یا `KAVENEGAR_API_KEY` تنظیم شده باشد پیامک واقعی ارسال می‌شود؛ وگرنه همهٔ پیامک‌ها در «صندوق پیام‌ها» به‌صورت محلی ثبت می‌شوند.

---

## عیب‌یابی سریع

| علامت | علت رایج | راه‌حل |
|---|---|---|
| خطای 503 یا "Application could not be started" | کرش در استارت | در صفحهٔ Node.js App لاگ را ببینید؛ معمولاً `.env` ناقص یا نسخهٔ Node < 20 |
| همه‌جا خطای 500 | اتصال دیتابیس | `DATABASE_URL` و `sslmode=require` را چک کنید؛ `select 1` را از سیستم خودتان تست کنید |
| ورود می‌زنم، دوباره به صفحهٔ ورود برمی‌گردم | سایت روی HTTP است | گام ۷ — کوکی‌های secure فقط با HTTPS ست می‌شوند |
| "Cannot find module 'next'" | نصب نشده | Run NPM Install / `npm ci --omit=dev` در ترمینال |
| `npm ci` خطای sync | lockfile قدیمی | `npm install` بزنید و بعد ادامه دهید |
| ایمیل نمی‌رسد | SMTP/پورت | پورت 465 و رمز ایمیل را چک کنید؛ SPF/DKIM فعال باشد؛ اول تست بفرستید |
| سایت بعد از مدت بیکاری کند بالا می‌آید | Passenger اپ را خوابانده | طبیعی هاست اشتراکی است؛ اولین بازدید بعد از idle کند است |
| خطای کمبود حافظه هنگام npm install | محدودیت رم | `npm ci --omit=dev --no-audit --no-fund` بزنید؛ اگر نشد، node_modules لینوکسی را از یک VPS/سیستم لینوکسی zip کرده آپلود کنید |
| پنل Node.js App باز نمی‌شود/آیکون نیست | پلن بدون Node | نصب روی این هاست ممکن نیست — VPS یا ابر |
| بعد از زدن دکمهٔ ورود (یا هر فرم) خطای ۵۰۰ گرفتم و در لاگ خطای «Invalid Server Actions request» است | پروکسی جلوی سایت (CDN/کلادفلر) هدرهای Host را بازنویسی می‌کند | دامنهٔ سایت را به `allowedOrigins` در `next.config.ts` اضافه کنید، مثلاً `["**.your-domain.ir"]`، و Restart بزنید |
| مرورگر خطای «The page isn't redirecting properly» / حلقهٔ ریدایرکت روی صفحات | لایهٔ جلوی سایت (Apache mod_dir یا CDN) به انتهای نشانی `/` اضافه می‌کند و Next برمی‌گرداند | در این نسخه با `skipTrailingSlashRedirect: true` در `next.config.ts` حل شده؛ اگر نسخهٔ قدیمی دارید همین تنظیم را اضافه و rebuild کنید. کش 301 مرورگر را هم با رفرش سخت (Ctrl+Shift+R) پاک کنید |

---

## به‌روزرسانی نسخه‌های بعدی (پس از هر تغییر کد)

1. روی سیستم خودتان: `git pull` → `npm ci` → `npm run build` → تست `node server.js`.
2. ZIP از همان لیست گام ۳ بسازید (این بار `.private-app/` و `.env` روی هاست **دست نخورده** می‌مانند).
3. آپلود و Extract روی `noor-app` (فایل‌های قبلی بازنویسی می‌شوند).
4. اگر `package-lock.json` تغییر کرده: در ترمینال `npm ci --omit=dev` دوباره.
5. اگر مایگریشن جدید به `drizzle/` اضافه شده: از سیستم خودتان `psql "$DATABASE_URL" -f drizzle/XXXX_....sql`.
6. Node.js App → **Restart**.

---

## محدودیت‌های واقعی هاست اشتراکی که باید بدانید

- **بیلد روی هاست ممنوع** — همیشه بیلد محلی.
- کارهای زمان‌بندی‌شده از Cron Jobs خود cPanel انجام می‌شوند: یادآور معوق‌ها، یادآور رویدادها و بکاپ روزانه (گام ۱۱)؛ نیازی به cron داخلی اپ نیست.
- گزارش‌های اکسل خیلی سنگین می‌توانند به محدودیت CPU/زمان اجرای هاست بخورند؛ برای حجم بالا، بازهٔ گزارش را کوچک‌تر بگیرید.
- اگر روزی تعداد کاربران/پرونده‌ها جدی شد، مهاجرت به VPS (بخش «مسیر الف» در `DEPLOY.md`) ارزان‌تر و پایدارتر از ارتقای پلن اشتراکی است.

## نصب slim برای هاست‌های با سهمیهٔ کم (مثلاً ۵۰۰ مگابایت)

اگر سهمیهٔ هاست برای `npm ci` کامل کم است (~۶۵۰MB)، بستهٔ slim بسازید:

```bash
# روی سیستم خودتان — خروجی: download/noor-slim.zip (~۲۶MB، باز‌شده ~۷۲MB)
bash scripts/build-slim-package.sh
```

بستهٔ slim از خروجی `output: "standalone"` نکست استفاده می‌کند (در next.config.ts فعال است)،
لودر متغیرهای محیطی را داخل خود `standalone/server.js` تعبیه می‌کند و نیازی به npm روی هاست ندارد.

روی هاست: زیپ را Extract کنید، سپس:

```bash
cd ~/noor-system
ln -sfn .next/standalone/node_modules node_modules
bash install.sh --yes --skip-npm --db-url "postgresql://..." --domain EXAMPLE.ir
```

نکتهٔ مهم: کارگر Passenger نام پروسه را به `next-server (vXX.X.X)` تغییر می‌دهد؛ برای ری‌استارت واقعی
`ps aux | grep next-server` و سپس `kill PID` بزنید — دکمه‌های Restart/Stop پنل و `tmp/restart.txt`
ممکن است روی برخی هاست‌ها پروسهٔ واقعی را حذف نکنند.
