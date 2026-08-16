#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/backups"
RETENTION=7

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

if ! command -v pg_dump >/dev/null 2>&1; then
  NEEDS_CONTAINER=1
else
  SERVER_VERSION="$(server_version)"
  if [[ -n "$SERVER_VERSION" ]] &&
     (( $(major_version "$(pg_dump --version)") < $(major_version "$SERVER_VERSION") )); then
    NEEDS_CONTAINER=1
  fi
fi

if [[ "$NEEDS_CONTAINER" -eq 1 ]]; then
  if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$DB_SERVICE"; then
    echo "ERROR: the pg_dump on hand is older than the server (or is not there at all)." >&2
    echo "       Way out A: bring the database up with 'docker compose up -d $DB_SERVICE' —" >&2
    echo "                  this script then uses the client from inside the container." >&2
    echo "       Way out B: install the client of the same version as the server and put it" >&2
    echo "                  on the PATH (postgresql-client-16 / brew install postgresql@16)." >&2
    exit 1
  fi
  PREFIX=("${COMPOSE[@]}" exec -T "$DB_SERVICE")
  CLIENT_URL="$(internal_url "$DATABASE_URL")"
fi

without_credentials() { printf '%s' "$1" | sed -E 's#://[^@/]+@#://***@#'; }

mkdir -p "$DEST"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/escolaviva-$TIMESTAMP.dump"

echo "Database: $(without_credentials "$DATABASE_URL")"
echo "Target:   ${FILE#"$ROOT"/}"
if [[ ${#PREFIX[@]} -gt 0 ]]; then
  echo "Client:   pg_dump from inside the '$DB_SERVICE' container (the one on PATH is older)"
else
  echo "Client:   $(pg_dump --version)"
fi

PARTIAL="$FILE.parcial"
trap 'rm -f "$PARTIAL"' EXIT

START=$(date +%s)
"${PREFIX[@]}" pg_dump --format=custom --compress=6 --no-owner --no-privileges \
                       "$CLIENT_URL" > "$PARTIAL"
mv "$PARTIAL" "$FILE"

SIZE="$(du -h "$FILE" | cut -f 1)"
echo "Done in $(( $(date +%s) - START ))s · $SIZE"

ls -1t "$DEST"/escolaviva-*.dump 2>/dev/null \
  | tail -n "+$((RETENTION + 1))" \
  | while read -r old; do
  rm -f "$old"
  echo "Removed by retention: $(basename "$old")"
done

TOTAL="$(ls -1 "$DEST"/escolaviva-*.dump 2>/dev/null | wc -l | tr -d ' ')"
echo "$TOTAL backup(s) in ${DEST#"$ROOT"/}/ (retention: $RETENTION)."
echo
echo "The half that counts is still missing: bash scripts/restore-test.sh"
