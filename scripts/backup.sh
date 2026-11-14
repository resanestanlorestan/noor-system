#!/usr/bin/env bash
# Local development/staging backup helper. NOT a production backup solution.
# Requires DATABASE_URL in the environment (see .env) and the uploads directory
# under .private-app/. Produces a timestamped custom-format pg_dump plus a tar
# of private uploads, both written to the backups/ directory (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL must be set (check your .env file)}"
mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"
db_file="backups/db-${stamp}.dump"
uploads_file="backups/uploads-${stamp}.tar.gz"
echo "Dumping database to ${db_file} ..."
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$db_file"
if [ -d ".private-app/uploads" ]; then
  echo "Archiving private uploads to ${uploads_file} ..."
  tar -czf "$uploads_file" -C .private-app uploads
else
  echo "No .private-app/uploads directory found; skipping document archive."
fi
echo "Done. Keep backups/ outside the web root and encrypt before moving off this machine."
