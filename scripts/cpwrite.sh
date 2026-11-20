#!/bin/bash
# نوشتن فایل متنی روی هاست با UAPI Fileman::save_file_content (فرم کدگذاری‌شده،
# بدون multipart) — برای دور زدن حذف بدنهٔ مالتی‌پارت توسط حفاظت هاست.
# usage: cpwrite.sh <local-text-file> <remote-filename> [remote-dir]
set -uo pipefail
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
. "$CREDS_FILE"
JAR=/tmp/cp-w.jar
LOCAL="$1"; REMOTE="${2:-$(basename "$1")}"; DIR="${3:-/home/epqoisdl/public_html}"

rm -f "$JAR"
HDR=/tmp/cp-w-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1); rm -f "$HDR"
[ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }

curl -sk --max-time 60 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/execute/Fileman/save_file_content" \
  -H 'User-Agent: Mozilla/5.0' \
  --data-urlencode "dir=${DIR}" \
  --data-urlencode "file=${REMOTE}" \
  --data-urlencode "content@${LOCAL}" \
  --data-urlencode "utf8=1"
echo
