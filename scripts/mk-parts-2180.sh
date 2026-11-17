#!/bin/bash
# تقسیم باندل noor-slim-2180.zip به ۲۶ قطعه base64 برای آپلود cPanel
set -euo pipefail
ZIP=/home/z/my-project/download/noor-slim-2180.zip
OUT=/home/z/my-project/scripts/bundle-parts-2180
mkdir -p "$OUT"; rm -f "$OUT"/noor-2180-b64.*

SIZE=$(stat -c %s "$ZIP")
NB=26
P=$(( (SIZE + NB - 1) / NB ))
rm -rf /tmp/parts2180; mkdir -p /tmp/parts2180
split -b "$P" -d -a 2 "$ZIP" /tmp/parts2180/raw.
N=$(ls /tmp/parts2180/raw.* | wc -l)
echo "size=$SIZE part=$P raw-parts=$N (need $NB)"
[ "$N" -eq "$NB" ] || { echo "PART_COUNT_MISMATCH"; exit 1; }

i=0
for f in /tmp/parts2180/raw.*; do
  bn=$(printf "%02d" "$i")
  base64 -w0 "$f" > "$OUT/noor-2180-b64.$bn"
  i=$((i+1))
done
echo "b64 parts written:"
ls -l "$OUT"/noor-2180-b64.* | awk '{print $5, $9}'
# راستی‌آزمایی بازچینی
cat "$OUT"/noor-2180-b64.* | tr -d '\n' | base64 -d | sha256sum
sha256sum "$ZIP"
