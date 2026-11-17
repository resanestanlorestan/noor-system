#!/usr/bin/env bash
# resume-2180 — ادامهٔ خودکار استقرار الحاقیهٔ ۲.۱۸.۰ پس از رفع بلوک BitNinja.
# پیش‌نیاز: باندل download/noor-slim-2122.zip، بخش‌ها scripts/bundle-parts-2180/،
# اسکریپت‌ها scripts/diag-temp/orch-514cff.php و گیرندهٔ upload-514cff.php روی هاست.
set -u
cd /home/z/my-project
source scripts/bundle-parts-2180/token.env
TOKEN="$TOKEN"
ORCH="https://pouyafarhadi.ir/orch-514cff.php?token=${TOKEN}"
RECV="https://pouyafarhadi.ir/upload-514cff.php?token=${TOKEN}"
LOG=/home/z/my-project/download/deploy-2180-log.txt
say() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }

say "=== resume-2180 started ==="

# 0) سلامت :443
code=$(curl -sk --max-time 20 -o /dev/null -w "%{http_code}" https://pouyafarhadi.ir/api/health)
say "health: $code"
[ "$code" = "200" ] || { say "BLOCKED — بعداً دوباره اجرا کنید"; exit 1; }

# 1) اطمینان از حضور orch روی هاست (با cpsave از مسیر :2083)
c2083=$(curl -sk --max-time 15 -o /dev/null -w "%{http_code}" "https://89.39.208.254:2083/" 2>/dev/null)
say "cPanel :2083 probe: ${c2083:-000}"
if [ "${c2083:-000}" != "000" ]; then
  bash scripts/cpsave-retry.sh /home/epqoisdl/public_html orch-514cff.php scripts/diag-temp/orch-514cff.php 5 \
    && say "orch uploaded via cpsave" \
    || say "orch upload via cpsave FAILED — بعداً دوباره"
fi

# 2) آپلود بخش‌ها از مسیر گیرندهٔ :443 (paced)؛ fallback: cpsave برای همان نام فایل
remaining=$(curl -sk --max-time 30 "${ORCH}&step=status" | grep -o "b64 parts: [0-9]*" | grep -o "[0-9]*")
say "parts on host before: ${remaining:-?}"
if [ "${remaining:-99}" -lt 26 ]; then
  for f in scripts/bundle-parts-2180/2122.part*.b64; do
    idx=$(basename "$f" .b64); idx=${idx#2122.part}
    [ "$idx" = "token.env" ] && continue
    for try in 1 2 3 4 5 6; do
      resp=$(curl -sk --max-time 90 --data-binary @"$f" "${RECV}&idx=${idx}" 2>/dev/null | head -c 60)
      if echo "$resp" | grep -q "^OK idx="; then say "part $idx OK ($try)"; break; fi
      say "part $idx try $try: ${resp:-EMPTY}"
      grep -qi "blocked\|مسدود" <<< "$resp" && sleep 300 || sleep 12
      # fallback :2083
      c2083=$(curl -sk --max-time 15 -o /dev/null -w "%{http_code}" "https://89.39.208.254:2083/" 2>/dev/null)
      if [ "${c2083:-000}" != "000" ] && [ $try -ge 3 ]; then
        bash scripts/cpsave-retry.sh /home/epqoisdl "noor-2122-b64.${idx}" "$f" 3 >/dev/null 2>&1 \
          && { say "part $idx OK via cpsave"; break; }
      fi
    done
    sleep 4
  done
fi

# 3) استقرار و بقیهٔ گام‌ها با pacing
run_step() {
  local step="$1"; local want="$2"
  for try in 1 2 3; do
    resp=$(curl -sk --max-time 300 "${ORCH}&step=${step}")
    if echo "$resp" | grep -qi "$want"; then say "step $step: OK"; echo "$resp" >> "$LOG"; return 0; fi
    say "step $step try $try: $(echo "$resp" | head -c 150)"
    sleep 20
  done
  echo "$resp" >> "$LOG"; say "step $step: FAILED"; return 1
}

run_step deploy "== deploy done ==" || { say "استقرار ناموفق — لاگ را ببینید"; exit 1; }
sleep 5; run_step rotate "== rotation done ==" || say "چرخش ناموفق — بررسی لازم"
sleep 5; run_step cron "== cron done ==" || say "کرون ناموفق — بررسی لازم"
sleep 5; run_step verify "^== verify" || say "راستی‌آزمایی ناموفق — بررسی لازم"
sleep 5; run_step cleanup "== cleanup done ==" || say "پاک‌سازی ناموفق — بررسی لازم"

# 4) راستی‌آزمایی بیرونی نهایی
say "external checks:"
curl -sk --max-time 20 -o /dev/null -w "  login:%{http_code}\n" https://pouyafarhadi.ir/login | tee -a "$LOG"
curl -sk --max-time 20 -I https://pouyafarhadi.ir/login 2>/dev/null | grep -i strict-transport | tee -a "$LOG"
curl -sk --max-time 30 "${ORCH}&step=status" >> "$LOG" 2>&1 || true
say "=== resume-2180 finished ==="
