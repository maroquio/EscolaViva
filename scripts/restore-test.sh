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
    echo "ERRO: o pg_restore disponível é mais antigo que o servidor (ou não existe)." >&2
    echo "      Saída A: suba o banco com 'docker compose up -d $DB_SERVICE' — este script" >&2
    echo "               usa o cliente de dentro do container." >&2
    echo "      Saída B: instale o cliente da mesma versão do servidor e ponha-o no PATH" >&2
    echo "               (postgresql-client-16 / brew install postgresql@16)." >&2
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
  echo "ERRO: nenhum dump encontrado. Rode 'bash scripts/backup.sh' primeiro." >&2
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
    echo "Banco descartável $TEMP_DB removido."
  fi
}
trap teardown EXIT

echo "Arquivo: ${DUMP#"$ROOT"/}  ($(du -h "$DUMP" | cut -f 1))"
echo "Alvo:    $TEMP_DB (descartável)"
if [[ ${#PREFIX[@]} -gt 0 ]]; then
  echo "Cliente: de dentro do container '$DB_SERVICE' (o do PATH é mais antigo)"
fi
echo

SOURCE="$(count_active "$CLIENT_URL")"
echo "Matrículas ativas na origem: $SOURCE"

"${PREFIX[@]}" psql --no-psqlrc --quiet --dbname="$ADMIN_URL" \
     --command="CREATE DATABASE $TEMP_DB" >/dev/null
DB_CREATED=1

START=$(date +%s)
if ! "${PREFIX[@]}" pg_restore --dbname="$TEMP_URL" --no-owner --no-privileges \
                               --exit-on-error < "$DUMP"; then
  echo
  echo "FALHOU: pg_restore não conseguiu restaurar o arquivo." >&2
  exit 2
fi
echo "Restaurado em $(( $(date +%s) - START ))s."

RESTORED="$(count_active "$TEMP_URL")"
echo "Matrículas ativas no restaurado: $RESTORED"
echo

if [[ "$SOURCE" != "$RESTORED" ]]; then
  echo "FALHOU: origem $SOURCE, restaurado $RESTORED (diferença de $((SOURCE - RESTORED)))." >&2
  echo "        Ou o dump está velho, ou saiu incompleto. Investigue ANTES de precisar dele." >&2
  exit 3
fi

echo "PASSOU: $RESTORED matrículas ativas dos dois lados."
echo "Anote na tabela de medição semanal do README: data, arquivo e resultado."
