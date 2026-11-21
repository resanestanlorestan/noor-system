#!/bin/bash
# آپلود چندتکه با یک نشست واحد (یک لاگین، N فایل) با retry هر فایل.
# usage: upload-session.sh <dir-with-chunks> <pattern> <remote-dir>
set -uo pipefail
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
. "$CREDS_FILE"
JAR=/tmp/cp-sess.jar
LOCAL_DIR="$1"; PATTERN="$2"; DIR="${3:-/home/epqoisdl}"

rm -f "$JAR"
HDR=/tmp/cp-sess-$$.txt
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(rg -io 'cpsess[0-9]+' "$HDR" | head -1); rm -f "$HDR"
[ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }
echo "logged in: $SESS"

OK=0; FAIL=0
for F in $(cd "$LOCAL_DIR" && ls $PATTERN | sort); do
  SZ=$(stat -c %s "$LOCAL_DIR/$F")
  DONE=0
  for TRY in 1 2 3 4; do
    RES=$(curl -sk --max-time 90 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/execute/Fileman/upload_files" \
      -H 'User-Agent: Mozilla/5.0' \
      -F "dir=${DIR}" \
      -F "file-1=@${LOCAL_DIR}/${F}" \
      -F "overwrite=1") || { echo "$F try$TRY: curl-error"; sleep 5; continue; }
    USZ=$(echo "$RES" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['uploads'][0]['size'])" 2>/dev/null || echo "?")
    if [ "$USZ" = "$SZ" ]; then
      echo "$F: $SZ ok"; DONE=1; OK=$((OK+1)); break
    else
      echo "$F try$TRY: mismatch local=$SZ up=$USZ ${RES:0:80}"; sleep 4
    fi
  done
  [ "$DONE" = 1 ] || FAIL=$((FAIL+1))
  sleep 1
done
echo "== uploaded ok=$OK fail=$FAIL =="
