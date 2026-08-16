/*
 * I15 and I21 against the real PostgreSQL. `reader()`/`writer()` exist so that every query states
 * its intent, and `unitOfWork` is the application's single commit point: if it let a committed
 * write slip through when a use case fails halfway, a transfer would create the destination
 * enrollment without closing the one it came from.
 */

import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { checkDatabase, reader, unitOfWork, writer } from '../../src/shared/db';
import { clearDatabase, prepareDatabase, testSql } from '../support/database';
import { createNetwork } from '../support/factories';

const ROOT = resolve(import.meta.dir, '..', '..');
const DB_MODULE = resolve(ROOT, 'src', 'shared', 'db', 'index.ts');
/** A port with nothing listening: the connection is refused on the spot. */
const INVALID_URL = 'postgres://ninguem:nada@127.0.0.1:5599/inexistente';
/** An address that does not route: the connection hangs until the deadline runs out. */
const UNRESPONSIVE_URL = 'postgres://ninguem:nada@10.255.255.1:5432/inexistente';
const SHORT_DEADLINE_MS = 300;
const GENEROUS_DEADLINE_MS = 5000;

/**
 * A few behaviours only show up under a different database configuration or with the pool closed —
 * either of which would contaminate the test files that come next, since they run in the same
 * process. That is why this handful of cases runs in a separate process, with the environment the
 * case needs.
 */
async function runWithAnotherDatabase(code: string, databaseUrl: string): Promise<string> {
  // The helper process ends on its own: the hanging connection attempt against a database that
  // does not answer is still alive after `checkDatabase` has already returned — which is precisely
  // what proves the check does not wait on the connection.
  const program = [
    `const db = await import(${JSON.stringify(DB_MODULE)});`,
    code,
    'process.exit(0);',
  ].join('\n');
  const child = Bun.spawn({
    cmd: ['bun', '-e', program],
    cwd: ROOT,
    env: { ...Bun.env, DATABASE_URL: databaseUrl, APP_ENV: 'test' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`processo auxiliar terminou em ${exitCode}: ${stderr}`);
  }
  return stdout.trim();
}

async function networkExists(id: string): Promise<boolean> {
  const rows = await testSql()<{ id: string }[]>`SELECT id FROM network WHERE id = ${id}`;
  return rows.length === 1;
}

async function schoolExists(id: string): Promise<boolean> {
  const rows = await testSql()<{ id: string }[]>`SELECT id FROM school WHERE id = ${id}`;
  return rows.length === 1;
}

async function networkName(id: string): Promise<string | null> {
  const rows = await testSql()<{ name: string }[]>`SELECT name FROM network WHERE id = ${id}`;
  return rows[0]?.name ?? null;
}

/** Gives back the error the function threw; fails the test if it worked instead. */
async function captureError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('a operação foi concluída quando deveria ter falhado');
}

beforeAll(prepareDatabase);
beforeEach(clearDatabase);

describe('reader and writer', () => {
  test('reader() answers a query', async () => {
    const connection = reader();

    const rows = await connection<{ one: number }[]>`SELECT 1 AS one`;

    expect(rows[0]?.one).toBe(1);
  });

  test('writer() answers a query', async () => {
    const connection = writer();

    const rows = await connection<{ one: number }[]>`SELECT 1 AS one`;

    expect(rows[0]?.one).toBe(1);
  });

  test('at stage 01 both point to the same primary', () => {
    const forReading = reader();

    const forWriting = writer();

    expect(forReading).toBe(forWriting);
  });

  test('writer() sees what the suite wrote to the database', async () => {
    const network = await createNetwork({ name: 'Rede da Conexão' });

    const rows = await writer()<{ name: string }[]>`SELECT name FROM network WHERE id = ${network.id}`;

    expect(rows[0]?.name).toBe('Rede da Conexão');
  });
});

describe('checkDatabase', () => {
  test('gives back true while the database is up', async () => {
    const deadline = GENEROUS_DEADLINE_MS;

    const responded = await checkDatabase(deadline);

    expect(responded).toBe(true);
  });

  test('gives back false when the database URL is invalid and the deadline is short', async () => {
    const deadline = SHORT_DEADLINE_MS;

    const stdout = await runWithAnotherDatabase(
      `console.log(await db.checkDatabase(${deadline}));`,
      INVALID_URL,
    );

    expect(stdout).toBe('false');
  });

  test('does not hang the route when the database will not answer: the deadline wins', async () => {
    const measure = [
      'const start = Date.now();',
      `const responded = await db.checkDatabase(${SHORT_DEADLINE_MS});`,
      'console.log(JSON.stringify({ responded, ms: Date.now() - start }));',
    ].join('\n');

    const stdout = await runWithAnotherDatabase(measure, UNRESPONSIVE_URL);

    const measurement = JSON.parse(stdout) as { responded: boolean; ms: number };
    expect(measurement.responded).toBe(false);
    expect(measurement.ms).toBeLessThan(GENEROUS_DEADLINE_MS);
  });
});

