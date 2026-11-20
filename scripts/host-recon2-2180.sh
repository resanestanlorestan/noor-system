#!/usr/bin/env bash
# شناسایی مرحلهٔ ۲ — یک ورود واحد و همهٔ فراخوانی‌ها با نشست مشترک (ضد rate-limit)
set -u
HOST='89.39.208.254'
USER='epqoisdl'
PASS=$(grep -o "CP_PASS='[^']*'" /home/z/my-project/scripts/.cp-creds 2>/dev/null | cut -d"'" -f2)
[ -z "$PASS" ] && PASS=$(grep -o "CP_PASS='[^']*'" /home/z/my-project/scripts/.cp-creds | cut -d"'" -f2)
OUT=/tmp/recon2
mkdir -p "$OUT"
JAR=$OUT/jar.txt
HDR=$OUT/hdr.txt
rm -f "$JAR" "$HDR"

curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${HOST}:2083/login" \
  --data-urlencode "user=${USER}" --data-urlencode "pass=${PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(grep -io 'cpsess[0-9]*' "$HDR" | head -1)
[ -n "$SESS" ] || { echo LOGIN_FAILED; exit 1; }
BASE="https://${HOST}:2083/${SESS}"
echo "logged in"

uapi() { # module/function querystring
  curl -sk --max-time 60 -b "$JAR" -H 'User-Agent: Mozilla/5.0' "$BASE/execute/$1/$2?$3"
  sleep 2
}

mask() { python3 -c 'import sys,re;s=sys.stdin.read();print(re.sub(r"[A-Za-z0-9_\-]{16,}","***MASKED***",re.sub(r"^(DATABASE_URL|APP_ENCRYPTION_KEY|CRON_SECRET|SMS[A-Z_]*)=.*$",r"\1=***MASKED***",s,flags=re.M)))'; }

# 1) انتهای فهرست home — فقط فایل‌های مرتبط (zip، deploy، marker)
uapi Fileman list_files 'dir=/home/epqoisdl&show_hidden=1&limit=2000' \
 | python3 -c 'import json,sys;d=json.load(sys.stdin);rows=[f for f in d.get("data",[])];print("total:",len(rows));[print(f["type"][:1],f.get("humansize",""),f["file"]) for f in rows if f["type"]=="f" and (f["file"].startswith(("noor","deploy","probe","diag","cleanup","cron","crontab","host","install","update")) or "done" in f["file"] or f["file"].endswith((".zip",".log",".sh",".tmp")))]' > $OUT/home-relevant.txt

# 2) نسخهٔ اپ روی هاست
uapi Fileman get_file_content 'file=/home/epqoisdl/noor-system/package.json' > $OUT/pkg.json
head -c 120 $OUT/pkg.json | grep -q '"file"\|required' && uapi Fileman get_file_content 'dir=/home/epqoisdl/noor-system&file=package.json' > $OUT/pkg.json
python3 -c 'import json;d=json.load(open("/tmp/recon2/pkg.json"));c=d.get("data",{});c=c.get("content","") if isinstance(c,dict) else str(c);import re;m=re.search(r"\"version\":\s*\"([^\"]+)\"",c);print("host app version:",m.group(1) if m else "UNKNOWN");print("line1 of data:",str(c)[:80])'

# 3) کلیدهای .env (مقادیر ماسک)
uapi Fileman get_file_content 'file=/home/epqoisdl/noor-system/.env' > $OUT/env.json
head -c 120 $OUT/env.json | grep -q '"file"\|required' && uapi Fileman get_file_content 'dir=/home/epqoisdl/noor-system&file=.env' > $OUT/env.json
python3 -c 'import json;d=json.load(open("/tmp/recon2/env.json"));c=d.get("data",{});c=c.get("content","") if isinstance(c,dict) else str(c);print("env keys:");[print("  ",l.split("=")[0]+"=***") for l in c.splitlines() if "=" in l and l.strip()]'

# 4) کرون (ماسک کامل مقادیر)
curl -sk --max-time 60 -b "$JAR" -H 'User-Agent: Mozilla/5.0' "$BASE/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Cron&cpanel_jsonapi_func=listcron" > $OUT/cron.json
sleep 2
python3 -c 'import json,re;d=json.load(open("/tmp/recon2/cron.json"));[print("cron:",re.sub(r"[A-Za-z0-9_\-]{14,}","***",str(c.get("command",""))),"| id:",c.get("id"),"| line:",c.get("line_number")) for c in d.get("cpanelresult",{}).get("data",[])] or print("no cron data")'

# 5) htaccess عمومی
uapi Fileman get_file_content 'file=/home/epqoisdl/public_html/.htaccess' > $OUT/ht.json
head -c 120 $OUT/ht.json | grep -q '"file"\|required' && uapi Fileman get_file_content 'dir=/home/epqoisdl/public_html&file=.htaccess' > $OUT/ht.json
python3 -c 'import json,re;d=json.load(open("/tmp/recon2/ht.json"));c=d.get("data",{});c=c.get("content","") if isinstance(c,dict) else str(c);print("---.htaccess---");print(re.sub(r"(SetEnv\s+\S+\s+)(\S+)",r"\1***MASKED***",re.sub(r"(token=|TOKEN=|KEY=|SECRET=)[A-Za-z0-9_\-]+",r"\1***",c))[:2600] if c else "(none)")'

# 6) محتوای استاب‌ها و پروب
for f in deploy-9f3c1a.php purge-9f3c1a.php probe-p8k2.php index.php; do
  uapi Fileman get_file_content "file=/home/epqoisdl/public_html/$f" > $OUT/stub-$f.json
  head -c 120 $OUT/stub-$f.json | grep -q '"file"\|required' && uapi Fileman get_file_content "dir=/home/epqoisdl/public_html&file=$f" > $OUT/stub-$f.json
  echo "--- $f ---"
  python3 -c 'import json,re;d=json.load(open("/tmp/recon2/stub-'"$f"'.json"));c=d.get("data",{});c=c.get("content","") if isinstance(c,dict) else str(c);print(re.sub(r"[A-Za-z0-9_\-]{14,}","***",c)[:600])'
done

# 7) فهرست diag-temp احتمالی و private-app
for d in /home/epqoisdl/noor-system/scripts/diag-temp /home/epqoisdl/.private-app /home/epqoisdl/noor-system/.private-app "/home/epqoisdl/public_html/APP_ENCRYPTION_KEY9019ceaaf3f8dd200fc09c59464f2001b4cdfbbb4350a78cd4789e677978cb4c"; do
  echo "--- ls $d ---"
  uapi Fileman list_files "dir=$d&show_hidden=1&limit=100" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin);rows=d.get("data",[]) or []
  [print("  ",f["type"][:1],f.get("humansize",""),f["file"]) for f in rows] or print("  (empty/none)")
except Exception as e: print("  LIST_FAILED", e)'
done

echo "== recon2 done =="
