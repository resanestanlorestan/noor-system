#!/bin/bash
# Save a file to the cPanel host via UAPI Fileman::save_file_content
# usage: cpsave.sh <dir-url-encoded> <filename> <local-file-with-content>
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-h-sv.jar

DIR="$1"; FILE="$2"; SRC="$3"
rm -f "$JAR"
HDR=/tmp/cp-sv-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo LOGIN_FAILED >&2; exit 1; }

SRC_CONTENT=$(cat "$SRC")
curl -sk --max-time 60 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/execute/Fileman/save_file_content" \
  -H 'User-Agent: Mozilla/5.0' \
  --data-urlencode "dir=${DIR}" \
  --data-urlencode "file=${FILE}" \
  --data-urlencode "content=${SRC_CONTENT}" \
  --data-urlencode "from_charset=UTF-8" \
  --data-urlencode "to_charset=UTF-8"
