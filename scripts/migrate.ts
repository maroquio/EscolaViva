import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../src/shared/config/index';
import { LOCK_KEYS, MIGRATIONS } from '../src/shared/constants';
import { ARGUMENTS, MIGRATION_MESSAGES as MESSAGES } from './constants';

const MIGRATIONS_DIRECTORY = resolve(import.meta.dir, '..', MIGRATIONS.directory);

type Args = { readonly statusOnly: boolean; readonly url: string };

function readArgs(argv: readonly string[]): Args {
  const remaining = [...argv];
  let statusOnly = false;
  let url = config.databaseUrl;

  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === ARGUMENTS.status) {
      statusOnly = true;
      continue;
    }
    if (argument === ARGUMENTS.url) {
      const value = remaining.shift();
      if (value === undefined || value.startsWith(ARGUMENTS.prefix)) {
        throw new Error(MESSAGES.urlWithoutValue);
      }
      url = value;
      continue;
    }
    throw new Error(MESSAGES.unknownArgument(String(argument)));
  }

  return { statusOnly, url };
}

function readableTarget(url: string): string {
  const address = new URL(url);
  return `${address.host}${address.pathname}`;
}

async function migrationFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const name of new Bun.Glob(MIGRATIONS.glob).scan({ cwd: MIGRATIONS_DIRECTORY })) {
    names.push(name);
  }
  return names.sort();
}

async function ensureControlTable(sql: SQL): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'schema_migrations' AND column_name = 'versao'
      ) THEN
        ALTER TABLE schema_migrations RENAME COLUMN versao TO version;
        ALTER TABLE schema_migrations RENAME COLUMN aplicada_em TO applied_at;
      END IF;
    END
    $$
  `;
}

async function appliedVersions(sql: SQL): Promise<Map<string, Date>> {
  const control: { present: boolean }[] =
    await sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS present`;
  if (control[0]?.present !== true) {
    return new Map();
  }
  const rows: { version: string; applied_at: Date }[] =
    await sql`SELECT version, applied_at FROM schema_migrations ORDER BY version`;
  return new Map(rows.map((row) => [row.version, row.applied_at]));
}

async function apply(sql: SQL, version: string): Promise<void> {
  const content = await Bun.file(join(MIGRATIONS_DIRECTORY, version)).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
  });
}

function printStatus(files: readonly string[], applied: ReadonlyMap<string, Date>): void {
  let pending = 0;
  for (const version of files) {
    const appliedAt = applied.get(version);
    if (appliedAt === undefined) {
      pending += 1;
      console.log(MESSAGES.status.pending(version));
      continue;
    }
    console.log(MESSAGES.status.applied(version, appliedAt.toISOString()));
  }
  for (const version of applied.keys()) {
    if (!files.includes(version)) {
      console.log(MESSAGES.status.withoutFile(version));
    }
  }
  console.log(MESSAGES.status.summary(files.length - pending, pending));
}

async function applyPending(sql: SQL, files: readonly string[]): Promise<void> {
  const applied = await appliedVersions(sql);
  const pending = files.filter((version) => !applied.has(version));

  if (pending.length === 0) {
    console.log(MESSAGES.application.nothingToApply);
    return;
  }

  for (const version of pending) {
    const start = Date.now();
    await apply(sql, version);
    console.log(MESSAGES.application.applied(version, Date.now() - start));
  }
  console.log(
    pending.length === 1 ? MESSAGES.application.one : MESSAGES.application.many(pending.length),
  );
}

async function run(): Promise<void> {
  const args = readArgs(Bun.argv.slice(ARGUMENTS.firstUserArg));
  const sql = new SQL({ url: args.url, max: 1 });

  try {
    console.log(MESSAGES.target(readableTarget(args.url)));
    const files = await migrationFiles();

    if (args.statusOnly) {
      printStatus(files, await appliedVersions(sql));
      return;
    }

    await sql`SELECT pg_advisory_lock(${LOCK_KEYS.migration})`;
    try {
      await ensureControlTable(sql);
      await applyPending(sql, files);
    } finally {
      await sql`SELECT pg_advisory_unlock(${LOCK_KEYS.migration})`;
    }
  } finally {
    await sql.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(MESSAGES.failure(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
