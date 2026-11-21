#!/bin/bash
# تشخیص چالش ضدهوشمند میزبان برای استقرار ۲.۱۹.۲ — بدون چاپ رازها
# usage: bash scripts/deploy-2190/waf-diag.sh
set -uo pipefail
cd /home/z/my-project
CREDS=scripts/.cp-creds
CP_HOST=$(grep -o "CP_HOST='[^']*'" "$CREDS" | cut -d"'" -f2)
CP_USER=$(grep -o "CP_USER='[^']*'" "$CREDS" | cut -d"'" -f2)
CP_PASS=$(grep -o "CP_PASS='[^']*'" "$CREDS" | cut -d"'" -f2)
JAR=/tmp/waf-diag.jar; HDR=/tmp/waf-diag-hdr.txt
rm -f "$JAR" "$HDR"
curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o /dev/null \
  "https://${CP_HOST}:2083/login" \
  --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
  -H 'User-Agent: Mozilla/5.0'
SESS=$(grep -io 'cpsess[0-9]*' "$HDR" | head -1)
rm -f "$HDR"
[ -n "$SESS" ] || { echo LOGIN_FAILED; exit 1; }
echo "login ok, probing 3 harmless GETs..."
for i in 1 2 3; do
  CODE=$(curl -sk --max-time 40 -b "$JAR" -o "/tmp/waf-diag-$i.html" -w "%{http_code}" \
    "https://${CP_HOST}:2083/${SESS}/execute/Fileman/list_files?dir=public_html" \
    -H 'User-Agent: Mozilla/5.0')
  KIND="json"
  head -c 200 "/tmp/waf-diag-$i.html" | grep -qi "anti-robot\|<!DOCTYPE" && KIND="CHALLENGE_HTML"
  echo "probe $i: http=$CODE kind=$KIND size=$(wc -c < /tmp/waf-diag-$i.html)"
  sleep 6
done
for i in 1 2 3; do
  if head -c 400 "/tmp/waf-diag-$i.html" | grep -qi "anti-robot"; then
    cp "/tmp/waf-diag-$i.html" /tmp/challenge.html
    echo "challenge saved to /tmp/challenge.html ($(wc -c < /tmp/challenge.html) bytes)"
    break
  fi
done
