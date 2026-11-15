#!/bin/bash
# cPanel UAPI helper — session login + authenticated call
# usage: cpapi.sh <Module> <Function> [query-string]
CP_HOST='89.39.208.254'
CP_USER='epqoisdl'
CP_PASS='3p29A9ttKq'
JAR=/tmp/cp-h.jar

login() {
  rm -f "$JAR"
  local hdr=/tmp/cp-h-$.txt
  curl -sk --max-time 40 -c "$JAR" -D "$hdr" -o /dev/null \
    "https://${CP_HOST}:2083/login" \
    --data-urlencode "user=${CP_USER}" \
    --data-urlencode "pass=${CP_PASS}" \
    -H 'User-Agent: Mozilla/5.0'
  SESS=$(rg -io 'cpsess[0-9]+' "$hdr" | head -1)
  rm -f "$hdr"
  [ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }
}

if [ $# -lt 2 ]; then echo "usage: $0 Module Function [querystring]" >&2; exit 2; fi
MOD="$1"; FN="$2"; QS="${3:-}"
login
curl -sk --max-time 60 -b "$JAR" \
  "https://${CP_HOST}:2083/${SESS}/execute/${MOD}/${FN}${QS:+?$QS}" \
  -H 'User-Agent: Mozilla/5.0'
