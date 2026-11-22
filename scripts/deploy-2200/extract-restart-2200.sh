#!/bin/bash
# آپلود استاب fx2200.php با Fileman و فراخوانی آن (استخراج از زیپ موجود + ری‌استارت)
set -u
JAR=/tmp/cp-2200.jar
HDR=/tmp/cp-2200-hdr.txt
HOST=89.39.208.254
BASE=https://pouyafarhadi.ir
STUB=/home/z/my-project/scripts/deploy-2200/fx2200.php
TOKEN=xK7Qp2Wm9Rt4Vb6N
SESS=$(grep -o "cpsess[0-9a-zA-Z]*" "$HDR" | head -1)
if [ -z "$SESS" ]; then echo "NO_SESSION"; exit 1; fi
for attempt in 0 1 2; do
  OUT=$(curl -sk --max-time 90 -b "$JAR" \
    "https://${HOST}:2083/${SESS}/execute/Fileman/save_file_content" \
    -H "User-Agent: Mozilla/5.0" \
    --data-urlencode "dir=/home/epqoisdl/public_html" \
    --data-urlencode "file=fx2200.php" \
    --data-urlencode "utf8=1" \
    --data-urlencode "content@${STUB}")
  case "$OUT" in
    *'"status":1'*) echo "SAVE fx2200.php: OK"; break ;;
    *) echo "SAVE try${attempt}: ${OUT:0:120}"; sleep $((15 + 10 * attempt)) ;;
  esac
done
sleep 2
echo "HIT:"
curl -sk --max-time 240 -H "User-Agent: Mozilla/5.0" "${BASE}/fx2200.php?k=${TOKEN}"
echo
