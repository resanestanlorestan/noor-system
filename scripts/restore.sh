#!/usr/bin/env bash
# Local development/staging restore helper. NOT for production use.
# Usage: scripts/restore.sh backups/db-20260101-120000.dump [backups/uploads-20260101-120000.tar.gz]
# Restores into the database referenced by DATABASE_URL. This is destructive:
# it will overwrite existing objects with the same names. Confirm before running.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL must be set (check your .env file)}"
db_file="${1:?Usage: scripts/restore.sh <db-dump-file> [uploads-tar-file]}"
uploads_file="${2:-}"
echo "This will restore '$db_file' into the database at DATABASE_URL, overwriting matching objects."
read -r -p "Type YES to continue: " confirmation
[ "$confirmation" = "YES" ] || { echo "Aborted."; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$db_file"
if [ -n "$uploads_file" ]; then
  echo "Restoring private uploads from $uploads_file ..."
  mkdir -p .private-app
  tar -xzf "$uploads_file" -C .private-app
fi
echo "Restore complete. Verify application health at /api/health before relying on this environment."
