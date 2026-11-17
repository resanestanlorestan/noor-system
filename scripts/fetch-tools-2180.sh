#!/bin/bash
# واکشی ابزارهای استقرار موجود روی هاست + طرح کرون قبلی (خام در /tmp/state2180)
set -u
cd /home/z/my-project/scripts
S=8
PH=/home/epqoisdl/public_html
HM=/home/epqoisdl

fetch() { # dir file outfile
  bash cpread.sh "$1" "$2" 30000 > "$3" 2>&1
  python3 - "$3" "$2" <<'PY'
import sys
p, name = sys.argv[1], sys.argv[2]
c = open(p, errors='ignore').read()
bad = c.startswith(('NO_CONTENT', 'PARSE_FAIL', 'LOGIN_FAILED'))
print(f"  {name}: {'FAIL ' + c[:90] if bad else f'{len(c)} bytes OK'}")
PY
}

echo "== fetch deploy/rotate tools =="
fetch $PH rotate-2122.php     /tmp/state2180/rotate-2122.php
sleep $S
fetch $PH deploy-2122.php     /tmp/state2180/deploy-2122.php
sleep $S
fetch $PH deploy-514cff.php   /tmp/state2180/deploy-514cff.php
sleep $S
fetch $PH preflight-514cff.php /tmp/state2180/preflight-514cff.php
sleep $S
fetch $PH index.php           /tmp/state2180/index.php
sleep $S
fetch $HM crontab.tmp         /tmp/state2180/crontab.tmp
sleep $S
fetch $HM cron-setup.log      /tmp/state2180/cron-setup.log
sleep $S
fetch $HM host-cron.sh        /tmp/state2180/host-cron.sh
sleep $S
fetch $HM deploy-218.sh       /tmp/state2180/host-deploy-218.sh
sleep $S
fetch $HM zips-check.txt      /tmp/state2180/zips-check.txt
echo "== fetch done =="
