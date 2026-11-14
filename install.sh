#!/usr/bin/env bash
# =====================================================================
#  نصب‌کنندهٔ خودکار «سامانه نور» برای هاست cPanel (Node.js App)
#
#  استفاده:
#    bash install.sh                       نصب جدید، پرسش‌وپاسخ تعاملی
#    bash install.sh --update              به‌روزرسانی نسخهٔ بعدی (بدون پرسش)
#    bash install.sh --yes --db-url "postgresql://user:pass@host:5432/db"
#                     [--domain noor.example.ir] [--docroot /home/USER/public_html]
#
#  پیش‌نیاز: این فایل داخل پوشهٔ اپ روی هاست اجرا شود (کنار package.json).
#  مستندات کامل: CPANEL-SETUP.md
# =====================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# ---------- ابزارهای چاپ ----------
if [ -t 1 ]; then
  C_B='\033[1;36m'; C_G='\033[0;32m'; C_Y='\033[1;33m'; C_R='\033[0;31m'; C_0='\033[0m'
else
  C_B=''; C_G=''; C_Y=''; C_R=''; C_0=''
fi
say()  { printf "${C_B}==>${C_0} %s\n" "$1"; }
ok()   { printf "${C_G} [ok]${C_0} %s\n" "$1"; }
warn() { printf "${C_Y} [!]${C_0} %s\n" "$1"; }
die()  { printf "${C_R} [خطا]${C_0} %s\n" "$1" >&2; exit 1; }

# ---------- پارامترها ----------
MODE="install"; YES=0; SKIP_NPM=0; FORCE_NPM=0
DB_URL_ARG=""; DOMAIN_ARG=""; DOCROOT_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update)    MODE="update" ;;
    --yes|-y)    YES=1 ;;
    --db-url)    DB_URL_ARG="${2:-}"; shift ;;
    --domain)    DOMAIN_ARG="${2:-}"; shift ;;
    --docroot)   DOCROOT_ARG="${2:-}"; shift ;;
    --skip-npm)  SKIP_NPM=1 ;;
    --force-npm) FORCE_NPM=1 ;;
    -h|--help)   sed -n '2,13p' "$0"; exit 0 ;;
    *) die "پارامتر ناشناخته: $1 (راهنما: bash install.sh --help)" ;;
  esac
  shift
done

# ---------- ۱) سلامت پوشهٔ اپ ----------
[ -f package.json ] || die "این اسکریپت باید داخل پوشهٔ اپ (کنار package.json) اجرا شود."
[ -f .next/BUILD_ID ] || warn "پوشهٔ .next (خروجی بیلد) پیدا نشد؛ اگر این پوشه را آپلود نکرده‌اید، سایت بالا نمی‌آید."
ok "پوشهٔ اپ: $APP_DIR"

# ---------- ۲) پیدا کردن Node.js نسخهٔ ۲۰ به بالا ----------
NODE_BIN=""
NODE_VER_OK=""
collect_node_candidates() {
  command -v node 2>/dev/null || true
  ls "$HOME"/nodevenv/*/bin/node 2>/dev/null || true
  ls /opt/alt/alt-nodejs*/root/usr/bin/node 2>/dev/null || true
  ls /opt/cpanel/ea-nodejs*/bin/node 2>/dev/null || true
}
BEST_MAJOR=0
for CAND in $(collect_node_candidates | sort -u); do
  [ -x "$CAND" ] || continue
  V="$("$CAND" -v 2>/dev/null | sed 's/^v//')" || continue
  MAJOR="${V%%.*}"
  case "$MAJOR" in (*[!0-9]*|"") continue ;; esac
  if [ "$MAJOR" -ge 20 ] && [ "$MAJOR" -ge "$BEST_MAJOR" ]; then
    BEST_MAJOR="$MAJOR"; NODE_BIN="$CAND"; NODE_VER_OK="$V"
  fi
done
[ -n "$NODE_BIN" ] || die "Node.js نسخهٔ ۲۰ یا بالاتر پیدا نشد. ابتدا در cPanel یک اپ Node بسازید یا از پشتیبانی هاست بخواهید Node.js Selector را فعال کند."
NODE_DIR="$(dirname "$NODE_BIN")"
export PATH="$NODE_DIR:$PATH"
ok "Node.js $NODE_VER_OK → $NODE_BIN"

