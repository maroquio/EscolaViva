#!/usr/bin/env bash
#
# Backup do banco do EscolaViva — a metade fácil da invariante I7.
#
# Gera um dump no formato custom do PostgreSQL (-Fc), que é comprimido e permite restauração
# seletiva por tabela. Guarda os 7 mais recentes e apaga o resto: retenção que cabe em disco de
# desenvolvimento e que obriga a olhar para o arquivo pelo menos uma vez por semana.
#
# A outra metade — a que decide se o backup vale alguma coisa — é `restore-test.sh`.
# Um dump que nunca foi restaurado é um arquivo, não um backup.
#
# Uso:  bash scripts/backup.sh
# Lê `DATABASE_URL` do ambiente e, se não achar, da linha correspondente no `.env`.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$RAIZ/backups"
RETENCAO=7

# Bun carrega o `.env` sozinho; o shell não. São seis linhas repetidas em `restore-test.sh`
# porque a árvore de arquivos do estágio não tem lugar para um terceiro script compartilhado.
if [[ -z "${DATABASE_URL:-}" && -f "$RAIZ/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$RAIZ/.env" | tail -n 1 | cut -d '=' -f 2-)"
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: DATABASE_URL não definida. Exporte a variável ou preencha o .env." >&2
  exit 1
fi

# ── Cliente compatível ────────────────────────────────────────────────────────────────────
# `pg_dump` se recusa a falar com servidor mais novo do que ele, e a versão que vem no sistema
# costuma ser mais antiga do que a do compose. Deixar assim transformaria I7 em "instale outro
# PostgreSQL antes" — e a invariante que o documento diz que nunca acontece continuaria não
# acontecendo. Então: usa o cliente do PATH quando ele serve; quando não serve, usa o que já
# está dentro do container do banco, e diz em voz alta qual escolheu. Nada é silencioso.
SERVICO_DO_BANCO=banco
COMPOSE=(docker compose -f "$RAIZ/docker-compose.yml")

versao_maior() { sed -E 's/[^0-9]*([0-9]+).*/\1/' <<< "$1"; }

# Só `pg_dump` e `pg_restore` são estritos; `psql` conversa com servidor mais novo sem reclamar.
versao_do_servidor() {
  command -v psql >/dev/null 2>&1 || return 0
  psql --no-psqlrc --tuples-only --no-align --command='SHOW server_version' "$DATABASE_URL" 2>/dev/null || true
}

# Dentro da rede do compose o banco atende pelo nome do serviço, não pelo host publicado.
url_de_dentro() { sed -E "s#(://[^@]+@)[^/:]+(:[0-9]+)?/#\1$SERVICO_DO_BANCO:5432/#" <<< "$1"; }

PREFIXO=()
URL_CLIENTE="$DATABASE_URL"
PRECISA_DO_CONTAINER=0

if ! command -v pg_dump >/dev/null 2>&1; then
  PRECISA_DO_CONTAINER=1
else
  VERSAO_SERVIDOR="$(versao_do_servidor)"
  if [[ -n "$VERSAO_SERVIDOR" ]] &&
     (( $(versao_maior "$(pg_dump --version)") < $(versao_maior "$VERSAO_SERVIDOR") )); then
    PRECISA_DO_CONTAINER=1
  fi
fi

if [[ "$PRECISA_DO_CONTAINER" -eq 1 ]]; then
  if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICO_DO_BANCO"; then
    echo "ERRO: o pg_dump disponível é mais antigo que o servidor (ou não existe)." >&2
    echo "      Saída A: suba o banco com 'docker compose up -d $SERVICO_DO_BANCO' — este script" >&2
    echo "               usa o cliente de dentro do container." >&2
    echo "      Saída B: instale o cliente da mesma versão do servidor e ponha-o no PATH" >&2
    echo "               (postgresql-client-16 / brew install postgresql@16)." >&2
    exit 1
  fi
  PREFIXO=("${COMPOSE[@]}" exec -T "$SERVICO_DO_BANCO")
  URL_CLIENTE="$(url_de_dentro "$DATABASE_URL")"
fi

# O console mostra para onde a conexão vai, nunca usuário e senha.
sem_credenciais() { printf '%s' "$1" | sed -E 's#://[^@/]+@#://***@#'; }

mkdir -p "$DESTINO"
CARIMBO="$(date +%Y%m%d-%H%M%S)"
ARQUIVO="$DESTINO/escolaviva-$CARIMBO.dump"

echo "Banco:   $(sem_credenciais "$DATABASE_URL")"
echo "Destino: ${ARQUIVO#"$RAIZ"/}"
if [[ ${#PREFIXO[@]} -gt 0 ]]; then
  echo "Cliente: pg_dump de dentro do container '$SERVICO_DO_BANCO' (o do PATH é mais antigo)"
else
  echo "Cliente: $(pg_dump --version)"
fi

# Grava em um arquivo parcial e só então renomeia: um dump interrompido no meio nunca entra
# na contagem de retenção nem é confundido com backup bom.
PARCIAL="$ARQUIVO.parcial"
trap 'rm -f "$PARCIAL"' EXIT

# O dump sai pela saída padrão em vez de `--file`: assim o arquivo nasce no disco de quem roda
# o script, e não dentro do container quando o cliente é o de lá.
INICIO=$(date +%s)
"${PREFIXO[@]}" pg_dump --format=custom --compress=6 --no-owner --no-privileges \
                        "$URL_CLIENTE" > "$PARCIAL"
mv "$PARCIAL" "$ARQUIVO"

TAMANHO="$(du -h "$ARQUIVO" | cut -f 1)"
echo "Pronto em $(( $(date +%s) - INICIO ))s · $TAMANHO"

# `ls -t` lista do mais novo para o mais velho; do oitavo em diante sai.
ls -1t "$DESTINO"/escolaviva-*.dump 2>/dev/null \
  | tail -n "+$((RETENCAO + 1))" \
  | while read -r antigo; do
  rm -f "$antigo"
  echo "Removido por retenção: $(basename "$antigo")"
done

TOTAL="$(ls -1 "$DESTINO"/escolaviva-*.dump 2>/dev/null | wc -l | tr -d ' ')"
echo "$TOTAL backup(s) em ${DESTINO#"$RAIZ"/}/ (retenção: $RETENCAO)."
echo
echo "Falta a metade que conta: bash scripts/restore-test.sh"
