#!/bin/bash
# رانندگی استقرار ۲.۱۸.۰ — هر اکشن جدا اجرا و راستی‌آزمایی می‌شود
# usage: bash drive-2180.sh status|deploy|rotate|cron|setenv-off|setenv-restore|dbcheck|cleanup|selfdestruct|live|cronlive
set -u
cd /home/z/my-project/scripts
TOK=$(cat /tmp/orch-token)
ACT="${1:-status}"

call_orch() { # action
  curl -sk --max-time 600 "https://pouyafarhadi.ir/orch-2180.php?t=${TOK}&action=$1"
}

case "$ACT" in
  status|deploy|rotate|cron|setenv-off|setenv-restore|dbcheck|cleanup|selfdestruct)
    call_orch "$ACT"
    ;;
  live)
    echo "== [1] /api/health =="
    curl -sk --max-time 30 -o /tmp/live-health.json -w 'http=%{http_code}\n' https://pouyafarhadi.ir/api/health
    cat /tmp/live-health.json; echo
    echo "== [2] /login =="
    curl -sk --max-time 30 -o /dev/null -w 'http=%{http_code}\n' https://pouyafarhadi.ir/login
    echo "== [3] HSTS header =="
    curl -skI --max-time 30 https://pouyafarhadi.ir/login | grep -i 'strict-transport' || echo "HSTS MISSING!!"
    echo "== [4] cron P1: no-auth =="
    curl -sk --max-time 30 -o /dev/null -w 'http=%{http_code}\n' https://pouyafarhadi.ir/api/cron/events
    echo "== [5] cron P1: ?key=OLD =="
    curl -sk --max-time 30 -o /dev/null -w 'http=%{http_code}\n' 'https://pouyafarhadi.ir/api/cron/events?key=b1f3d74064db976bc90c66d891ee96ff4cb69ac8bff7be08'
    echo "== [6] cron P1: wrong Bearer =="
    curl -sk --max-time 30 -o /dev/null -w 'http=%{http_code}\n' -H 'Authorization: Bearer wrong-token-test-000' https://pouyafarhadi.ir/api/cron/events
    echo "== [7] old stubs must be gone =="
    for f in upload-514cff.php deploy-9f3c1a.php orch-2180.php; do
      curl -sk --max-time 30 -o /dev/null -w "  $f http=%{http_code}\n" "https://pouyafarhadi.ir/$f"
    done
    echo "== live done =="
    ;;
  cronlive)
    echo "== real Bearer tick (secret read into var, never printed) =="
    SEC=$(bash cpread.sh /home/epqoisdl .cron-secret-2180 100 | tr -d '\n\r' | head -1)
    [ -n "$SEC" ] || { echo "SECRET_FETCH_FAILED"; exit 1; }
    echo "secret-length: ${#SEC}"
    curl -sk --max-time 120 -w '\nhttp=%{http_code}\n' -H "Authorization: Bearer ${SEC}" https://pouyafarhadi.ir/api/cron/events
    ;;
  *)
    echo "usage: $0 status|deploy|rotate|cron|setenv-off|setenv-restore|dbcheck|cleanup|selfdestruct|live|cronlive"
    ;;
esac
