#!/bin/bash
# UAPI Cron helper (this cPanel has no API2 Cron module) — login + Cron::add_line / list_lines / remove_line
# usage: cpuapi-cron.sh addline <minute> <hour> <day> <month> <weekday> <command>
#        cpuapi-cron.sh listlines
#        cpuapi-cron.sh removeline <line-min> <line-hour> <line-day> <line-month> <line-weekday> <command>
set -e
# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)
CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"
[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }
. "$CREDS_FILE"
JAR=/tmp/cp-uapi-cr.jar

login() {
  rm -f "$JAR"
  local hdr=/tmp/cp-uapi-cr-$$.txt
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
  addline)
    MIN="$1"; HOU="$2"; DAY="$3"; MON="$4"; WEE="$5"; CMD="$6"
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/execute/Cron/add_line?api.version=2&minute=${MIN}&hour=${HOU}&day=${DAY}&month=${MON}&weekday=${WEE}&command=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$CMD")" \
      -H 'User-Agent: Mozilla/5.0'
    ;;
  listlines)
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/execute/Cron/list_lines?api.version=2" \
      -H 'User-Agent: Mozilla/5.0'
    ;;
  removeline)
    MIN="$1"; HOU="$2"; DAY="$3"; MON="$4"; WEE="$5"; CMD="$6"
    curl -sk --max-time 60 -b "$JAR" \
      "https://${CP_HOST}:2083/${SESS}/execute/Cron/remove_line?api.version=2&minute=${MIN}&hour=${HOU}&day=${DAY}&month=${MON}&weekday=${WEE}&command=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$CMD")" \
      -H 'User-Agent: Mozilla/5.0'
    ;;
  *) echo "unknown function: $FN" >&2; exit 1;;
esac