rand_hex() { # $1 = بایت
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1" 2>/dev/null && return; fi
  "$NODE_BIN" -e "console.log(require('crypto').randomBytes($1).toString('hex'))"
}

# ---------- ۳) فایل .env ----------
ENV_FILE="$APP_DIR/.env"
get_env_key() { # $1=KEY → مقدار از .env موجود
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${1}=\(.*\)$/\1/p" "$ENV_FILE" | head -1 | sed 's/^"//; s/"$//'
}

if [ "$MODE" = "update" ]; then
  [ -f "$ENV_FILE" ] || die "حالت --update به .env موجود نیاز دارد؛ ابتدا نصب عادی را اجرا کنید."
  ok ".env موجود استفاده می‌شود (حالت به‌روزرسانی)."
else
  if [ -f "$ENV_FILE" ]; then
    if [ "$YES" = "1" ]; then
      ok ".env موجود حفظ شد (حالت --yes)."
    else
      printf "فایل .env از قبل موجود است. حفظ شود؟ [Y/n] "
      read -r ANS
      case "$ANS" in (n|N) rm -f "$ENV_FILE"; warn ".env قبلی حذف شد — از نو می‌سازیم." ;; (*) ok ".env موجود حفظ شد." ;; esac
    fi
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  say "ساخت فایل .env ..."
  umask 077
  DB_URL="${DB_URL_ARG}"
  if [ "$YES" != "1" ]; then
    printf "رشتهٔ اتصال PostgreSQL (مثلاً postgresql://user:pass@host:5432/db): "
    read -r DB_URL
  fi
  case "$DB_URL" in (postgresql://*) ;; (*) die "رشتهٔ اتصال باید با postgresql:// شروع شود." ;; esac
  # برای دیتابیس غیرمحلی بدون sslmode، خودکار فعالش می‌کنیم
  case "$DB_URL" in
    *@localhost*|*@127.0.0.1*|*\[::1\]*) : ;;
    *sslmode=*) : ;;
    *\?*) DB_URL="$DB_URL&sslmode=require" ;;
    *)    DB_URL="$DB_URL?sslmode=require" ;;
  esac

  ENC_KEY="$(get_env_key APP_ENCRYPTION_KEY)"; [ -n "$ENC_KEY" ] || ENC_KEY="$(rand_hex 32)"
  BOOT_CODE="$(get_env_key BOOTSTRAP_SETUP_CODE)"; [ -n "$BOOT_CODE" ] || BOOT_CODE="$(rand_hex 12)"

  SMTP_HOST=""; SMTP_PORT="465"; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""
  if [ "$YES" != "1" ]; then
    printf "SMTP برای ارسال ایمیل — میزبان (خالی = حالت محلی صندوق پیام‌ها): "
    read -r SMTP_HOST
    if [ -n "$SMTP_HOST" ]; then
      printf "SMTP_PORT [465]: "; read -r SMTP_PORT; SMTP_PORT="${SMTP_PORT:-465}"
      printf "SMTP_USER: "; read -r SMTP_USER
      printf "SMTP_PASS: "; read -rs SMTP_PASS; echo
      printf "SMTP_FROM (مثلاً \"سامانه نور <no-reply@domain.ir>\"): "; read -r SMTP_FROM
    fi
  fi

  # پیامک با سرویس پیامک‌پنل (rest.payamak-panel.com — پنل‌های SMSline و مشابه)
  # در حالت --yes مقادیر از متغیرهای محیطی همان نام خوانده می‌شوند.
  SMS_USER="${PAYAMAK_PANEL_USERNAME:-}"; SMS_KEY="${PAYAMAK_PANEL_API_KEY:-}"
  SMS_SENDER="${PAYAMAK_PANEL_SENDER:-}"; SMS_PASS="${PAYAMAK_PANEL_PASSWORD:-}"
  if [ "$YES" != "1" ]; then
    printf "پیامک‌پنل — نام کاربری پنل (خالی = بدون پیامک واقعی): "
    read -r SMS_USER
    if [ -n "$SMS_USER" ]; then
      printf "APIKey پنل (کلید صفحهٔ ApiSetting؛ جایگزین گذرواژه): "; read -rs SMS_KEY; echo
      printf "شمارهٔ خط ارسال (مثلاً 3000...): "; read -r SMS_SENDER
    fi
  fi

  {
    echo "DATABASE_URL=$DB_URL"
    echo "APP_ENCRYPTION_KEY=$ENC_KEY"
    echo "BOOTSTRAP_SETUP_CODE=$BOOT_CODE"
    [ -n "$SMTP_HOST" ] && echo "SMTP_HOST=$SMTP_HOST"
    [ -n "$SMTP_PORT" ] && echo "SMTP_PORT=$SMTP_PORT"
    [ -n "$SMTP_USER" ] && echo "SMTP_USER=$SMTP_USER"
    [ -n "$SMTP_PASS" ] && echo "SMTP_PASS=$SMTP_PASS"
    [ -n "$SMTP_FROM" ] && echo "SMTP_FROM=$SMTP_FROM"
    [ -n "$SMS_USER" ] && echo "PAYAMAK_PANEL_USERNAME=$SMS_USER"
    [ -n "$SMS_KEY" ] && echo "PAYAMAK_PANEL_API_KEY=$SMS_KEY"
    [ -n "$SMS_SENDER" ] && echo "PAYAMAK_PANEL_SENDER=$SMS_SENDER"
    [ -n "$SMS_PASS" ] && echo "PAYAMAK_PANEL_PASSWORD=$SMS_PASS"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env ساخته شد (دسترسی 600)."
fi

# ---------- ۴) نصب وابستگی‌ها ----------
if [ "$SKIP_NPM" = "1" ]; then
  warn "نصب وابستگی‌ها پرش شد (--skip-npm)."
elif [ -d node_modules/next ] && [ "$FORCE_NPM" != "1" ] && [ "$MODE" = "update" ]; then
  ok "node_modules موجود است؛ نصب مجدد لازم نیست (--force-npm برای اجبار)."
else
  say "نصب وابستگی‌ها (npm ci --omit=dev) — ممکن است چند دقیقه طول بکشد..."
  if npm ci --omit=dev --no-audit --no-fund; then
    ok "وابستگی‌ها نصب شد."
  else
    warn "npm ci ناموفق بود؛ تلاش با آینهٔ npm (registry.npmmirror.com)..."
    npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com \
      || npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com \
      || die "نصب وابستگی‌ها ناموفق ماند. دسترسی خروجی هاست به npm را با پشتیبانی چک کنید."
    ok "وابستگی‌ها نصب شد (آینهٔ جایگزین)."
  fi
fi
[ -d node_modules/pg ] || die "پکیج pg نصب نشده است؛ نصب npm کامل نبوده."

# ---------- ۵) مایگریشن دیتابیس ----------
say "اعمال مایگریشن‌های دیتابیس..."
"$NODE_BIN" scripts/apply-migrations.mjs
ok "دیتابیس آماده است."

# ---------- ۶) ثبت اپ در cPanel و ری‌استارت ----------
mkdir -p tmp
touch tmp/restart.txt
ok "سیگنال ری‌استارت Passenger صادر شد (tmp/restart.txt)."

HOME_DIR="${HOME:-$(cd .. && pwd)}"
case "$APP_DIR" in "$HOME_DIR"/*) APP_REL="${APP_DIR#"$HOME_DIR"/}" ;; *) APP_REL="$APP_DIR" ;; esac
APP_NAME="$(basename "$APP_DIR")"

register_via_uapi() {
  command -v uapi >/dev/null 2>&1 || return 1
  local out
  out="$(uapi --output=json PassengerApps register_application \
        name="$APP_NAME" domain="$DOMAIN_ARG" app_root="$APP_REL" \
        startup_file="server.js" 2>&1)" || { warn "UAPI: $out"; return 1; }
  if printf '%s' "$out" | grep -q '"errors": *\[\]'; then
    ok "اپ از طریق UAPI در cPanel ثبت شد."
    return 0
  fi
  warn "پاسخ UAPI: $out"
  return 1
}

write_htaccess() {
  local ht="$1" block
  [ -d "$(dirname "$ht")" ] || { warn "پوشهٔ docroot وجود ندارد: $(dirname "$ht")"; return 1; }
  if [ -f "$ht" ] && grep -q "PassengerAppRoot" "$ht"; then
    ok ".htaccess از قبل اپ را به Passenger معرفی می‌کند — دست نخورد."
    return 0
  fi
  [ -f "$ht" ] && cp "$ht" "$ht.noor-backup-$(date +%s)"
  block="$(cat <<BLOCK
# --- noor-installer: begin ---
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}/\$1 [R=301,L]
</IfModule>
PassengerBaseURI /
PassengerAppRoot $APP_DIR
PassengerAppType node
PassengerStartupFile server.js
# --- noor-installer: end ---
BLOCK
)"
  printf '%s\n' "$block" >> "$ht"
  ok "بلوک Passenger به $ht اضافه شد (بکاپ کنار فایل)."
}

if [ "$MODE" = "install" ]; then
  DOMAIN="$DOMAIN_ARG"; DOCROOT="$DOCROOT_ARG"
  if [ "$YES" != "1" ]; then
    printf "دامنهٔ سامانه (مثلاً noor.example.ir) [خالی = رد شدن ثبت خودکار]: "
    read -r DOMAIN
    if [ -n "$DOMAIN" ]; then
      printf "مسیر docroot همان دامنه [$HOME_DIR/public_html]: "
      read -r DOCROOT; DOCROOT="${DOCROOT:-$HOME_DIR/public_html}"
    fi
  fi
  REGISTERED=0
  if [ -n "$DOMAIN" ]; then
    if register_via_uapi; then REGISTERED=1
    else write_htaccess "$DOCROOT/.htaccess" && REGISTERED=1
    fi
  fi
  if [ "$REGISTERED" != "1" ]; then
    warn "ثبت خودکار انجام نشد — یک‌بار این مقادیر را در cPanel وارد کنید:"
    printf '     cPanel → Setup Node.js App → Create Application\n'
    printf '       Node.js version:        20 یا بالاتر\n'
    printf '       Application mode:       Production\n'
    printf '       Application root:       %s\n' "$APP_REL"
    printf '       Application URL:        دامنهٔ شما\n'
    printf '       Application startup file: server.js\n'
    printf '     سپس دکمهٔ Create و بعد Restart را بزنید.\n'
  fi
fi

# ---------- ۷) خلاصهٔ نهایی ----------
BOOT_PRINT="$(get_env_key BOOTSTRAP_SETUP_CODE)"
SMTP_SET="$(get_env_key SMTP_HOST)"
printf '\n'
printf "${C_G}=====================================================${C_0}\n"
printf "  نصب کامل شد!\n"
printf "${C_G}=====================================================${C_0}\n"
printf '  ۱) سایت را باز کنید؛ باید صفحهٔ ورود بیاید.\n'
printf '  ۲) برای ساخت ادمین اول: آدرس /setup و کد زیر:\n\n     %s\n\n' "$BOOT_PRINT"
printf '  ۳) مهم! بعد از ساخت ادمین، خط BOOTSTRAP_SETUP_CODE را از .env حذف و در Node.js App دکمهٔ Restart را بزنید (یا: touch tmp/restart.txt).\n'
if [ -z "$SMTP_SET" ]; then
  printf '  ۴) SMTP تنظیم نشده؛ پیام‌ها فعلاً در «صندوق پیام‌ها» (/outbox) ذخیره می‌شوند. برای ارسال واقعی، SMTP_HOST و ... را در .env بگذارید و touch tmp/restart.txt بزنید.\n'
else
  printf '  ۴) SMTP تنظیم است. SPF/DKIM دامنه را در cPanel → Email Deliverability فعال کنید.\n'
fi
SMS_SET="$(get_env_key PAYAMAK_PANEL_USERNAME)"
if [ -n "$SMS_SET" ]; then
  printf '  پ) پیامک‌پنل تنظیم است (کاربر %s) — یادآورها و پیام گروهی واقعاً پیامک می‌روند.\n' "$SMS_SET"
else
  printf '  پ) پیامک تنظیم نشده؛ پیامک‌ها در «صندوق پیام‌ها» ذخیره می‌شوند. برای ارسال واقعی PAYAMAK_PANEL_USERNAME / PAYAMAK_PANEL_API_KEY / PAYAMAK_PANEL_SENDER را در .env بگذارید و touch tmp/restart.txt بزنید.\n'
fi
printf '  ۵) HTTPS حتماً فعال باشد (AutoSSL) — ورود بدون HTTPS کار نمی‌کند.\n'
printf '  به‌روزرسانی نسخهٔ بعدی: bash install.sh --update\n'
