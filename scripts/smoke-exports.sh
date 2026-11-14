#!/usr/bin/env bash
# دود تست خروجی‌های اکسل (Release 2.4 — فاز ۱): خروجی معوق‌ها + خروجی بانک پرونده‌ها
# پیش‌نیاز: dev server روی BASE و دیتابیس توسعه با داده نمونه
set -u
BASE="${1:-http://localhost:3000}"
JAR_DIR=$(mktemp -d)
trap 'rm -rf "$JAR_DIR"' EXIT
PASS=0; FAIL=0

login() { # $1=email $2=password $3=jar-file
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

download_check() { # $1=jar $2=url $3=label $4=min-bytes
  local headers body size
  headers=$(curl -s -b "$1" -D - -o /tmp/export-check.xlsx "$2" --max-time 30)
  size=$(wc -c < /tmp/export-check.xlsx 2>/dev/null || echo 0)
  if echo "$headers" | grep -qi "spreadsheetml.sheet" && echo "$headers" | grep -q "200 OK" && [ "$size" -ge "${4:-2000}" ]; then
    ok "$3 (${size} bytes)"
  else
    bad "$3 (size=$size; $(echo "$headers" | head -1))"
  fi
}

code_check() { # $1=jar $2=url $3=label $4=expected-code
  local code; code=$(curl -s -b "$1" -o /dev/null -w "%{http_code}" "$2" --max-time 20)
  [ "$code" = "$4" ] && ok "$3" || bad "$3 → HTTP $code (انتظار $4)"
}

SUPER="$JAR_DIR/super.jar"; PROV="$JAR_DIR/prov.jar"; ACT="$JAR_DIR/act.jar"; REV="$JAR_DIR/rev.jar"

echo "──── دود تست خروجی‌ها — $(date '+%H:%M:%S') ────"

login super@noor.local "NoorAdmin2026!x" "$SUPER" && ok "ورود مدیر کل" || bad "ورود مدیر کل"
login province@noor.local "Province2026!x" "$PROV" && ok "ورود مدیر استان" || bad "ورود مدیر استان"
login activist@noor.local "Activist2026!x" "$ACT" && ok "ورود فعال" || bad "ورود فعال"
login reviewer@noor.local "Reviewer2026!x" "$REV" && ok "ورود کارشناس بررسی" || bad "ورود کارشناس بررسی"

code_check /dev/null "$BASE/api/exports/overdue?days=14" "خروجی معوق‌ها بدون نشست → ۴۰۱" 401
code_check "$ACT" "$BASE/api/exports/overdue?days=14" "خروجی معوق‌ها برای فعال → ۴۰۳" 403
code_check "$REV" "$BASE/api/exports/overdue?days=14" "خروجی معوق‌ها برای کارشناس بررسی → ۴۰۳" 403

download_check "$SUPER" "$BASE/api/exports/overdue?days=14" "خروجی معوق‌ها مدیر کل (۱۴ روز)" 2000
download_check "$PROV" "$BASE/api/exports/overdue?days=7" "خروجی معوق‌ها مدیر استان (۷ روز)" 2000
download_check "$SUPER" "$BASE/api/exports/overdue?days=99" "آستانه نامعتبر → پیش‌فرض ۱۴ روز" 2000
download_check "$SUPER" "$BASE/api/cases/export" "خروجی بانک پرونده‌ها (رگرسیون)" 2000

if curl -s -b "$SUPER" "$BASE/reminders" --max-time 20 | grep -q "خروجی اکسل"; then ok "دکمه خروجی اکسل در یادآور معوق‌ها"; else bad "دکمه خروجی اکسل در صفحه یادآور"; fi

# --- دوزیه رسمی پرونده (Release 2.3) ---
CASE_ID=$(curl -s -b "$SUPER" "$BASE/cases" --max-time 20 | grep -oE '/cases/[0-9a-f-]{36}' | head -1 | cut -d/ -f3)
if [ -n "$CASE_ID" ]; then
  code=$(curl -s -b "$SUPER" -o /dev/null -w "%{http_code}" "$BASE/cases/$CASE_ID/dossier" --max-time 20)
  [ "$code" = "200" ] && ok "دوزیه رسمی پرونده برای مدیر کل" || bad "دوزیه رسمی → HTTP $code"
  if curl -s -b "$SUPER" "$BASE/cases/$CASE_ID/dossier" --max-time 20 | grep -q "دوزیه رسمی پرونده قرآنی"; then ok "سربرگ رسمی دوزیه"; else bad "سربرگ دوزیه"; fi
  code=$(curl -s -b "$ACT" -o /dev/null -w "%{http_code}" "$BASE/cases/$CASE_ID/dossier" --max-time 20)
  case "$code" in 30[127]|404) ok "دوزیه پرونده دیگر برای فعال قابل دسترسی نیست";; *) bad "گارد دوزیه برای فعال → $code";; esac
else
  bad "پرونده‌ای برای تست دوزیه یافت نشد"
fi

echo "──────────────────────────────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
