#!/usr/bin/env bash
# Starts the portable PostgreSQL cluster used by noor-system dev/tests.
# Cluster lives under my-project so it survives sandbox recycling.
set -e
BIN=/home/z/my-project/scripts/pg-tools/node_modules/@embedded-postgres/linux-x64/native/bin
DATA=/home/z/my-project/scripts/pg-tools/data/db
LOG=/home/z/my-project/scripts/pg-tools/data/pg.log

if [ ! -d "$DATA" ]; then
  echo "initialising new cluster..."
  "$BIN/initdb" -D "$DATA" -U noor --pwfile=<(echo noor_dev_2026) -E UTF8 --locale=C >/dev/null
  # Trust local connections for the test harness (password auth also configured).
  echo "host all all 127.0.0.1/32 md5" >> "$DATA/pg_hba.conf"
  echo "create db postgres owner noor"
fi

mkdir -p "$(dirname "$LOG")"
"$BIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-p 5432 -c listen_addresses=127.0.0.1" start
sleep 1
# Ensure expected login role + databases exist (idempotent).
"$BIN/psql" -h 127.0.0.1 -p 5432 -U noor -d postgres -c "select 1" >/dev/null 2>&1 || {
  # role may not exist if cluster was initialised differently
  "$BIN/psql" -h 127.0.0.1 -p 5432 -d postgres -c "create role noor login password 'noor_dev_2026' superuser" || true
}
PGPASSWORD=noor_dev_2026 "$BIN/psql" -h 127.0.0.1 -p 5432 -U noor -d postgres -tc "select 1 from pg_database where datname='noor_dev'" | grep -q 1 || \
  PGPASSWORD=noor_dev_2026 "$BIN/psql" -h 127.0.0.1 -p 5432 -U noor -d postgres -c "create database noor_dev owner noor"
echo "postgres ready on 127.0.0.1:5432 (user noor)"
