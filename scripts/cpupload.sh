#!/bin/bash
# Upload a file to the cPanel host via UAPI Fileman::upload_files (multipart)
# usage: cpupload.sh <local-file> <remote-filename> [remote-dir]
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-h-up.jar
LOCAL="$1"
REMOTE="${2:-$(basename "$1")}"
DIR="${3:-/home/epqoisdl}"

rm -f "$JAR"
HDR=/tmp/cp-up-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }

curl -sk --max-time 600 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/execute/Fileman/upload_files" \
  -H 'User-Agent: Mozilla/5.0' \
  -F "dir=${DIR}" \
  -F "file-1=@${LOCAL};filename=${REMOTE}" \
  -F "overwrite=1"
echo
