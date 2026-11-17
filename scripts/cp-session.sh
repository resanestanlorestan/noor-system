#!/bin/bash
# گرفتن نشست cPanel و چاپ فقط شناسهٔ cpsess (اعتبارنامه‌ها از cpread.sh خوانده می‌شوند، چاپ نمی‌شوند)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CP_HOST=$(grep -o "CP_HOST='[^']*'" ".cp-creds" | cut -d"'" -f2)
CP_USER=$(grep -o "CP_USER='[^']*'" ".cp-creds" | cut -d"'" -f2)
CP_PASS=$(grep -o "CP_PASS='[^']*'" ".cp-creds" | cut -d"'" -f2)
JAR=/tmp/cp-session-$$.jar
HDR=/tmp/cp-session-hdr-$$.txt
trap 'rm -f "$JAR" "$HDR"' EXIT
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(grep -io 'cpsess[0-9]*' "$HDR" | head -1)
if [ -n "$SESS" ]; then
  echo "$SESS"
else
  echo LOGIN_FAILED >&2
  exit 1
fi
