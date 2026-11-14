#!/usr/bin/env bash
# دود تست رویدادها (Release 2.4 — فاز ۲): دسترسی صفحه، گارد نقش‌ها و کرون یادآور
# پیش‌نیاز: dev server روی BASE با .env شامل CRON_SECRET و دیتابیس توسعه
set -u
BASE="${1:-http://localhost:3000}"
JAR_DIR=$(mktemp -d)
trap 'rm -rf "$JAR_DIR"' EXIT
PASS=0; FAIL=0
KEY=$(grep -E '^CRON_SECRET=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)

login() { # $1=email $2=password $3=jar-file
  curl -s -c "$3" -o /dev/null "$BASE/login"
  local resp code
  resp=$(curl -s -b "$3" -c "$3" -o /dev/null -w "%{http_code}|%{redirect_url}" \
    -X POST "$BASE/login" -H "Origin: $BASE" -F "email=$1" -F "password=$2" --max-time 15)
  code="${resp%%|*}"
  [ "$code" = "200" ] || [ "$code" = "303" ] || [ "$code" = "307" ] || return 1
  curl -s -b "$3" -o /dev/null -w "%{http_code}" "$BASE/dashboard" --max-time 10 | grep -q 200
}

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

check_page() { # $1=jar $2=url $3=label
  local code; code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$BASE$2" --max-time 15)
  [ "$code" = "200" ] && ok "$3" || bad "$3 → HTTP $code"
}

check_redirect() { # $1=jar $2=url $3=label (انتظار ریدایرکت ۳۰x)
  local code; code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$BASE$2" --max-time 15)
  case "$code" in 30[127]) ok "$3";; *) bad "$3 → HTTP $code (انتظار ریدایرکت)";; esac
}

has_text() { # $1=jar $2=url $3=text $4=label
  if curl -s -b "$1" "$BASE$2" --max-time 20 | grep -q "$3"; then ok "$4"; else bad "$4 (متن یافت نشد: $3)"; fi
}

echo "──── دود تست رویدادها — $(date '+%H:%M:%S') ────"

SUPER="$JAR_DIR/super.jar"; PROV="$JAR_DIR/prov.jar"; COUNTY="$JAR_DIR/county.jar"; REV="$JAR_DIR/rev.jar"; ACT="$JAR_DIR/act.jar"

login super@noor.local "NoorAdmin2026!x" "$SUPER" && ok "ورود مدیر کل" || bad "ورود مدیر کل"
login province@noor.local "Province2026!x" "$PROV" && ok "ورود مدیر استان" || bad "ورود مدیر استان"
login county@noor.local "County2026!x" "$COUNTY" && ok "ورود مدیر شهرستان" || bad "ورود مدیر شهرستان"

check_page "$SUPER" "/events" "صفحه رویدادها برای مدیر کل"
has_text "$SUPER" "/events" "رویدادهای قرآنی" "عنوان صفحه رویدادها"
has_text "$SUPER" "/events" "تقویم" "تقویم ماه جاری"
has_text "$SUPER" "/events" "رویدادهای پیش رو" "بخش رویدادهای پیش رو"
check_page "$PROV" "/events" "صفحه رویدادها برای مدیر استان"
check_page "$COUNTY" "/events" "صفحه رویدادها برای مدیر شهرستان"

login reviewer@noor.local "Reviewer2026!x" "$REV"
check_redirect "$REV" "/events" "کارشناس بررسی به رویدادها دسترسی ندارد"
login activist@noor.local "Activist2026!x" "$ACT"
check_redirect "$ACT" "/events" "فعال قرآنی به رویدادها دسترسی ندارد"
check_redirect /dev/null "/events" "مهمان به ورود هدایت می‌شود"

# --- کرون یادآور رویدادها ---
if [ -n "$KEY" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/events" --max-time 15)
  [ "$code" = "401" ] && ok "کرون بدون کلید → ۴۰۱" || bad "کرون بدون کلید → $code"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/events?key=WRONG-KEY" --max-time 15)
  [ "$code" = "401" ] && ok "کرون با کلید نادرست → ۴۰۱" || bad "کرون با کلید نادرست → $code"
  body=$(curl -s "$BASE/api/cron/events?key=$KEY" --max-time 30)
  echo "$body" | grep -q '"ok":true' && ok "کرون با کلید درست → ok:true" || bad "کرون با کلید درست → $body"
  echo "$body" | grep -q '"considered"' && ok "خروجی JSON خلاصه یادآور" || bad "خروجی JSON ناقص"
else
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/events?key=whatever" --max-time 15)
  [ "$code" = "404" ] && ok "کرون بدون CRON_SECRET غیرفعال (۴۰۴)" || bad "کرون بدون CRON_SECRET → $code"
fi

echo "──────────────────────────────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
