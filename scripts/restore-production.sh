#!/usr/bin/env bash
# بازیابی تولیدی پایگاه داده سامانه نور (Release 2.4 — فاز ۴)
#
# استفاده:
#   bash scripts/restore-production.sh <dump-file> --verify   # فقط بررسی صحت فایل
#   bash scripts/restore-production.sh <dump-file>            # بازیابی واقعی (نیازمند تأیید)
#
# نکته‌ها:
#   • قبل از بازیابی، checksum فایل (.sha256) کنترل می‌شود.
#   • بازیابی با --clean --if-exists انجام می‌شود؛ یعنی اشیای موجود حذف و از نو ساخته
#     می‌شوند. مدارک خصوصی روی دیسک (.private-app/uploads) بخشی از این اسکریپت نیستند —
#     مستندات کامل در docs/BACKUP-RESTORE.md.
#   • برای اجرای بدون پرامپت (اتوماسیون): RESTORE_CONFIRM=yes
set -euo pipefail

PG_RESTORE="${PG_RESTORE:-pg_restore}"
DUMP="${1:-}"
MODE="${2:-}"

usage() { echo "usage: scripts/restore-production.sh <dump-file> [--verify]"; exit 1; }
[ -n "$DUMP" ] || usage
[ -f "$DUMP" ] || { echo "خطا: فایل $DUMP یافت نشد."; exit 1; }

# ۱) checksum
if [ -f "$DUMP.sha256" ]; then
  EXPECTED="$(cut -d' ' -f1 "$DUMP.sha256")"
  ACTUAL="$(sha256sum "$DUMP" | cut -d' ' -f1)"
  if [ "$EXPECTED" = "$ACTUAL" ]; then
    echo "[restore] checksum OK"
  else
    echo "خطا: checksum فایل هم‌خوانی ندارد — فایل خراب یا دستکاری‌شده است."; exit 1
  fi
else
  echo "[restore] هشدار: فایل checksum یافت نشد؛ بدون کنترل صحت ادامه می‌دهیم."
fi

# ۲) verify mode — ساختار dump بدون تغییر دیتابیس
if [ "$MODE" = "--verify" ]; then
  if "$PG_RESTORE" --list "$DUMP" >/dev/null 2>&1; then
    TABLES="$("$PG_RESTORE" --list "$DUMP" 2>/dev/null | grep -c 'TABLE DATA' || true)"
    echo "VERIFY-OK — dump سالم است ($TABLES بخش داده جدولی)."
    exit 0
  else
    echo "خطا: pg_restore نتوانست ساختار dump را بخواند."; exit 1
  fi
fi

# ۳) بازیابی واقعی
: "${DATABASE_URL:?DATABASE_URL is not set — .env را بارگذاری کنید}"
if [ "${RESTORE_CONFIRM:-no}" != "yes" ]; then
  echo "هشدار: محتوای کامل دیتابیس مقصد با فایل پشتیبان جایگزین می‌شود."
  read -r -p "برای ادامه دقیقاً «بله» را بنویسید: " ANSWER
  [ "$ANSWER" = "بله" ] || { echo "لغو شد."; exit 1; }
fi

echo "[restore] restoring $DUMP ..."
"$PG_RESTORE" --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DUMP"
echo "[restore] OK — بازیابی کامل شد. سرویس Node را ری‌استارت کنید تا استخر اتصالات تازه شود."
