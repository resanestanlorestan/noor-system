#!/usr/bin/env bash
# پشتیبان‌گیری تولیدی پایگاه داده سامانه نور (Release 2.4 — فاز ۴)
#
# ویژگی‌ها:
#   • pg_dump با قالب custom (-Fc) — بازیابی سریع و انتخابی با pg_restore
#   • فایل checksum SHA-256 برای هر نسخه
#   • نگهداری ۱۴ نسخه اخیر (بقیه خودکار حذف می‌شوند)
#   • فایل نشانگر .private-app/last-backup برای کارت «آخرین پشتیبان موفق» داشبورد
#   • ثبت رویداد «production_backup» در جدول audit_logs
#
# اجرای دستی:
#   DATABASE_URL="postgresql://..." bash scripts/backup-production.sh
#
# کرون cPanel (Cron Jobs) — روزانه ساعت ۰۳:۱۵:
#   15 3 * * * cd /home/USER/noor-system && set -a && . ./.env && set +a && bash scripts/backup-production.sh >> backups/cron.log 2>&1
#
# متغیرهای override (برای تست): PG_DUMP، PSQL، BACKUP_DIR، APP_PRIVATE_DIR، BACKUP_KEEP
set -euo pipefail

PG_DUMP="${PG_DUMP:-pg_dump}"
PSQL="${PSQL:-psql}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
MARKER_DIR="${APP_PRIVATE_DIR:-.private-app}"
KEEP="${BACKUP_KEEP:-14}"

: "${DATABASE_URL:?DATABASE_URL is not set — .env را بارگذاری کنید}"

mkdir -p "$BACKUP_DIR" "$MARKER_DIR"
STAMP="$(date +%Y%m%d-%H%M%S%3N 2>/dev/null || date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/noor-$STAMP.dump"
START_MS="$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')"

echo "[backup] dumping to $FILE ..."
"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_URL"

# checksum
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256")
  SHA256="$(cut -d' ' -f1 "$FILE.sha256")"
else
  SHA256="unavailable"
fi

SIZE="$(wc -c < "$FILE" | tr -d ' ')"
END_MS="$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')"
DURATION=$(( END_MS - START_MS ))

# marker file for the dashboard widget («آخرین پشتیبان موفق»)
cat > "$MARKER_DIR/last-backup" <<JSON
{ "ok": true, "at": "$(date -Iseconds)", "file": "$FILE", "sizeBytes": $SIZE, "sha256": "$SHA256", "durationMs": $DURATION, "retention": $KEEP }
JSON

# audit trail (best effort — never breaks the backup itself)
"$PSQL" "$DATABASE_URL" -q -c "insert into audit_logs (action, target_type, detail) values ('production_backup', 'system', '$FILE ($SIZE bytes, sha256 ${SHA256:0:12}…)')" 2>/dev/null || true

# retention: keep the newest $KEEP dumps (and their checksums)
ls -1t "$BACKUP_DIR"/noor-*.dump 2>/dev/null | tail -n +$(( KEEP + 1 )) | while read -r old; do
  rm -f "$old" "$old.sha256"
done

echo "[backup] OK — $FILE ($SIZE bytes, ${DURATION}ms, sha256 ${SHA256:0:12}…)"
echo "[backup] marker written to $MARKER_DIR/last-backup"
