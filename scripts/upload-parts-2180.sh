#!/usr/bin/env bash
# آپلود بخش‌بندی‌شدهٔ باندل از طریق گیرندهٔ PHP روی خود سایت (بدون API پنل)
set -u
TOKEN=bb9c41873bc15c5b7d328bf7
URL="https://pouyafarhadi.ir/upload-514cff.php?token=${TOKEN}"
SRC=/tmp/zip-parts
LOG=/tmp/b64-upload.log
: > "$LOG"
fail=0
for f in "$SRC"/2122.part*.b64; do
  idx=$(basename "$f" .b64); idx=${idx#2122.part}
  ok=0
  for try in 1 2 3 4 5; do
    resp=$(curl -sk --max-time 90 --data-binary @"$f" "${URL}&idx=${idx}" 2>/dev/null)
    if echo "$resp" | grep -q "^OK idx="; then
      echo "part $idx OK ($try): $resp" >> "$LOG"; ok=1; break
    fi
    echo "part $idx retry $try: $(echo "$resp" | head -c 80)" >> "$LOG"
    sleep $((5*try))
    # اگر بلوک BitNinja فعال شد، متوقف شو تا بلوک منقضی شود
    if echo "$resp" | grep -qi "blocked\|recaptcha\|مسدود"; then
      echo "part $idx: BITNINJA BLOCK — pausing 240s" >> "$LOG"
      sleep 240
    fi
  done
  [ $ok -eq 1 ] || { echo "part $idx FAILED" >> "$LOG"; fail=1; }
  sleep 4
done
echo "=== upload loop done, fail=$fail ===" >> "$LOG"
grep -c "OK idx=" "$LOG" | xargs echo "uploaded parts:"
tail -3 "$LOG"
