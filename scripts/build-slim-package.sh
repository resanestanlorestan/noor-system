#!/usr/bin/env bash
# Assemble the slim standalone deployment package (for 500MB-quota hosts)
set -euo pipefail
SRC=/home/z/my-project/noor-system
STAGE=/tmp/slim
OUT=/home/z/my-project/download/noor-slim.zip
SNIPPET=/home/z/my-project/scripts/embed-env-snippet.js

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/noor-system"
cd "$STAGE/noor-system"

# 1) full repo (source + installer + migrations), no heavy dirs
rsync -a --exclude node_modules --exclude .next --exclude .git \
      --exclude .env --exclude .private-app --exclude '*.log' \
      --exclude tsconfig.tsbuildinfo \
      "$SRC"/ ./

# 2) standalone runtime (traced node_modules + compiled server)
mkdir -p .next
cp -a "$SRC/.next/standalone" .next/standalone
# 2b) NEVER ship local runtime secrets (bootstrap code / encryption key / dev uploads);
#     the host keeps its own .private-app beside the running standalone server.
rm -rf .next/standalone/.private-app

# 3) static assets into the standalone layout (Next requirement)
mkdir -p .next/standalone/.next/static
cp -a "$SRC/.next/static/." .next/standalone/.next/static/

# 4) slim Passenger entry (loads .env, then delegates to standalone server)
cat > server.js <<'WRAPPER'
// Slim standalone entry (Passenger startup file) — loads .env then runs the
// traced Next standalone server. Full-node path uses the original server.js.
process.env.NODE_ENV = "production";
// Passenger sometimes exports HOSTNAME; standalone binds to it — force all-interfaces.
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

# 4b) ALSO embed the env loader inside the standalone server itself — the
# cPanel Passenger worker renames its process and some hosts ignore restart
# signals, so the app must never depend on the outer wrapper for env loading.
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
