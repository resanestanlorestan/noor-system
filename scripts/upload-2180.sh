#!/bin/bash
# آپلود فاصله‌گذاری‌شدهٔ orch-2180.php + rest-2180.sh + ۲۶ قطعهٔ b64 باندل ۲.۱۸.۰ (sha 5c50545d…)
# هر آپلود = یک لاگین cPanel + یک آپلود Fileman؛ هیچ درخواستی به سایت (443) POST نمی‌شود.
set -u
cd /home/z/my-project
LOG=/tmp/upload-2180.log
PARTS=scripts/bundle-parts-2180
: > "$LOG"

upload() { # local remote dir
  local L="$1" R="$2" D="$3" out json ok=0 try
  for try in 1 2 3; do
    out=$(bash scripts/cpupload.sh "$L" "$R" "$D" 2>&1)
    json=$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -1)
    if python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    sys.exit(0 if not d.get('errors') else 1)
except Exception:
    sys.exit(1)
" "$json" 2>/dev/null; then
      ok=1; break
    fi
    echo "  retry $try failed: $(printf '%s' "$json" | head -c 150)" | tee -a "$LOG"
    sleep $((15 + RANDOM % 10))
  done
  [ "$ok" -eq 1 ] && { echo "  OK: $R" | tee -a "$LOG"; return 0; }
  return 1
}

echo "== [0] orch + rest ==" | tee -a "$LOG"
upload scripts/diag-temp/orch-2180.php orch-2180.php /home/epqoisdl/public_html || { echo "ORCH_UPLOAD_FAILED" | tee -a "$LOG"; exit 1; }
sleep 10
upload scripts/diag-temp/rest-2180.sh rest-2180.sh /home/epqoisdl || { echo "REST_UPLOAD_FAILED" | tee -a "$LOG"; exit 1; }
sleep 12

FAIL=0; N=0
for f in $(ls "$PARTS"/noor-2180-b64.* | sort); do
  N=$((N+1))
  echo "== [$N/26] $(basename "$f") ==" | tee -a "$LOG"
  if upload "$f" "$(basename "$f")" "/home/epqoisdl"; then :; else
    echo "PART_FAILED:$(basename "$f")" | tee -a "$LOG"
    FAIL=$((FAIL+1))
  fi
  sleep $((8 + RANDOM % 6))
done

echo "== DONE fail=$FAIL/26 ==" | tee -a "$LOG"
[ "$FAIL" -eq 0 ] || exit 1
