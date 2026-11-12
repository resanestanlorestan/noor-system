#!/usr/bin/env bash
# دود تست ورود برای هر ۶ نقش سامانه نور (Release 2)
# برای هر نقش: ورود واقعی با فرم → دریافت کوکی نشست → بازدید صفحات کلیدی نقش
set -u
BASE="${1:-http://localhost:3000}"
JAR_DIR=$(mktemp -d)
trap 'rm -rf "$JAR_DIR"' EXIT
PASS=0; FAIL=0

login() { # $1=email $2=password $3=jar-file
  # ۱) گرفتن فرم ورود برای csrf/state طبیعی
  curl -s -c "$3" -o /dev/null "$BASE/login"
  # ۲) ارسال Server Action ورود به صورت form-data استاندارد
  local resp code
  resp=$(curl -s -b "$3" -c "$3" -o /dev/null -w "%{http_code}|%{redirect_url}" \
    -X POST "$BASE/login" \
    -H "Origin: $BASE" \
    -F "email=$1" -F "password=$2" --max-time 15)
  code="${resp%%|*}"
  [ "$code" = "200" ] || [ "$code" = "303" ] || [ "$code" = "307" ] || return 1
  # نشست معتبر؟
  curl -s -b "$3" -o /dev/null -w "%{http_code}" "$BASE/dashboard" --max-time 10 | grep -q 200
}

check_page() { # $1=jar $2=url $3=label
  local code
  code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$BASE$2" --max-time 15)
  if [ "$code" = "200" ]; then echo "  ✓ $3"; PASS=$((PASS+1));
  else echo "  ✗ $3 → HTTP $code"; FAIL=$((FAIL+1)); fi
}

role_smoke() { # $1=نام نقش $2=email $3=password $4..=صفحات
  local name="$1" email="$2" pass="$3"; shift 3
  local jar="$JAR_DIR/$name.jar"
  if login "$email" "$pass" "$jar"; then
    echo "✓ ورود $name ($email)"
    PASS=$((PASS+1))
    local page
    for page in "$@"; do
      check_page "$jar" "${page%%|*}" "${page##*|}"
    done
  else
    echo "✗ ورود $name ($email) ناموفق"
    FAIL=$((FAIL+1))
  fi
}

echo "──── دود تست ۶ نقش — $(date '+%H:%M:%S') ────"
role_smoke super_admin  admin@noor.local       "NoorAdmin2026!x" \
  "/dashboard|داشبورد مدیر کل" "/users|کاربران" "/reports|گزارش‌ها" "/permissions|ماتریس دسترسی" "/audit|ممیزی" "/settings|تنظیمات"
role_smoke province_admin province@noor.local "Province2026!x" \
  "/dashboard|داشبورد استان" "/cases|پرونده‌ها" "/reports|گزارش استان"
role_smoke county_admin county@noor.local     "County2026!x" \
  "/dashboard|داشبورد شهرستان" "/cases|پرونده‌های شهرستان"
role_smoke reviewer     reviewer@noor.local    "Reviewer2026!x" \
  "/dashboard|داشبورد کارشناس ارزیاب" "/cases|صف بررسی"
role_smoke specialist   specialist@noor.local  "Specialist2026!x" \
  "/dashboard|داشبورد کارشناس" "/cases|پرونده‌های تخصصی"
role_smoke activist     activist@noor.local    "Activist2026!x" \
  "/dashboard|داشبورد فعال" "/account|حساب من"
role_smoke anonymous    no-session             "" # فقط صفحات عمومی
check_page /dev/null "/login" "صفحه ورود (مهمان)"
check_page /dev/null "/register" "ثبت‌نام (مهمان)"
check_page /dev/null "/api/health" "health endpoint"
echo "──────────────────────────────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
