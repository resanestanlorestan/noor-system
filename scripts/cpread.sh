#!/bin/bash
# Read a file from the cPanel host home via UAPI Fileman::get_file_content
# usage: cpread.sh <dir> <filename> [max-bytes]
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-rd.jar
DIR="$1"; FILE="$2"
rm -f "$JAR"; HDR=/tmp/cp-rd-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo LOGIN_FAILED >&2; exit 1; }
curl -sk --max-time 40 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/execute/Fileman/get_file_content?dir=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$DIR")&file=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$FILE")" \
  -H 'User-Agent: Mozilla/5.0' | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    data=d.get('data') or {}
    c=data.get('content')
    if c is None: print('NO_CONTENT', json.dumps(d)[:200])
    else: print(c[-int(sys.argv[1]):] if len(sys.argv)>1 else c)
except Exception as e: print('PARSE_FAIL', e)
" "${3:-6000}"
