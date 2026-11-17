#!/bin/bash
# خواندن crontab از دو مسیر + تلاش مجدد list_files بدون limit
set -u
cd /home/z/my-project/scripts
S=8

echo "== [a] spool read attempt =="
bash cpread.sh /var/spool/cron epqoisdl 8000 > /tmp/state2180/spool.txt 2>&1
python3 -c "
c=open('/tmp/state2180/spool.txt').read()
print('  head:', c[:120].replace(chr(10),' | '))"

echo "== [b] cron UI page =="
CP_HOST='89.39.208.254'; CP_USER='epqoisdl'; CP_PASS='3p29A9ttKq'
JAR=/tmp/cp-ui.jar; HDR=/tmp/cp-ui-h.txt
rm -f "$JAR"
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1); rm -f "$HDR"
if [ -n "$SESS" ]; then
  curl -sk --max-time 40 -b "$JAR" "https://${CP_HOST}:2083/${SESS}/frontend/paper_lantern/cron/index.html" > /tmp/state2180/cron-ui.html 2>&1
  curl -sk --max-time 40 -b "$JAR" "https://${CP_HOST}:2083/${SESS}/frontend/paper_lantern/cron/index.html?raw=1" > /tmp/state2180/cron-ui-raw.html 2>&1
  python3 - <<'PY'
import re
c = open('/tmp/state2180/cron-ui.html', errors='ignore').read()
print('  ui size:', len(c))
# خط‌های کرون معمولا در data attributes یا جدول ظاهر می‌شوند
lines = re.findall(r'data-cronline="([^"]+)"|<td[^>]*>([^<]*(?:curl|bash|sh|pg_dump|php)[^<]*)</td>', c)
seen = set()
for a, b in lines:
    s = (a or b).strip()
    if s and s not in seen:
        seen.add(s)
        m = re.sub(r'(key=|token=|PASSWORD=|PGPASSWORD=)[A-Za-z0-9_\-+.]{6,}', r'\1***', s)
        m = re.sub(r'(?<![A-Za-z0-9_])[A-Za-z0-9_+\-/]{22,}(?![A-Za-z0-9_])', '***', m)
        print('  line:', m[:300])
if not seen: print('  (none found in UI page)')
PY
else
  echo "  LOGIN_FAILED"
fi

echo "== [c] list_files retry (no limit) =="
sleep 4
bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl&show_hidden=1' > /tmp/state2180/home2.json 2>&1
python3 - <<'PY'
import json, re
try:
    d = json.load(open('/tmp/state2180/home2.json'))
    rows = d.get('data') or []
    print('  home rows:', len(rows), 'errors:', json.dumps(d.get('errors'))[:120] if d.get('errors') else 'none')
    for f in rows:
        if f.get('type') == 'f' and (f['file'].endswith(('.zip', '.part', '.b64', '.bin', '.log')) or f['file'].startswith(('.cron', 'deploy', 'rotate', 'noor-'))):
            print('   ', f.get('humansize', ''), f['file'])
except Exception as e:
    s = open('/tmp/state2180/home2.json').read()
    print('  ERR:', re.sub(r'[A-Za-z0-9_+\-/]{22,}', '***', s[:250]))
PY
sleep 6
bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl/public_html&show_hidden=1' > /tmp/state2180/php2.json 2>&1
python3 - <<'PY'
import json, re
try:
    d = json.load(open('/tmp/state2180/php2.json'))
    rows = d.get('data') or []
    print('  public_html rows:', len(rows), 'errors:', json.dumps(d.get('errors'))[:120] if d.get('errors') else 'none')
    for f in rows:
        if f.get('type') == 'f' and (f['file'].endswith('.php') or f['file'].startswith('.') or '.zip' in f['file'] or '.part' in f['file']):
            print('   ', f.get('humansize', ''), f['file'])
except Exception as e:
    s = open('/tmp/state2180/php2.json').read()
    print('  ERR:', re.sub(r'[A-Za-z0-9_+\-/]{22,}', '***', s[:250]))
PY
echo "== done =="
