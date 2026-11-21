#!/bin/bash
# تشخیص دقیق ورود cPanel: کد وضعیت و نوع پاسخ — بدون چاپ راز/توکن
set -uo pipefail
cd /home/z/my-project
CREDS=scripts/.cp-creds
CP_HOST=$(grep -o "CP_HOST='[^']*'" "$CREDS" | cut -d"'" -f2)
CP_USER=$(grep -o "CP_USER='[^']*'" "$CREDS" | cut -d"'" -f2)
CP_PASS=$(grep -o "CP_PASS='[^']*'" "$CREDS" | cut -d"'" -f2)
for i in 1 2 3; do
  JAR=/tmp/lp-$i.jar; HDR=/tmp/lp-hdr-$i.txt; BODY=/tmp/lp-body-$i.html
  rm -f "$JAR" "$HDR" "$BODY"
  CODE=$(curl -sk --max-time 40 -c "$JAR" -D "$HDR" -o "$BODY" -w "%{http_code}" \
    "https://${CP_HOST}:2083/login" \
    --data-urlencode "user=${CP_USER}" --data-urlencode "pass=${CP_PASS}" \
    -H 'User-Agent: Mozilla/5.0')
  SESS=$(grep -io 'cpsess[0-9]*' "$HDR" | head -1)
  KIND="other"
  grep -qi "anti-robot" "$BODY" && KIND="WAF_CHALLENGE"
  grep -qi "login forbidden\|temporarily\|too many" "$BODY" && KIND="CPHULK_MSG"
  grep -qi "invalid\|incorrect" "$BODY" && KIND="AUTH_MSG"
  echo "login try $i: http=$CODE cpsess=$([ -n "$SESS" ] && echo yes || echo no) kind=$KIND body_bytes=$(wc -c < "$BODY")"
  rm -f "$JAR" "$BODY"
  sleep 10
done
