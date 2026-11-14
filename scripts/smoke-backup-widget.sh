#!/usr/bin/env bash
# دود تست کارت «آخرین پشتیبان موفق» داشبورد (Release 2.4 — فاز ۴)
# انتظار: مدیر کل کارت را می‌بیند؛ سایر نقش‌ها نمی‌بینند.
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

SUPER="$JAR_DIR/super.jar"; PROV="$JAR_DIR/prov.jar"; COUNTY="$JAR_DIR/county.jar"; ACT="$JAR_DIR/act.jar"

echo "──── دود تست کارت پشتیبان — $(date '+%H:%M:%S') ────"

login super@noor.local "NoorAdmin2026!x" "$SUPER" && ok "ورود مدیر کل" || bad "ورود مدیر کل"
if curl -s -b "$SUPER" "$BASE/dashboard" --max-time 20 | grep -q "آخرین پشتیبان موفق"; then ok "کارت برای مدیر کل نمایش داده می‌شود"; else bad "کارت پشتیبان برای مدیر کل"; fi
if curl -s -b "$SUPER" "$BASE/dashboard" --max-time 20 | grep -q "backup-production.sh"; then ok "راهنمای اسکریپت در کارت"; else bad "راهنمای اسکریپت پشتیبان"; fi

login province@noor.local "Province2026!x" "$PROV" && ok "ورود مدیر استان" || bad "ورود مدیر استان"
if curl -s -b "$PROV" "$BASE/dashboard" --max-time 20 | grep -q "آخرین پشتیبان موفق"; then bad "کارت نباید برای مدیر استان دیده شود"; else ok "مدیر استان کارت را نمی‌بیند"; fi

login county@noor.local "County2026!x" "$COUNTY" && ok "ورود مدیر شهرستان" || bad "ورود مدیر شهرستان"
if curl -s -b "$COUNTY" "$BASE/dashboard" --max-time 20 | grep -q "آخرین پشتیبان موفق"; then bad "کارت نباید برای مدیر شهرستان دیده شود"; else ok "مدیر شهرستان کارت را نمی‌بیند"; fi

login activist@noor.local "Activist2026!x" "$ACT" && ok "ورود فعال" || bad "ورود فعال"
if curl -s -b "$ACT" "$BASE/dashboard" --max-time 20 | grep -q "آخرین پشتیبان موفق"; then bad "کارت نباید برای فعال دیده شود"; else ok "فعال قرآنی کارت را نمی‌بیند"; fi

echo "──────────────────────────────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