describe('closeDatabase', () => {
  test('closes the pool without error, even when called twice', async () => {
    const endTwice = 'await db.closeDatabase(); await db.closeDatabase(); console.log("encerrado");';

    const stdout = await runWithAnotherDatabase(endTwice, INVALID_URL);

    expect(stdout).toBe('encerrado');
  });
});

describe('unitOfWork — the happy path', () => {
  test('commits what the function wrote', async () => {
    const networkId = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Comitada', 'rede-comitada')`;
    });

    expect(await networkExists(networkId)).toBe(true);
  });

  test('gives back the value the function produced', async () => {
    const expected = { enrollmentId: 'm-1', status: 'active' };

    const returned = await unitOfWork(async () => expected);

    expect(returned).toEqual(expected);
  });

  test('commits writes to two different tables in one go', async () => {
    const networkId = crypto.randomUUID();
    const schoolId = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Dupla', 'rede-dupla')`;
      await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${networkId}, 'Escola Central')`;
    });

    expect(await networkExists(networkId)).toBe(true);
    expect(await schoolExists(schoolId)).toBe(true);
  });

  test('the write becomes visible to another connection only after the commit', async () => {
    const networkId = crypto.randomUUID();
    let visibleDuringTheTransaction = true;

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede em Voo', 'rede-em-voo')`;
      visibleDuringTheTransaction = await networkExists(networkId);
    });

    expect(visibleDuringTheTransaction).toBe(false);
    expect(await networkExists(networkId)).toBe(true);
  });
});

describe('unitOfWork — rollback', () => {
  test('undoes the writes to BOTH tables when the function throws', async () => {
    const networkId = crypto.randomUUID();
    const schoolId = crypto.randomUUID();

    const error = await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Desfeita', 'rede-desfeita')`;
        await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${networkId}, 'Escola Desfeita')`;
        throw new Error('falhou depois de escrever nas duas tabelas');
      }),
    );

    expect(error.message).toBe('falhou depois de escrever nas duas tabelas');
    expect(await networkExists(networkId)).toBe(false);
    expect(await schoolExists(schoolId)).toBe(false);
  });

  test('also undoes the change to a row that already existed before the transaction', async () => {
    const network = await createNetwork({ name: 'Nome Original' });
    const schoolId = crypto.randomUUID();

    await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`UPDATE network SET name = 'Nome Trocado' WHERE id = ${network.id}`;
        await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${network.id}, 'Escola Nova')`;
        throw new Error('falhou depois do update e do insert');
      }),
    );

    expect(await networkName(network.id)).toBe('Nome Original');
    expect(await schoolExists(schoolId)).toBe(false);
  });

  test('propagates the caller\'s original exception, without swapping it for another', async () => {
    const original = new Error('matrícula ativa já existe no ano letivo');

    const error = await captureError(() =>
      unitOfWork(async () => {
        throw original;
      }),
    );

    expect(error).toBe(original);
  });

  test('undoes everything when the thrower is the database itself, over a constraint violation', async () => {
    const networkId = crypto.randomUUID();
    const existing = await createNetwork({ slug: 'slug-disputado' });

    const error = await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Nova', 'rede-nova')`;
        await sql`INSERT INTO network (id, name, slug) VALUES (${crypto.randomUUID()}, 'Rede Repetida', ${existing.slug})`;
      }),
    );

    expect(error.message).toContain('network_slug_unique');
    expect(await networkExists(networkId)).toBe(false);
  });

  test('a transaction that fails does not carry off what another one already committed', async () => {
    const committed = crypto.randomUUID();
    const rolledBack = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${committed}, 'Rede Firme', 'rede-firme')`;
    });
    await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${rolledBack}, 'Rede Frágil', 'rede-fragil')`;
        throw new Error('falhou depois da outra transação ter comitado');
      }),
    );

    expect(await networkExists(committed)).toBe(true);
    expect(await networkExists(rolledBack)).toBe(false);
  });
});
