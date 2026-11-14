#!/usr/bin/env bash
# دود تست رتبه‌بندی فعالان (Release 2.4 — فاز ۳): دسترسی صفحه، گارد نقش‌ها و فیلترها
# پیش‌نیاز: dev server روی BASE و دیتابیس توسعه با داده نمونه
set -u
BASE="${1:-http://localhost:3000}"
JAR_DIR=$(mktemp -d)
trap 'rm -rf "$JAR_DIR"' EXIT
PASS=0; FAIL=0

login() {
  curl -s -c "$3" -o /dev/null "$BASE/login"
  local resp code
  resp=$(curl -s -b "$3" -c "$3" -o /dev/null -w "%{http_code}|%{redirect_url}" \
    -X POST "$BASE/login" -H "Origin: $BASE" -F "email=$1" -F "password=$2" --max-time 15)
  code="${resp%%|*}"
  [ "$code" = "200" ] || [ "$code" = "303" ] || [ "$code" = "307" ] || return 1
  curl -s -b "$3" -o /dev/null -w "%{http_code}" "$BASE/dashboard" --max-time 10 | grep -q 200
}
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check_page() { # $1=jar $2=url $3=label
  local code; code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$BASE$2" --max-time 15)
  [ "$code" = "200" ] && ok "$3" || bad "$3 → HTTP $code"
}
check_redirect() {
  local code; code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$BASE$2" --max-time 15)
  case "$code" in 30[127]) ok "$3";; *) bad "$3 → HTTP $code (انتظار ریدایرکت)";; esac
}
has_text() { # $1=jar $2=url $3=text $4=label
  if curl -s -b "$1" "$BASE$2" --max-time 20 | grep -q "$3"; then ok "$4"; else bad "$4 (متن یافت نشد: $3)"; fi
}

SUPER="$JAR_DIR/super.jar"; PROV="$JAR_DIR/prov.jar"; COUNTY="$JAR_DIR/county.jar"; REV="$JAR_DIR/rev.jar"; ACT="$JAR_DIR/act.jar"

echo "──── دود تست رتبه‌بندی — $(date '+%H:%M:%S') ────"

login super@noor.local "NoorAdmin2026!x" "$SUPER" && ok "ورود مدیر کل" || bad "ورود مدیر کل"
login province@noor.local "Province2026!x" "$PROV" && ok "ورود مدیر استان" || bad "ورود مدیر استان"
login county@noor.local "County2026!x" "$COUNTY" && ok "ورود مدیر شهرستان" || bad "ورود مدیر شهرستان"

check_page "$SUPER" "/ranking" "صفحه رتبه‌بندی برای مدیر کل"
has_text "$SUPER" "/ranking" "رتبه‌بندی و امتیاز فعالان قرآنی" "عنوان صفحه رتبه‌بندی"
has_text "$SUPER" "/ranking" "فرمول امتیاز" "نمایش فرمول امتیازدهی"
has_text "$SUPER" "/ranking" "جدول رتبه‌بندی" "جدول رتبه‌بندی"
check_page "$PROV" "/ranking" "صفحه رتبه‌بندی برای مدیر استان"
check_page "$COUNTY" "/ranking" "صفحه رتبه‌بندی برای مدیر شهرستان"
check_page "$PROV" "/ranking?specialtyId=1" "فیلتر تخصص"

login reviewer@noor.local "Reviewer2026!x" "$REV"
check_redirect "$REV" "/ranking" "کارشناس بررسی به رتبه‌بندی دسترسی ندارد"
login activist@noor.local "Activist2026!x" "$ACT"
check_redirect "$ACT" "/ranking" "فعال قرآنی به رتبه‌بندی دسترسی ندارد"
check_redirect /dev/null "/ranking" "مهمان به ورود هدایت می‌شود"

echo "──────────────────────────────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
