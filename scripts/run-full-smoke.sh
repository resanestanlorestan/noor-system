#!/usr/bin/env bash
# باتری کامل دود تست سامانه نور — یک دستور، پنج اسموک:
#   ۱) smoke-all-roles.sh       — ورود و صفحات کلیدی همه نقش‌ها
#   ۲) smoke-events.sh          — رویدادها + گارد نقش + کرون یادآور رویداد
#   ۳) smoke-exports.sh         — خروجی معوق‌ها + بانک پرونده‌ها
#   ۴) smoke-ranking.sh         — رتبه‌بندی فعالان
#   ۵) smoke-backup-widget.sh   — کارت «آخرین پشتیبان موفق» داشبورد
# استفاده: bash scripts/run-full-smoke.sh [BASE]
# پیش‌نیاز: dev server در حال اجرا با دیتابیس توسعه و داده نمونه (scripts/seed*.ts)
set -u
BASE="${1:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
declare -A RESULTS
OVERALL=0

run_smoke() { # $1=نام $2=فایل
  echo
  echo "═══════════ $1 ═══════════"
  if bash "$SCRIPT_DIR/$2" "$BASE"; then RESULTS[$1]="✓ SMOKE-OK"; else RESULTS[$1]="✗ FAILED"; OVERALL=1; fi
}

run_smoke "همه نقش‌ها"        smoke-all-roles.sh
run_smoke "رویدادها"          smoke-events.sh
run_smoke "خروجی‌های اکسل"    smoke-exports.sh
run_smoke "رتبه‌بندی"          smoke-ranking.sh
run_smoke "کارت پشتیبان"      smoke-backup-widget.sh

echo
echo "═══════════ جمع‌بندی ═══════════"
for key in "همه نقش‌ها" "رویدادها" "خروجی‌های اکسل" "رتبه‌بندی" "کارت پشتیبان"; do
  echo "  ${RESULTS[$key]}  $key"
done
if [ "$OVERALL" = "0" ]; then echo "FULL-SMOKE-OK — همه ۵ اسموک سبز است."; else echo "FULL-SMOKE-FAILED — حداقل یک اسموک قرمز است."; fi
exit $OVERALL
