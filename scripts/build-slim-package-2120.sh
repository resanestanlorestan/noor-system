#!/usr/bin/env bash
# بستهٔ اسلیم استقرار ۲.۱۲.۰ — چیدمان پروژه در ریشهٔ مخزن (src/ در /home/z/my-project)
set -euo pipefail
SRC=/home/z/my-project
STAGE=/tmp/slim-2120
OUT=/home/z/my-project/download/noor-slim-2120.zip
SNIPPET=/home/z/my-project/scripts/embed-env-snippet.js

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/noor-system"
cd "$STAGE/noor-system"

# 1) کل پروژه (سورس + نصاب + درایور دیتابیس) بدون پوشه‌های سنگین و اسرار محلی
rsync -a --exclude node_modules --exclude .next --exclude .git \
      --exclude .env --exclude .private-app --exclude '*.log' \
      --exclude tsconfig.tsbuildinfo \
      --exclude upload --exclude download --exclude pgtmp --exclude pgdata --exclude scripts/pg-tools --exclude noor-system --exclude skills --exclude tests --exclude scripts-recovered \
      "$SRC"/ ./

# 2) زمان اجرای standalone (node_modules ردیابی‌شده + سرور کامپایل‌شده)
mkdir -p .next
cp -a "$SRC/.next/standalone" .next/standalone
rm -rf .next/standalone/.private-app

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

# 5) zip
cd "$STAGE"
zip -rq "$OUT" noor-system
echo "=== package contents sanity ==="
ls noor-system | head -8
ls noor-system/.next/standalone/.next/static >/dev/null && echo "STATIC OK"
ls noor-system/node_modules >/dev/null 2>&1 && echo "STRAY node_modules AT ROOT (bad)" || echo "no root node_modules (good)"
echo "=== sizes ==="
du -sh "$STAGE/noor-system"
ls -lh "$OUT"
