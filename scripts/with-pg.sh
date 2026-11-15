#!/usr/bin/env bash
# Starts PostgreSQL fresh (killing any lingering instance), waits for full
# readiness, runs "$@", then kills PG. Immune to shutdown/startup races.
set -e
BASE=/tmp/my-project/scripts/pgserver
BIN=$BASE/node_modules/@embedded-postgres/linux-x64/native/bin
DATA=$BASE/data
export LD_LIBRARY_PATH=$BASE/libs/usr/lib/x86_64-linux-gnu:$BASE/node_modules/@embedded-postgres/linux-x64/native/lib

pg_port_open() { (exec 3<>/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; }

# 1) hard-kill any running instance and wait for the port to close
pkill -9 postgres 2>/dev/null || true
for i in $(seq 1 15); do pg_port_open || break; sleep 1; done
sleep 1

# 2) start fresh
setsid "$BIN/postgres" -D "$DATA" -p 5432 -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off </dev/null >/tmp/pg-wrap.log 2>&1 &

# 3) wait until a REAL query succeeds (TCP open is not enough — recovery must finish)
READY=0
for i in $(seq 1 90); do
  if node -e "
    const {Client} = require('/tmp/dumptool/node_modules/pg');
    const c = new Client({host:'127.0.0.1',port:5432,user:'noor',password:'noor_dev_2026',database:'postgres'});
    c.connect().then(async()=>{await c.query('select 1');await c.end();process.exit(0)})
    .catch(()=>process.exit(1));
    setTimeout(()=>process.exit(1),3000);
  " 2>/dev/null; then READY=1; break; fi
  if grep -qE "shut down|PANIC" /tmp/pg-wrap.log 2>/dev/null && ! pg_port_open; then echo "PG FAILED"; tail -6 /tmp/pg-wrap.log; exit 1; fi
  sleep 2
done
[ "$READY" = "1" ] || { echo "PG NOT READY"; tail -8 /tmp/pg-wrap.log; exit 1; }
sleep 1

# 4) run the actual command
"$@"
RC=$?

# 5) stop
pkill -9 postgres 2>/dev/null || true
sleep 1
exit $RC
