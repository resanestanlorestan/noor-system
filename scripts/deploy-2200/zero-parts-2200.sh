#!/bin/bash
# صفر کردن قطعات b64 روی هاست برای آزادسازی فضا — الگوی empty-leftovers-2193
# (Fileman::save_file_content با محتوای خالی روی فایل موجود = truncate)
set -u
JAR=/tmp/cp-2200.jar
HDR=/tmp/cp-2200-hdr.txt
HOST=89.39.208.254
SESS=$(grep -o "cpsess[0-9a-zA-Z]*" "$HDR" | head -1)
TMP=$(mktemp); : > "$TMP"
if [ -z "$SESS" ]; then echo "NO_SESSION"; exit 1; fi
OK=0; FAIL=0
for seq in $(seq -w 1 27); do
  OUT=$(curl -sk --max-time 60 -b "$JAR" \
    "https://${HOST}:2083/${SESS}/execute/Fileman/save_file_content" \
    -H "User-Agent: Mozilla/5.0" \
    --data-urlencode "dir=/home/epqoisdl" \
    --data-urlencode "file=noor-part-${seq}.b64.txt" \
    --data-urlencode "utf8=1" \
    --data-urlencode "content@${TMP}")
  case "$OUT" in
    *'"status":1'*) OK=$((OK+1)); echo "ZERO part-${seq}: OK" ;;
    *) FAIL=$((FAIL+1)); echo "ZERO part-${seq}: ${OUT:0:100}" ;;
  esac
  sleep 0.4
done
echo "ZEROED=$OK FAILED=$FAIL"
rm -f "$TMP"
