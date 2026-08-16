/*
 * A real database for the suite: the migrations run once per process and the tables are
 * truncated between cases. There is no database mock anywhere in these tests — most of the
 * EscolaViva rules live in constraints, unique indexes and transactions, and no mock
 * exercises those.
 */

import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../../src/shared/config';
import type { Connection } from '../../src/shared/db';

/** The same key as `scripts/migrate.ts`: two test processes never migrate at the same time. */
const LOCK_KEY = 4242;
const MIGRATIONS_DIR = resolve(import.meta.dir, '..', '..', 'migrations');
const CONTROL_TABLE = 'schema_migrations';
const MAX_CONNECTIONS = 4;

let pool: SQL | undefined;
let migrations: Promise<void> | undefined;
let truncateCommand: Promise<string> | undefined;

/** The suite's raw connection, for asserting straight against the database and for the factories to write through. */
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

/** One transaction per file: the DDL and the version record land together or not at all. */
async function apply(sql: Connection, versao: string): Promise<void> {
  const content = await Bun.file(join(MIGRATIONS_DIR, versao)).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`INSERT INTO schema_migrations (versao) VALUES (${versao})`;
  });
}

/**
 * A connection of its own with a single session: the advisory lock belongs to the session, and
 * a pool could take the lock on one connection and release it on another.
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
 * Applies every migration to the test database. The promise is memoized in the module: calling
 * it from each file's `beforeAll` costs nothing from the second time on.
 */
export async function prepareDatabase(): Promise<void> {
  migrations ??= applyMigrations();
  await migrations;
}

/**
 * The list comes from the catalog instead of being written by hand: a new migration must not
 * leave a dirty table behind without anyone noticing. `schema_migrations` stays out — truncating
 * it would make the suite reapply the DDL for every case.
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
 * A single statement, with CASCADE, so it fits into `beforeEach` without weighing on it: every
 * case starts from zero and none depends on the order the suite ran in.
 */
export async function clearDatabase(): Promise<void> {
  await prepareDatabase();
  truncateCommand ??= buildTruncateCommand();
  await testSql().unsafe(await truncateCommand);
}

/**
 * Shuts down the suite's pool. The pool is born again on the next call to `testSql()` because
 * `bun test` runs every file in the same process: an `afterAll` that closes here must not take
 * the next file down with it.
 */
export async function closeTestDatabase(): Promise<void> {
  const openPool = pool;
  pool = undefined;
  await openPool?.close();
}
