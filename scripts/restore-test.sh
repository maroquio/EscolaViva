#!/usr/bin/env bash
#
# I7 — restauração testada. RODAR TODA SEXTA E ANOTAR O RESULTADO na tabela "Medição semanal"
# do README, junto com a data e o nome do arquivo restaurado.
#
# "Backup não verificado não é backup." É a única invariante do curso escrita como frase de
# efeito, e provavelmente é por isso: este é o item que costuma ser empurrado para o fim do
# backlog e nunca acontece. Dez minutos por semana, antes de existir cliente real.
#
# O que ele faz: pega o dump mais recente (ou o caminho passado como argumento), cria um banco
# descartável ao lado do de origem, restaura, conta as matrículas ativas dos dois lados e
# compara. Derruba o banco descartável no fim, aconteça o que acontecer, e sai com código
# diferente de zero se a contagem não bater — para que um agendador perceba a falha.
#
# Uso:  bash scripts/restore-test.sh [caminho/do/arquivo.dump]

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$RAIZ/backups"

# Mesmas seis linhas de `backup.sh`: o shell não lê `.env` como o Bun lê.
if [[ -z "${DATABASE_URL:-}" && -f "$RAIZ/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$RAIZ/.env" | tail -n 1 | cut -d '=' -f 2-)"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: DATABASE_URL não definida. Exporte a variável ou preencha o .env." >&2
  exit 1
fi

# ── Cliente compatível (mesma escolha de `backup.sh`) ─────────────────────────────────────
# `pg_restore` recusa servidor mais novo do que ele. Se a restauração semanal dependesse de
# instalar um PostgreSQL igual ao do servidor, ela simplesmente não seria feita — que é
# exatamente o destino que o documento prevê para este item. Usa o cliente do PATH quando ele
# serve; quando não serve, usa o que já está dentro do container do banco, dizendo qual escolheu.
SERVICO_DO_BANCO=banco
COMPOSE=(docker compose -f "$RAIZ/docker-compose.yml")

versao_maior() { sed -E 's/[^0-9]*([0-9]+).*/\1/' <<< "$1"; }

versao_do_servidor() {
  command -v psql >/dev/null 2>&1 || return 0
  psql --no-psqlrc --tuples-only --no-align --command='SHOW server_version' "$DATABASE_URL" 2>/dev/null || true
}

url_de_dentro() { sed -E "s#(://[^@]+@)[^/:]+(:[0-9]+)?/#\1$SERVICO_DO_BANCO:5432/#" <<< "$1"; }

PREFIXO=()
URL_CLIENTE="$DATABASE_URL"
PRECISA_DO_CONTAINER=0

if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  PRECISA_DO_CONTAINER=1
else
  VERSAO_SERVIDOR="$(versao_do_servidor)"
  if [[ -n "$VERSAO_SERVIDOR" ]] &&
     (( $(versao_maior "$(pg_restore --version)") < $(versao_maior "$VERSAO_SERVIDOR") )); then
    PRECISA_DO_CONTAINER=1
  fi
fi

if [[ "$PRECISA_DO_CONTAINER" -eq 1 ]]; then
  if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICO_DO_BANCO"; then
    echo "ERRO: o pg_restore disponível é mais antigo que o servidor (ou não existe)." >&2
    echo "      Saída A: suba o banco com 'docker compose up -d $SERVICO_DO_BANCO' — este script" >&2
    echo "               usa o cliente de dentro do container." >&2
    echo "      Saída B: instale o cliente da mesma versão do servidor e ponha-o no PATH" >&2
    echo "               (postgresql-client-16 / brew install postgresql@16)." >&2
    exit 1
  fi
  PREFIXO=("${COMPOSE[@]}" exec -T "$SERVICO_DO_BANCO")
  URL_CLIENTE="$(url_de_dentro "$DATABASE_URL")"
fi

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$DESTINO"/escolaviva-*.dump 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERRO: nenhum dump encontrado. Rode 'bash scripts/backup.sh' primeiro." >&2
  exit 1
fi

# A URL do banco descartável é a de origem com outro nome de banco — mesmo servidor, mesmas
# credenciais, mesma configuração. Restaurar em outro servidor testaria outra coisa.
SEM_CONSULTA="${URL_CLIENTE%%\?*}"
CONSULTA=""
if [[ "$URL_CLIENTE" == *\?* ]]; then CONSULTA="?${URL_CLIENTE#*\?}"; fi
BASE="${SEM_CONSULTA%/*}"
BANCO_TEMP="escolaviva_restore_$(date +%Y%m%d%H%M%S)"
URL_ADMIN="$BASE/postgres$CONSULTA"
URL_TEMP="$BASE/$BANCO_TEMP$CONSULTA"

contar_ativas() {
  "${PREFIXO[@]}" psql --no-psqlrc --quiet --tuples-only --no-align \
       --dbname="$1" --command="SELECT count(*) FROM matricula WHERE situacao = 'ativa'" \
       | tr -d '[:space:]'
}

BANCO_CRIADO=0
derrubar() {
  if [[ "$BANCO_CRIADO" -eq 1 ]]; then
    "${PREFIXO[@]}" psql --no-psqlrc --quiet --dbname="$URL_ADMIN" \
         --command="DROP DATABASE IF EXISTS $BANCO_TEMP WITH (FORCE)" >/dev/null
    echo "Banco descartável $BANCO_TEMP removido."
  fi
}
trap derrubar EXIT

echo "Arquivo: ${DUMP#"$RAIZ"/}  ($(du -h "$DUMP" | cut -f 1))"
echo "Alvo:    $BANCO_TEMP (descartável)"
if [[ ${#PREFIXO[@]} -gt 0 ]]; then
  echo "Cliente: de dentro do container '$SERVICO_DO_BANCO' (o do PATH é mais antigo)"
fi
echo

ORIGEM="$(contar_ativas "$URL_CLIENTE")"
echo "Matrículas ativas na origem: $ORIGEM"

"${PREFIXO[@]}" psql --no-psqlrc --quiet --dbname="$URL_ADMIN" \
     --command="CREATE DATABASE $BANCO_TEMP" >/dev/null
BANCO_CRIADO=1

# O dump é lido da entrada padrão em vez de por caminho: o arquivo está no disco de quem roda o
# script, e o cliente pode estar dentro do container — só o fluxo atravessa os dois mundos.
INICIO=$(date +%s)
if ! "${PREFIXO[@]}" pg_restore --dbname="$URL_TEMP" --no-owner --no-privileges \
                                --exit-on-error < "$DUMP"; then
  echo
  echo "FALHOU: pg_restore não conseguiu restaurar o arquivo." >&2
  exit 2
fi
echo "Restaurado em $(( $(date +%s) - INICIO ))s."

RESTAURADO="$(contar_ativas "$URL_TEMP")"
echo "Matrículas ativas no restaurado: $RESTAURADO"
echo

if [[ "$ORIGEM" != "$RESTAURADO" ]]; then
  echo "FALHOU: origem $ORIGEM, restaurado $RESTAURADO (diferença de $((ORIGEM - RESTAURADO)))." >&2
  echo "        Ou o dump está velho, ou saiu incompleto. Investigue ANTES de precisar dele." >&2
  exit 3
fi

echo "PASSOU: $RESTAURADO matrículas ativas dos dois lados."
echo "Anote na tabela de medição semanal do README: data, arquivo e resultado."
