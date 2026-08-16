/*
 * Banco de verdade para a suíte: as migrações sobem uma vez por processo e as tabelas são
 * truncadas entre os casos. Não existe mock de banco em lugar nenhum destes testes — a maior
 * parte das regras do EscolaViva mora em constraint, índice único e transação, e mock nenhum
 * as exerce.
 */

import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../../src/shared/config';
import type { Connection } from '../../src/shared/db';

/** A mesma chave de `scripts/migrate.ts`: dois processos de teste não migram ao mesmo tempo. */
const LOCK_KEY = 4242;
const MIGRATIONS_DIR = resolve(import.meta.dir, '..', '..', 'migrations');
const CONTROL_TABLE = 'schema_migrations';
const MAX_CONNECTIONS = 4;

let pool: SQL | undefined;
let migrations: Promise<void> | undefined;
let truncateCommand: Promise<string> | undefined;

/** A conexão crua da suíte, para asserção direta no banco e para as fábricas escreverem. */
export function testSql(): Connection {
  pool ??= new SQL({ url: config.databaseUrl, max: MAX_CONNECTIONS });
  return pool;
}

async function migrationFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const name of new Bun.Glob('*.sql').scan({ cwd: MIGRATIONS_DIR })) {
    names.push(name);
  }
  return names.sort();
}

async function appliedVersions(sql: Connection): Promise<Set<string>> {
  const rows = await sql<{ versao: string }[]>`SELECT versao FROM schema_migrations`;
  return new Set(rows.map((row) => row.versao));
}

/** Uma transação por arquivo: o DDL e o registro da versão sobem juntos ou não sobem. */
async function apply(sql: Connection, versao: string): Promise<void> {
  const content = await Bun.file(join(MIGRATIONS_DIR, versao)).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`INSERT INTO schema_migrations (versao) VALUES (${versao})`;
  });
}

/**
 * Conexão própria com uma única sessão: o advisory lock pertence à sessão, e um pool poderia
 * pegar o lock em uma conexão e soltá-lo em outra.
 */
async function applyMigrations(): Promise<void> {
  const sql = new SQL({ url: config.databaseUrl, max: 1 });
  try {
    await sql`SELECT pg_advisory_lock(${LOCK_KEY})`;
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          versao      text PRIMARY KEY,
          aplicada_em timestamptz NOT NULL DEFAULT now()
        )
      `;
      const applied = await appliedVersions(sql);
      for (const versao of await migrationFiles()) {
        if (applied.has(versao)) continue;
        await apply(sql, versao);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`;
    }
  } finally {
    await sql.close();
  }
}

/**
 * Aplica todas as migrações no banco de teste. A promessa é memoizada no módulo: chamar em
 * `beforeAll` de cada arquivo custa nada a partir da segunda vez.
 */
export async function prepareDatabase(): Promise<void> {
  migrations ??= applyMigrations();
  await migrations;
}

/**
 * A lista sai do catálogo em vez de ficar escrita à mão: migração nova não pode deixar tabela
 * suja para trás sem que ninguém perceba. `schema_migrations` fica de fora — truncá-la faria a
 * suíte reaplicar o DDL a cada caso.
 */
async function buildTruncateCommand(): Promise<string> {
  const sql = testSql();
  const rows = await sql<{ name: string }[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> ${CONTROL_TABLE}
    ORDER BY table_name
  `;
  const tables = rows.map((row) => `"${row.name}"`).join(', ');
  return `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`;
}

/**
 * Uma instrução só, com CASCADE, para caber em `beforeEach` sem pesar: cada caso começa do
 * zero e nenhum depende da ordem em que a suíte rodou.
 */
export async function clearDatabase(): Promise<void> {
  await prepareDatabase();
  truncateCommand ??= buildTruncateCommand();
  await testSql().unsafe(await truncateCommand);
}

/**
 * Encerra o pool da suíte. O pool volta a nascer na próxima chamada de `sqlDeTeste()` porque
 * `bun test` roda todos os arquivos no mesmo processo: um `afterAll` que fecha aqui não pode
 * derrubar o arquivo seguinte.
 */
export async function closeTestDatabase(): Promise<void> {
  const openPool = pool;
  pool = undefined;
  await openPool?.close();
}
