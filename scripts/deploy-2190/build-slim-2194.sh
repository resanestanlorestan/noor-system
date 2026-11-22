#!/usr/bin/env bash
# ساخت بستهٔ اسلیم ۲.۱۹.۱ — همان workflow ۲.۱۸.۶ (تنها تفاوت: TAG و مستثناکردن پوشهٔ خود این دیپلوی)
set -euo pipefail
SRC=/home/z/my-project
TAG=2.19.4
STAGE_ROOT=$(mktemp -d)
STAGE="$STAGE_ROOT/noor-system"
OUT="$SRC/download/noor-slim-$TAG.zip"
mkdir -p "$SRC/download" "$STAGE"

rsync -a \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .private-app --exclude '*.log' \
  --exclude tsconfig.tsbuildinfo \
  --exclude upload --exclude download --exclude pgtmp --exclude pgdata \
  --exclude scripts/pg-tools --exclude scripts/pgserver --exclude scripts/scripts \
  --exclude noor-system --exclude skills --exclude tests --exclude scripts-recovered \
  --exclude attic --exclude tool-results --exclude recovered \
  --exclude 'scripts/cp*.sh' --exclude 'scripts/cp-*.py' --exclude 'scripts/cpuapi*' \
  --exclude scripts/state-read-2180.sh --exclude scripts/upload-2180.sh \
  --exclude scripts/drive-2180.sh --exclude scripts/probe-2180.sh \
  --exclude scripts/cron-read-2180.sh --exclude scripts/fetch-tools-2180.sh \
  --exclude scripts/diag-temp --exclude scripts/bundle-parts-2180 \
  --exclude scripts/deploy-2182 --exclude scripts/deploy-2183 --exclude scripts/deploy-2186 --exclude scripts/deploy-2190 \
  --exclude 'noor-slim-*.zip' \
  "$SRC"/ "$STAGE"/

mkdir -p "$STAGE/.next/standalone/.next/static"
cp -a "$SRC/.next/standalone/." "$STAGE/.next/standalone/"
cp -a "$SRC/.next/static/." "$STAGE/.next/standalone/.next/static/"
rm -rf "$STAGE/.next/standalone/.private-app" "$STAGE/.next/standalone/.env"

# گارد راز: هیچ .env واقعی نباید داخل بسته باشد
FOUND=$(find "$STAGE" -name '.env' -o -name '.env.*' | grep -v '.env.example' | head -5 || true)
if [ -n "$FOUND" ]; then echo "SECRET SCAN FAIL: $FOUND"; exit 1; fi

# گارد نسخه: بسته باید دقیقاً ۲.۱۹.۱ باشد
PKGVER=$(node -e "console.log(require('$STAGE/package.json').version)")
[ "$PKGVER" = "2.19.4" ] || { echo "VERSION MISMATCH: $PKGVER"; exit 1; }

(cd "$STAGE_ROOT" && zip -qr "$OUT" noor-system)
sha256sum "$OUT" | tee "$OUT.sha256"
echo "compiled files: $(find "$STAGE/.next/standalone/node_modules/next/dist/compiled" -type f | wc -l)"
ls -la "$OUT"
