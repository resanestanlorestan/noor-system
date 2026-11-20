#!/usr/bin/env bash
# شناسایی وضعیت هاست برای استقرار ۲.۱۸.۰ — فقط خواندن؛ مقادیر محرمانه ماسک می‌شوند
set -u
API=/home/z/my-project/scripts/cpapi.sh
OUT=/tmp/host-recon-2180
mkdir -p "$OUT"

q() { bash "$API" "$1" "$2" "$3" 2>/dev/null; }

echo "== home files =="
q Fileman list_files 'dir=/home/epqoisdl&show_hidden=1&limit=2000' \
 | python3 -c 'import json,sys;d=json.load(sys.stdin);[print(f["type"][:1],f.get("humansize",""),f["file"]) for f in d.get("data",[])]'

echo "== noor-system top =="
q Fileman list_files 'dir=/home/epqoisdl/noor-system&show_hidden=1&limit=300' \
 | python3 -c 'import json,sys;d=json.load(sys.stdin);[print(f["type"][:1],f.get("humansize",""),f["file"]) for f in d.get("data",[])]'

echo "== diag-temp on host =="
q Fileman list_files 'dir=/home/epqoisdl/noor-system/scripts/diag-temp&show_hidden=1&limit=100' \
 | python3 -c 'import json,sys;d=json.load(sys.stdin);[print(f["type"][:1],f.get("humansize",""),f["file"]) for f in d.get("data",[])] or print("(no diag-temp dir)")'

echo "== public_html =="
q Fileman list_files 'dir=/home/epqoisdl/public_html&show_hidden=1&limit=300' \
 | python3 -c 'import json,sys;d=json.load(sys.stdin);[print(f["type"][:1],f.get("humansize",""),f["file"]) for f in d.get("data",[])]'

echo "== app version on host =="
q Fileman get_file_content 'path=/home/epqoisdl/noor-system/package.json' | head -c 300; echo

echo "== .env keys (values masked) =="
q Fileman get_file_content 'path=/home/epqoisdl/noor-system/.env' \
 | python3 -c 'import json,sys,re;d=json.load(sys.stdin);c=d.get("data",{}).get("content","") if isinstance(d.get("data"),dict) else str(d.get("data",""));print("\n".join(re.sub(r"=(.*)$",r"=***MASKED***",l) for l in c.splitlines()))'

echo "== cron (masked) =="
bash /home/z/my-project/scripts/cpcron.sh listcron \
 | python3 -c 'import json,sys,re;s=sys.stdin.read();
try:
  d=json.loads(s)
except Exception:
  print(s[:300]); sys.exit()
for c in d.get("cpanelresult",{}).get("data",[]):
  line=c.get("command") or " ".join(str(c.get(k,"")) for k in ("minute","hour","day","month","weekday","command"))
  print(c.get("id",""), re.sub(r"[A-Za-z0-9_\-]{16,}","***MASKED***",line))'

echo "== htaccess in noor-system (SetEnv lines masked) =="
q Fileman get_file_content 'path=/home/epqoisdl/noor-system/.htaccess' \
 | python3 -c 'import json,sys,re;d=json.load(sys.stdin);c=d.get("data",{}).get("content","") if isinstance(d.get("data"),dict) else str(d.get("data",""));
print("\n".join(re.sub(r"(SetEnv\s+\S+\s+)(\S+)",r"\1***MASKED***",l) for l in c.splitlines()) if c else "(none)")'

echo "== htaccess in public_html (SetEnv lines masked) =="
q Fileman get_file_content 'path=/home/epqoisdl/public_html/.htaccess' \
 | python3 -c 'import json,sys,re;d=json.load(sys.stdin);c=d.get("data",{}).get("content","") if isinstance(d.get("data"),dict) else str(d.get("data",""));
print("\n".join(re.sub(r"(SetEnv\s+\S+\s+)(\S+)",r"\1***MASKED***",l) for l in c.splitlines()) if c else "(none)")'
