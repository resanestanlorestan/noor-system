#!/bin/bash
# بازخوانی فقط‌خواندنی وضعیت هاست پیش از استقرار ۲.۱۸.۰
# خروجی خام (شامل رز) فقط در /tmp/state2180 ذخیره می‌شود؛ روی stdout همه‌چیز ماسک است.
set -u
cd /home/z/my-project/scripts
mkdir -p /tmp/state2180
S=9

echo "== [1] standalone/.env (key names only) =="
bash cpread.sh /home/epqoisdl/noor-system/.next/standalone .env 4000 > /tmp/state2180/env-standalone.txt 2>&1
python3 - <<'PY'
c = open('/tmp/state2180/env-standalone.txt').read()
n = 0
for l in c.splitlines():
    if '=' in l and not l.startswith(('PARSE_FAIL', 'NO_CONTENT', 'LOGIN_FAILED')):
        k, v = l.split('=', 1)
        print(f"  {k} = ***({len(v)} chars)")
        n += 1
if not n: print("  RAW-HEAD:", c[:200].replace('\n', ' | '))
PY
sleep $S

echo "== [2] noor-system/.env (key names only) =="
bash cpread.sh /home/epqoisdl/noor-system .env 8000 > /tmp/state2180/env-root.txt 2>&1
python3 - <<'PY'
c = open('/tmp/state2180/env-root.txt').read()
n = 0
for l in c.splitlines():
    if '=' in l and not l.startswith(('PARSE_FAIL', 'NO_CONTENT', 'LOGIN_FAILED')):
        k, v = l.split('=', 1)
        print(f"  {k} = ***({len(v)} chars)")
        n += 1
if not n: print("  RAW-HEAD:", c[:200].replace('\n', ' | '))
PY
sleep $S

echo "== [3] crontab lines (tokens masked) =="
bash cpuapi-cron.sh listlines > /tmp/state2180/cron.json 2>&1
python3 - <<'PY'
import json, re
s = open('/tmp/state2180/cron.json').read().strip()
try:
    d = json.loads(s)
    rows = (d.get('data') or {})
    lines = rows.get('lines') if isinstance(rows, dict) else rows
    if lines is None: lines = []
    for l in lines:
        cmd = l.get('command') if isinstance(l, dict) else str(l)
        m = re.sub(r'(key=|token=|TOKEN=|PASSWORD=|PASSWD=)[A-Za-z0-9_\-]{6,}', r'\1***', str(cmd))
        m = re.sub(r'(?<![A-Za-z0-9_])[A-Za-z0-9_+\-/]{24,}(?![A-Za-z0-9_])', '***', m)
        print("  ", m)
    if not lines: print("  RAW:", re.sub(r'[A-Za-z0-9_+\-/]{24,}', '***', s[:600]))
except Exception as e:
    print("  RAW-ERR:", re.sub(r'[A-Za-z0-9_+\-/]{24,}', '***', s[:600]))
PY
sleep $S

echo "== [4] .htaccess (SetEnv structure, values masked) =="
bash cpread.sh /home/epqoisdl/public_html .htaccess 12000 > /tmp/state2180/htaccess.txt 2>&1
python3 - <<'PY'
import re
c = open('/tmp/state2180/htaccess.txt').read()
inblock = False
for l in c.splitlines():
    if 'CLOUDLINUX ENV VARS CONFIGURATION BEGIN' in l: inblock = True; print("  <<BLOCK-BEGIN>>"); continue
    if 'CLOUDLINUX ENV VARS CONFIGURATION END' in l: inblock = False; print("  <<BLOCK-END>>"); continue
    if inblock and 'SetEnv' in l:
        print("  " + re.sub(r'(SetEnv\s+\S+\s+)\S+', r'\1***', l.strip()))
    elif 'SetEnv' in l:
        print("  (out) " + re.sub(r'(SetEnv\s+\S+\s+)\S+', r'\1***', l.strip()))
print("  total-lines:", len(c.splitlines()))
PY
sleep $S

echo "== [5] host package.json version + BUILD_ID =="
bash cpread.sh /home/epqoisdl/noor-system package.json 600 | python3 -c 'import sys,re;m=re.search(r"\"version\":\s*\"([^\"]+)\"",sys.stdin.read());print("  version:",m.group(1) if m else "?")'
sleep $S
bash cpread.sh /home/epqoisdl/noor-system/.next/standalone/.next BUILD_ID 100 | head -1 | sed 's/^/  BUILD_ID: /'
sleep $S

echo "== [6] home leftovers (zips/parts/tools) =="
bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl&show_hidden=1&limit=3000' > /tmp/state2180/home-list.json 2>&1
python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/state2180/home-list.json'))
    rows = d.get('data') or []
    for f in rows:
        if f.get('type') == 'f' and (f['file'].endswith(('.zip', '.part', '.js', '.sh', '.log', '.done', '.running', '.b64')) or f['file'].startswith(('.cron', 'deploy', 'rotate', 'noor-'))):
            print("  ", f.get('humansize', ''), f['file'])
except Exception:
    print("  LIST_FAILED")
PY
sleep $S

echo "== [7] public_html php + key files =="
bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl/public_html&show_hidden=1&limit=3000' > /tmp/state2180/php-list.json 2>&1
python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/state2180/php-list.json'))
    rows = d.get('data') or []
    for f in rows:
        if f.get('type') == 'f' and (f['file'].endswith('.php') or f['file'].startswith('.') or 'zip' in f['file'] or 'part' in f['file']):
            print("  ", f.get('humansize', ''), f['file'])
except Exception:
    print("  LIST_FAILED")
PY
sleep $S

echo "== [8] upload-514cff.php source -> local file (no print) =="
bash cpread.sh /home/epqoisdl/public_html upload-514cff.php 12000 > /tmp/state2180/upload-stub.php 2>&1
python3 - <<'PY'
import re
c = open('/tmp/state2180/upload-stub.php').read()
print("  size:", len(c))
for pat in (r"token.*?'([A-Za-z0-9]+)'", r"['\"](/[^'\"]{5,80})['\"]", r"sys_get_temp_dir\(\)"):
    for m in re.findall(pat, c)[:6]:
        s = str(m)
        if '/' in s and 'home' not in s and 'tmp' not in s: continue
        print("  path/hit:", s if 'token' not in pat else '***token-found***')
PY

echo "== [9] diag-temp on host (noor-system/scripts) =="
bash cpapi.sh Fileman list_files 'dir=/home/epqoisdl/noor-system/scripts/diag-temp&show_hidden=1' 2>&1 | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); rows=d.get("data") or []
    [print("  ",f.get("humansize",""),f["file"]) for f in rows] or print("  (empty)")
except Exception: print("  LIST_FAILED")'

echo "== state-read done =="
