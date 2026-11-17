#!/usr/bin/env bash
# ذخیرهٔ فایل متنی روی هاست با تلاش مجدد — cpsave.sh + حلقهٔ retry
# usage: cpsave-retry.sh <dir> <filename> <local-file> [max-tries]
set -u
DIR="$1"; FILE="$2"; SRC="$3"; MAX="${4:-6}"
n=0
while [ $n -lt "$MAX" ]; do
  out=$(bash /home/z/my-project/scripts/cpsave.sh "$DIR" "$FILE" "$SRC" 2>/dev/null)
  if echo "$out" | grep -q '"status":1'; then
    echo "SAVED $FILE (try $((n+1)))"
    exit 0
  fi
  n=$((n+1))
  echo "  retry $n: $(echo "$out" | head -c 120)"
  sleep $((15*n))
done
echo "SAVE_FAILED $FILE"
exit 1
