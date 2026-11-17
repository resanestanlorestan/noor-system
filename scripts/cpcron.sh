#!/bin/bash
# cPanel API2 Cron helper — login + call Cron module (addcron/listcron/delcron)
# usage: cpcron.sh listcron
#        cpcron.sh addcron <minute> <hour> <day> <month> <weekday> <command>
#        cpcron.sh delcron <cronid or line-no> <line-min> <line-hour> <line-day> <line-month> <line-weekday> <command>
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-h-cr.jar

login() {
  rm -f "$JAR"
  local hdr=/tmp/cp-cr-$$.txt
  curl -sk --max-time 40 -c "$JAR" -D "$hdr" -o /dev/null \
    "https://${CP_HOST}:2083/login" \
    --data-urlencode "user=${CP_USER}" \
    --data-urlencode "pass=${CP_PASS}" \
    -H 'User-Agent: Mozilla/5.0'
  SESS=$(rg -io 'cpsess[0-9]+' "$hdr" | head -1)
  rm -f "$hdr"
  [ -n "$SESS" ] || { echo "LOGIN_FAILED" >&2; exit 1; }
}

FN="$1"; shift
login
case "$FN" in
  listcron)
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/json-api/cpanel?cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Cron&cpanel_jsonapi_func=listcron" \
      -H 'User-Agent: Mozilla/5.0'
    ;;
  addcron)
    MIN="$1"; HOU="$2"; DAY="$3"; MON="$4"; WEE="$5"; CMD="$6"
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/json-api/cpanel" \
      -H 'User-Agent: Mozilla/5.0' \
      --data-urlencode "cpanel_jsonapi_apiversion=2" \
      --data-urlencode "cpanel_jsonapi_module=Cron" \
      --data-urlencode "cpanel_jsonapi_func=addcron" \
      --data-urlencode "minute=${MIN}" \
      --data-urlencode "hour=${HOU}" \
      --data-urlencode "day=${DAY}" \
      --data-urlencode "month=${MON}" \
      --data-urlencode "weekday=${WEE}" \
      --data-urlencode "command=${CMD}"
    ;;
  delcron)
    LID="$1"
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/json-api/cpanel" \
      -H 'User-Agent: Mozilla/5.0' \
      --data-urlencode "cpanel_jsonapi_apiversion=2" \
      --data-urlencode "cpanel_jsonapi_module=Cron" \
      --data-urlencode "cpanel_jsonapi_func=delcron" \
      --data-urlencode "cronid=${LID}" \
      --data-urlencode "line=${LID}"
    ;;
  *) echo "usage: $0 listcron|addcron|delcron" >&2; exit 2;;
esac
echo
