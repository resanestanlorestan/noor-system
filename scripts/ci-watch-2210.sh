#!/usr/bin/env bash
# پایش گردش‌کار Release برای تگ v2.21.0 تا اتمام + گزارش assetهای Release
TOKEN=$(cd /home/z/my-project && git remote get-url origin | grep -oE "://[^@]+@" | sed 's|://||;s|@||;s|.*:||')
REPO="resanestanlorestan/noor-system"
LOG=/tmp/ci-watch-2210.log
: > "$LOG"
for i in $(seq 1 30); do
  sleep 60
  OUT=$(curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/$REPO/actions/runs?per_page=3" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r['name'],'|',r['status'],'|',r['conclusion'],'|',r['head_sha'][:7]) for r in d.get('workflow_runs',[]) if r['head_sha'].startswith('f61fc2d')]" 2>/dev/null)
  echo "poll $i: $OUT" >> "$LOG"
  if echo "$OUT" | grep -q "^Release | completed"; then
    echo "$OUT" | grep "^Release | completed" | grep -q " success" && CONC=success || CONC=failure
    echo "RELEASE_WORKFLOW_CONCLUSION=$CONC" >> "$LOG"
    curl -s --max-time 20 -H "Authorization: Bearer $TOKEN" \
      "https://api.github.com/repos/$REPO/releases/tags/v2.21.0" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print('RELEASE:', d.get('name'), '| assets:', [(a['name'], a['size'], a['download_count']) for a in d.get('assets',[])])" >> "$LOG" 2>&1
    exit 0
  fi
done
echo "WATCH_TIMEOUT_30MIN" >> "$LOG"
