/*
 * Banco de verdade para a suíte: as migrações sobem uma vez por processo e as tabelas são
 * truncadas entre os casos. Não existe mock de banco em lugar nenhum destes testes — a maior
 * parte das regras do EscolaViva mora em constraint, índice único e transação, e mock nenhum
 * as exerce.
 */

import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../../src/shared/config';
import type { Conexao } from '../../src/shared/db';

/** A mesma chave de `scripts/migrate.ts`: dois processos de teste não migram ao mesmo tempo. */
const CHAVE_DE_LOCK = 4242;
const DIRETORIO_DE_MIGRACOES = resolve(import.meta.dir, '..', '..', 'migrations');
const TABELA_DE_CONTROLE = 'schema_migrations';
const MAX_CONEXOES = 4;

let pool: SQL | undefined;
let migracoes: Promise<void> | undefined;
let comandoDeLimpeza: Promise<string> | undefined;

/** A conexão crua da suíte, para asserção direta no banco e para as fábricas escreverem. */
export function sqlDeTeste(): Conexao {
  pool ??= new SQL({ url: config.databaseUrl, max: MAX_CONEXOES });
  return pool;
}

async function arquivosDeMigracao(): Promise<string[]> {
  const nomes: string[] = [];
  for await (const nome of new Bun.Glob('*.sql').scan({ cwd: DIRETORIO_DE_MIGRACOES })) {
    nomes.push(nome);
  }
  return nomes.sort();
}

async function versoesAplicadas(sql: Conexao): Promise<Set<string>> {
  const linhas = await sql<{ versao: string }[]>`SELECT versao FROM schema_migrations`;
  return new Set(linhas.map((linha) => linha.versao));
}

/** Uma transação por arquivo: o DDL e o registro da versão sobem juntos ou não sobem. */
async function aplicar(sql: Conexao, versao: string): Promise<void> {
  const conteudo = await Bun.file(join(DIRETORIO_DE_MIGRACOES, versao)).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(conteudo);
    await tx`INSERT INTO schema_migrations (versao) VALUES (${versao})`;
  });
}

/**
 * Conexão própria com uma única sessão: o advisory lock pertence à sessão, e um pool poderia
 * pegar o lock em uma conexão e soltá-lo em outra.
 */
async function aplicarMigracoes(): Promise<void> {
  const sql = new SQL({ url: config.databaseUrl, max: 1 });
  try {
    await sql`SELECT pg_advisory_lock(${CHAVE_DE_LOCK})`;
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          versao      text PRIMARY KEY,
          aplicada_em timestamptz NOT NULL DEFAULT now()
        )
      `;
      const aplicadas = await versoesAplicadas(sql);
      for (const versao of await arquivosDeMigracao()) {
        if (aplicadas.has(versao)) continue;
        await aplicar(sql, versao);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(${CHAVE_DE_LOCK})`;
    }
  } finally {
    await sql.close();
  }
}

/**
 * Aplica todas as migrações no banco de teste. A promessa é memoizada no módulo: chamar em
 * `beforeAll` de cada arquivo custa nada a partir da segunda vez.
 */
export async function prepararBanco(): Promise<void> {
  migracoes ??= aplicarMigracoes();
  await migracoes;
}

/**
 * A lista sai do catálogo em vez de ficar escrita à mão: migração nova não pode deixar tabela
 * suja para trás sem que ninguém perceba. `schema_migrations` fica de fora — truncá-la faria a
 * suíte reaplicar o DDL a cada caso.
 */
async function montarComandoDeLimpeza(): Promise<string> {
  const sql = sqlDeTeste();
  const linhas = await sql<{ nome: string }[]>`
    SELECT table_name AS nome
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> ${TABELA_DE_CONTROLE}
    ORDER BY table_name
  `;
  const tabelas = linhas.map((linha) => `"${linha.nome}"`).join(', ');
  return `TRUNCATE TABLE ${tabelas} RESTART IDENTITY CASCADE`;
}

/**
 * Uma instrução só, com CASCADE, para caber em `beforeEach` sem pesar: cada caso começa do
 * zero e nenhum depende da ordem em que a suíte rodou.
 */
export async function limparBanco(): Promise<void> {
  await prepararBanco();
  comandoDeLimpeza ??= montarComandoDeLimpeza();
  await sqlDeTeste().unsafe(await comandoDeLimpeza);
}

/**
 * Encerra o pool da suíte. O pool volta a nascer na próxima chamada de `sqlDeTeste()` porque
 * `bun test` roda todos os arquivos no mesmo processo: um `afterAll` que fecha aqui não pode
 * derrubar o arquivo seguinte.
 */
export async function fecharBanco(): Promise<void> {
  const aberto = pool;
  pool = undefined;
  await aberto?.close();
}
