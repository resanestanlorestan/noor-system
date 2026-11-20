#!/usr/bin/env bash
# شناسایی مرحلهٔ ۳ — با فاصله‌گذاری و تلاش مجدد برای پرهیز از ضدربات
set -u
cd /home/z/my-project/scripts
SLEEP=6
RETRY=4

withretry() { # cpapi.sh args...
  local n=0
  while [ $n -lt $RETRY ]; do
    local out
    out=$("$@" 2>/dev/null)
    if [ -n "$out" ]; then echo "$out"; return 0; fi
    n=$((n+1)); sleep $((SLEEP*2))
  done
  echo "EMPTY_AFTER_RETRIES"
}

echo "== host app version =="
withretry bash cpread.sh /home/epqoisdl/noor-system package.json 400 | python3 -c 'import sys,re;m=re.search(r"\"version\":\s*\"([^\"]+)\"",sys.stdin.read());print("version:",m.group(1) if m else "UNKNOWN")'
sleep $SLEEP

echo "== .env keys (masked) =="
withretry bash cpread.sh /home/epqoisdl/noor-system .env 800 | python3 -c 'import sys
ls=[l for l in sys.stdin.read().splitlines() if "=" in l and l.strip()]
for l in ls: print("  ", l.split("=")[0]+"=***") or print("  (none)") if not ls else None'

echo "== cron lines (masked) =="
withretry bash cpuapi-cron.sh listlines | python3 -c 'import sys,json,re
s=sys.stdin.read().strip()
try:
  d=json.loads(s)
  rows=(d.get("data") or {}).get("lines") or d.get("data") or []
  if isinstance(rows,dict): rows=[rows]
  for c in rows: print("  ", re.sub(r"[A-Za-z0-9_\-]{14,}","***",str(c.get("command") or c)))
  if not rows: print("  (no cron)")
except Exception as e: print("  RAW:",re.sub(r"[A-Za-z0-9_\-]{14,}","***",s[:400]))'
sleep $SLEEP

echo "== public_html/.htaccess (SetEnv masked) =="
withretry bash cpread.sh /home/epqoisdl/public_html .htaccess 6000 | python3 -c 'import sys,re
c=sys.stdin.read()
print(re.sub(r"(SetEnv\s+\S+\s+)(\S+)",r"\1***MASKED***",re.sub(r"(token=|TOKEN=|KEY=|SECRET=|PASSWORD=)[A-Za-z0-9_\-]+",r"\1***",c))[:3000] if c.strip() else "(none)")'
sleep $SLEEP

echo "== stub deploy-9f3c1a.php =="
withretry bash cpread.sh /home/epqoisdl/public_html deploy-9f3c1a.php 500
sleep $SLEEP

echo "== diag-temp on host =="
withretry bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl/noor-system/scripts/diag-temp&show_hidden=1' | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin);rows=d.get("data") or []
  [print("  ",f["type"][:1],f.get("humansize",""),f["file"]) for f in rows] or print("  (empty)")
except Exception: print("  LIST_FAILED")'

echo "== home: zips + markers =="
withretry bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl&show_hidden=1&limit=2000' | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  rows=[f for f in (d.get("data") or []) if f["type"]=="f" and (f["file"].endswith(".zip") or "done" in f["file"] or f["file"].startswith("noor-slim"))]
  [print("  ",f.get("humansize",""),f["file"]) for f in rows]
except Exception: print("  LIST_FAILED")'

echo "== recon3 done =="
