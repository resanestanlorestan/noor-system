#!/bin/bash
# Delete a file/dir from cPanel host via API2 Fileman::fmdelfile (moves to trash)
# usage: cpdel.sh <abs-dir-containing-target> <file-or-dirname>
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-del.jar

rm -f "$JAR"
HDR=/tmp/cp-del-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }

DIR="$1"; FILE="$2"; FUNC="${3:-fmdelfile}"
curl -sk --max-time 60 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Fileman&cpanel_jsonapi_func=${FUNC}&dir=${DIR}&file=${FILE}"
echo
