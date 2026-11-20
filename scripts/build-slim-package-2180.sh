#!/usr/bin/env bash
# بستهٔ اسلیم استقرار ۲.۱۸.۰ — همان چیدمان ۲۱۲۲ + بهداشت بیشتر:
# بدون attic / tool-results / pgserver / ابزارهای cPanel دارای رمز / standalone .env / diag-temp
set -euo pipefail
SRC=/home/z/my-project
STAGE=/tmp/slim-2180
OUT=$SRC/download/noor-slim-2180.zip
SNIPPET=$SRC/scripts/embed-env-snippet.js

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/noor-system"
cd "$STAGE/noor-system"

# 1) سورس + نصاب + درایور دیتابیس — بدون پوشه‌های سنگین و اسرار
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
  --exclude 'noor-slim-*.zip' \
  "$SRC"/ ./

# 2) زمان اجرای standalone (node_modules ردیابی‌شده + سرور کامپایل‌شده)
mkdir -p .next
cp -a "$SRC/.next/standalone" .next/standalone
rm -rf .next/standalone/.private-app
rm -f .next/standalone/.env

# 3) فایل‌های استاتیک در چیدمان standalone
mkdir -p .next/standalone/.next/static
cp -a "$SRC/.next/static/." .next/standalone/.next/static/

# 4) ورودی Passenger: بارگذاری .env سپس اجرای سرور standalone
cat > server.js <<'WRAPPER'
process.env.NODE_ENV = "production";
delete process.env.HOSTNAME;
const fs = require("fs");
const path = require("path");
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch (e) { /* no .env — rely on cPanel env vars */ }
require("./.next/standalone/server.js");
WRAPPER

# 4b) بارگذار محیط درون خود سرور standalone نیز تزریق می‌شود
node -e '
const fs = require("fs");
const p = process.argv[1] + "/.next/standalone/server.js";
let c = fs.readFileSync(p, "utf8");
if (!c.includes("embedded env loader")) {
  const snippet = fs.readFileSync(process.argv[2], "utf8");
  fs.writeFileSync(p, snippet + c);
  console.log("env loader embedded into standalone/server.js");
} else console.log("env loader already present");
' "$STAGE/noor-system" "$SNIPPET"

# 5) گاردهای بهداشتی — هیچ رازی نباید در بسته باشد
echo "=== secret scan (must be empty) ==="
grep -RIl '3p29A9ttKq' "$STAGE/noor-system" 2>/dev/null | head -5
grep -RIl 'b28f680076c803aceb472d78baafc6f1' "$STAGE/noor-system" 2>/dev/null | head -5
find "$STAGE/noor-system" -name '.env' -o -name '.env.*' | grep -v '.env.example' | head -5
echo "=== scan done ==="

# 6) zip
cd "$STAGE"
zip -rq "$OUT" noor-system
echo "=== package contents sanity ==="
ls noor-system | head -8
ls noor-system/.next/standalone/.next/static >/dev/null && echo "STATIC OK"
ls noor-system/node_modules >/dev/null 2>&1 && echo "STRAY node_modules AT ROOT (bad)" || echo "no root node_modules (good)"
echo "=== sizes ==="
du -sh "$STAGE/noor-system"
ls -lh "$OUT"
sha256sum "$OUT"
