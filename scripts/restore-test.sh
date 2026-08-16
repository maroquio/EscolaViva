#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/backups"

if [[ -z "${DATABASE_URL:-}" && -f "$ROOT/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | tail -n 1 | cut -d '=' -f 2-)"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Export the variable or fill in the .env." >&2
  exit 1
fi

DB_SERVICE=database
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")

major_version() { sed -E 's/[^0-9]*([0-9]+).*/\1/' <<< "$1"; }

server_version() {
  command -v psql >/dev/null 2>&1 || return 0
  psql --no-psqlrc --tuples-only --no-align --command='SHOW server_version' "$DATABASE_URL" 2>/dev/null || true
}

internal_url() { sed -E "s#(://[^@]+@)[^/:]+(:[0-9]+)?/#\1$DB_SERVICE:5432/#" <<< "$1"; }

PREFIX=()
CLIENT_URL="$DATABASE_URL"
NEEDS_CONTAINER=0

if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  NEEDS_CONTAINER=1
else
  SERVER_VERSION="$(server_version)"
  if [[ -n "$SERVER_VERSION" ]] &&
     (( $(major_version "$(pg_restore --version)") < $(major_version "$SERVER_VERSION") )); then
    NEEDS_CONTAINER=1
  fi
fi

if [[ "$NEEDS_CONTAINER" -eq 1 ]]; then
  if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$DB_SERVICE"; then
    echo "ERROR: the pg_restore on hand is older than the server (or is not there at all)." >&2
    echo "       Way out A: bring the database up with 'docker compose up -d $DB_SERVICE' —" >&2
    echo "                  this script then uses the client from inside the container." >&2
    echo "       Way out B: install the client of the same version as the server and put it" >&2
    echo "                  on the PATH (postgresql-client-16 / brew install postgresql@16)." >&2
    exit 1
  fi
  PREFIX=("${COMPOSE[@]}" exec -T "$DB_SERVICE")
  CLIENT_URL="$(internal_url "$DATABASE_URL")"
fi

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$DEST"/escolaviva-*.dump 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: no dump found. Run 'bash scripts/backup.sh' first." >&2
  exit 1
fi

WITHOUT_QUERY="${CLIENT_URL%%\?*}"
QUERY=""
if [[ "$CLIENT_URL" == *\?* ]]; then QUERY="?${CLIENT_URL#*\?}"; fi
BASE="${WITHOUT_QUERY%/*}"
TEMP_DB="escolaviva_restore_$(date +%Y%m%d%H%M%S)"
ADMIN_URL="$BASE/postgres$QUERY"
TEMP_URL="$BASE/$TEMP_DB$QUERY"

count_active() {
  "${PREFIX[@]}" psql --no-psqlrc --quiet --tuples-only --no-align \
       --dbname="$1" --command="SELECT count(*) FROM enrollment WHERE status = 'active'" \
       | tr -d '[:space:]'
}

DB_CREATED=0
teardown() {
  if [[ "$DB_CREATED" -eq 1 ]]; then
    "${PREFIX[@]}" psql --no-psqlrc --quiet --dbname="$ADMIN_URL" \
         --command="DROP DATABASE IF EXISTS $TEMP_DB WITH (FORCE)" >/dev/null
    echo "Throwaway database $TEMP_DB removed."
  fi
}
trap teardown EXIT

echo "File:   ${DUMP#"$ROOT"/}  ($(du -h "$DUMP" | cut -f 1))"
echo "Target: $TEMP_DB (throwaway)"
if [[ ${#PREFIX[@]} -gt 0 ]]; then
  echo "Client: from inside the '$DB_SERVICE' container (the one on PATH is older)"
fi
echo

SOURCE="$(count_active "$CLIENT_URL")"
echo "Active enrollments at the source: $SOURCE"

"${PREFIX[@]}" psql --no-psqlrc --quiet --dbname="$ADMIN_URL" \
     --command="CREATE DATABASE $TEMP_DB" >/dev/null
DB_CREATED=1

START=$(date +%s)
if ! "${PREFIX[@]}" pg_restore --dbname="$TEMP_URL" --no-owner --no-privileges \
                               --exit-on-error < "$DUMP"; then
  echo
  echo "FAILED: pg_restore could not restore the file." >&2
  exit 2
fi
echo "Restored in $(( $(date +%s) - START ))s."

RESTORED="$(count_active "$TEMP_URL")"
echo "Active enrollments in the restore: $RESTORED"
echo

if [[ "$SOURCE" != "$RESTORED" ]]; then
  echo "FAILED: source $SOURCE, restore $RESTORED (a gap of $((SOURCE - RESTORED)))." >&2
  echo "        Either the dump is stale, or it came out incomplete. Look into it BEFORE you need it." >&2
  exit 3
fi

echo "PASSED: $RESTORED active enrollments on both sides."
echo "Note it in the weekly measurement table of the README: date, file and result."
