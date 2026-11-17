#!/usr/bin/env bash
# شناسایی مرحلهٔ ۴ — جزئیات برای چرخش و پاک‌سازی (با فاصله‌گذاری و تلاش مجدد)
set -u
cd /home/z/my-project/scripts
SLEEP=5

withretry() {
  local n=0 out
  while [ $n -lt 4 ]; do
    out=$("$@" 2>/dev/null)
    if [ -n "$out" ]; then echo "$out"; return 0; fi
    n=$((n+1)); sleep $((SLEEP*2))
  done
  echo "EMPTY_AFTER_RETRIES"
}

echo "== .env keys (masked) =="
withretry bash cpread.sh /home/epqoisdl/noor-system .env 1200 | python3 -c 'import sys
ls=[l for l in sys.stdin.read().splitlines() if "=" in l and l.strip() and not l.startswith("<")]
for l in ls: print("  ", l.split("=")[0]+"=***")
if not ls: print("  (none)")'
sleep $SLEEP

echo "== cron raw (UAPI listlines) =="
withretry bash cpuapi-cron.sh listlines | python3 -c 'import sys,json,re
s=sys.stdin.read().strip()
print(re.sub(r"[A-Za-z0-9_\-]{14,}","***",s[:1500]))'
sleep $SLEEP

echo "== cron-setup.log =="
withretry bash cpread.sh /home/epqoisdl cron-setup.log 900 | python3 -c 'import sys,re
print(re.sub(r"[A-Za-z0-9_\-]{14,}","***",sys.stdin.read()[:900]))'
sleep $SLEEP

echo "== crontab.tmp =="
withretry bash cpread.sh /home/epqoisdl crontab.tmp 900 | python3 -c 'import sys,re
print(re.sub(r"[A-Za-z0-9_\-]{14,}","***",sys.stdin.read()[:900]))'
sleep $SLEEP

echo "== public_html/.htaccess (SetEnv values masked) =="
withretry bash cpread.sh /home/epqoisdl/public_html .htaccess 6000 | python3 -c 'import sys,re
c=sys.stdin.read()
if c.startswith("<") or "PARSE_FAIL" in c: print("READ_FAILED"); sys.exit()
print(re.sub(r"(SetEnv\s+\S+\s+)(\S+)",r"\1***MASKED***",re.sub(r"(token=|TOKEN=|KEY=|SECRET=|PASSWORD=)[A-Za-z0-9_\-]+",r"\1***",c))[:3200])'
sleep $SLEEP

echo "== probe-p8k2.php =="
withretry bash cpread.sh /home/epqoisdl/public_html probe-p8k2.php 800 | python3 -c 'import sys,re
print(re.sub(r"[A-Za-z0-9_\-]{14,}","***",sys.stdin.read()[:800]))'
sleep $SLEEP

echo "== index.php (public_html) =="
withretry bash cpread.sh /home/epqoisdl/public_html index.php 600
sleep $SLEEP

echo "== ~/.cpanel listing (PassengerApps registry hunt) =="
withretry bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl/.cpanel&show_hidden=1&limit=200' | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  [print("  ",f["type"][:1],f["file"]) for f in (d.get("data") or [])] or print("  (empty)")
except Exception: print("  LIST_FAILED")'
sleep $SLEEP

echo "== home root: zip/diag/deploy leftovers =="
withretry bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl&show_hidden=1&limit=2000' | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  rows=[f for f in (d.get("data") or []) if f["type"]=="f"]
  print("  total files:", len(rows))
  for f in rows:
    if f["file"].startswith(("noor-slim","diag","deploy","cleanup","cron","crontab","cp-test","embed-env","host","install","update","noor")):
      print("  ", f.get("humansize",""), f["file"])
except Exception: print("  LIST_FAILED")'

echo "== recon4 done =="
