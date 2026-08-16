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
  echo "ERRO: DATABASE_URL não definida. Exporte a variável ou preencha o .env." >&2
  exit 1
fi

DB_SERVICE=banco
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
    echo "ERRO: o pg_dump disponível é mais antigo que o servidor (ou não existe)." >&2
    echo "      Saída A: suba o banco com 'docker compose up -d $DB_SERVICE' — este script" >&2
    echo "               usa o cliente de dentro do container." >&2
    echo "      Saída B: instale o cliente da mesma versão do servidor e ponha-o no PATH" >&2
    echo "               (postgresql-client-16 / brew install postgresql@16)." >&2
    exit 1
  fi
  PREFIX=("${COMPOSE[@]}" exec -T "$DB_SERVICE")
  CLIENT_URL="$(internal_url "$DATABASE_URL")"
fi

without_credentials() { printf '%s' "$1" | sed -E 's#://[^@/]+@#://***@#'; }

mkdir -p "$DEST"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/escolaviva-$TIMESTAMP.dump"

echo "Banco:   $(without_credentials "$DATABASE_URL")"
echo "Destino: ${FILE#"$ROOT"/}"
if [[ ${#PREFIX[@]} -gt 0 ]]; then
  echo "Cliente: pg_dump de dentro do container '$DB_SERVICE' (o do PATH é mais antigo)"
else
  echo "Cliente: $(pg_dump --version)"
fi

PARTIAL="$FILE.parcial"
trap 'rm -f "$PARTIAL"' EXIT

START=$(date +%s)
"${PREFIX[@]}" pg_dump --format=custom --compress=6 --no-owner --no-privileges \
                       "$CLIENT_URL" > "$PARTIAL"
mv "$PARTIAL" "$FILE"

SIZE="$(du -h "$FILE" | cut -f 1)"
echo "Pronto em $(( $(date +%s) - START ))s · $SIZE"

ls -1t "$DEST"/escolaviva-*.dump 2>/dev/null \
  | tail -n "+$((RETENTION + 1))" \
  | while read -r old; do
  rm -f "$old"
  echo "Removido por retenção: $(basename "$old")"
done

TOTAL="$(ls -1 "$DEST"/escolaviva-*.dump 2>/dev/null | wc -l | tr -d ' ')"
echo "$TOTAL backup(s) em ${DEST#"$ROOT"/}/ (retenção: $RETENTION)."
echo
echo "Falta a metade que conta: bash scripts/restore-test.sh"
