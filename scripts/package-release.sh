#!/usr/bin/env bash
# بسته‌بندی انتشار «سامانه نور» — نسخه Release 2
#   خروجی ۱: download/noor-cpanel-installer.zip  (کد + بیلد آماده + مایگریشن‌ها + نصب‌کننده)
#   خروجی ۲: download/noor-system-developed.zip  (فقط سورس، بدون بیلد)
set -euo pipefail

SRC="/home/z/my-project/noor-system"
OUT="/home/z/my-project/download"
PARENT="/home/z/my-project"

cd "$SRC"

# --- پیش‌شرط: بیلد تازه
[ -f .next/BUILD_ID ] || { echo "ERROR: .next missing — run npm run build first"; exit 1; }
echo "BUILD_ID: $(cat .next/BUILD_ID)"

# --- پاک‌سازی بیلدهای موقت سنگین
rm -rf .next/cache 2>/dev/null || true
rm -f tsconfig.tsbuildinfo 2>/dev/null || true

# --- ۱) بسته نصب‌کنندهٔ cPanel (کامل با بیلد) — از پوشهٔ والد تا مسیرها با پیشوند noor-system/ باشند
rm -f "$OUT/noor-cpanel-installer.zip"
cd "$PARENT"
zip -qr "$OUT/noor-cpanel-installer.zip" noor-system \
  -x "noor-system/node_modules/*" -x "noor-system/.git/*" -x "noor-system/.env" \
  -x "noor-system/.private-app/*" -x "noor-system/.next/cache/*" -x "noor-system/.next/dev/*" \
  -x "noor-system/*.log" -x "noor-system/.DS_Store" -x "noor-system/tsconfig.tsbuildinfo"

# --- ۲) بسته سورس (بدون .next)
rm -f "$OUT/noor-system-developed.zip"
zip -qr "$OUT/noor-system-developed.zip" noor-system \
  -x "noor-system/node_modules/*" -x "noor-system/.git/*" -x "noor-system/.env" \
  -x "noor-system/.private-app/*" -x "noor-system/.next/*" \
  -x "noor-system/*.log" -x "noor-system/.DS_Store" -x "noor-system/tsconfig.tsbuildinfo"

echo "─────────── محتوای کلیدی نصب‌کننده ───────────"
unzip -l "$OUT/noor-cpanel-installer.zip" | grep -E "drizzle/000[0-9]|\.next/BUILD_ID|install\.sh$|server\.js$|apply-migrations" | awk '{print $4}' | sort -u
echo "─────────── حجم ───────────"
ls -la "$OUT"/*.zip
