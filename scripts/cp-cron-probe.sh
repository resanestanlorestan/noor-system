#!/bin/bash
# Probe which API2 Cron functions exist on this cPanel
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-probe.jar
rm -f "$JAR"
HDR=/tmp/cp-probe-h.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo LOGIN_FAILED; exit 1; }

for FN in addline setline savecron editcron setcron addcron delcron removecron; do
  OUT=$(curl -sk --max-time 30 -b "$JAR" \
    "https://${CP_HOST}:2083/${SESS}/json-api/cpanel" \
    -H 'User-Agent: Mozilla/5.0' \
    --data-urlencode "cpanel_jsonapi_apiversion=2" \
    --data-urlencode "cpanel_jsonapi_module=Cron" \
    --data-urlencode "cpanel_jsonapi_func=${FN}" \
    --data-urlencode "command=/bin/true")
  REASON=$(echo "$OUT" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error') or (d.get('cpanelresult') or {}).get('error') or json.dumps((d.get('cpanelresult') or {}).get('data'))[:120])" 2>/dev/null || echo "$OUT" | head -c 120)
  echo "$FN => $REASON"
done
