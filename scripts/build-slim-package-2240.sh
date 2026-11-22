#!/usr/bin/env bash
# Assemble the slim standalone deployment package for 2.24.0 (500MB-quota hosts)
# Adapted from build-slim-package-2200.sh — 2.22.0 moves the reference-data delete
# UI; CSS gate checks the new .list-remove rules alongside the navy sidebar.
set -euo pipefail
SRC=/home/z/my-project
STAGE=/tmp/slim-2240
OUT=/home/z/my-project/download/noor-slim-2.24.0.zip
SNIPPET=/home/z/my-project/scripts/embed-env-snippet.js

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/noor-system"
cd "$STAGE/noor-system"

# 1) full repo (source + installer + migrations), no heavy dirs
rsync -a --exclude node_modules --exclude .next --exclude .git \
      --exclude .env --exclude .private-app --exclude '*.log' \
      --exclude tsconfig.tsbuildinfo --exclude "scripts/pg-tools/data" --exclude upload --exclude download \
      --exclude skills --exclude 'scripts/deploy-*' \
      "$SRC"/ ./

# 2) standalone runtime (traced node_modules + compiled server)
mkdir -p .next
cp -a "$SRC/.next/standalone" .next/standalone
# 2b) NEVER ship local runtime secrets; the host keeps its own .private-app.
rm -rf .next/standalone/.private-app
# 2c) Next standalone copies .env into the bundle — strip every env file
# (except the example) so the deploy gate "protected file inside zip" passes.
find .next/standalone -name '.env*' -not -name '.env.example' -delete
find . -name '.htaccess' -delete

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
    if (m && !line.trim().startsWith("#")) {
      // .env wins over inherited env — LiteSpeed persists stale vars at exec
      // time (2.20.0 incident: old DATABASE_URL password shadowed .env).
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch (e) { /* no .env — rely on cPanel env vars */ }
require("./.next/standalone/server.js");
WRAPPER

# 4b) ALSO embed the env loader inside the standalone server itself —
# the app must never depend on the outer wrapper for env loading.
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
echo "=== 2.21.0 css gates: navy sidebar + list-remove delete buttons ==="
grep -c "0e2148" noor-system/src/app/workspace.css && echo "CSS NAVY OK"
grep -c "list-remove" noor-system/src/app/workspace.css && echo "CSS LIST-REMOVE OK"
echo "=== 2.21.0 code gates: delete actions present ==="
grep -c "deleteCountyAction" noor-system/src/app/actions/management.ts && echo "DELETE ACTIONS OK"
echo "=== version gate ==="
grep '"version"' noor-system/package.json
echo "=== sizes ==="
du -sh "$STAGE/noor-system"
ls -lh "$OUT"
echo "SHA256:"
sha256sum "$OUT"

grep -c "deleteSpecialtyAction" noor-system/src/components/specialties-manager.tsx >/dev/null && echo "SPECIALTY DELETE UI OK"
grep -c "specialtyUsageParts" noor-system/src/lib/specialty-usage.ts >/dev/null && echo "SPECIALTY USAGE GUARD OK"
