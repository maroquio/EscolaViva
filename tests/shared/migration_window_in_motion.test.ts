/*
 * The compatibility window of ADR 0003, applied end to end against a real database.
 *
 * `migration_window.test.ts` reads SQL and refuses the shapes that compress the window. This file
 * does the opposite job: it runs the window, step by step, and shows what each step buys. The
 * question it answers is not "does the checker work" — it is "why is the rule shaped like this".
 *
 * The change on trial is the one ADR 0003 names explicitly: renaming a column. The previous
 * version of the code reads `nome`; the new one wants `full_name`. Done in one instant, the
 * previous version falls. Done in four steps, it never notices.
 *
 * Two isolations keep this file from leaking into the suite:
 *
 *   A schema of its own. `clearDatabase` builds its TRUNCATE from the catalog of `public`, and a
 *   scratch table appearing and disappearing there would rot the memoized command of whatever
 *   file runs next.
 *
 *   A connection of its own, with a single session. Half the cases here provoke a statement that
 *   fails on purpose, and a failure is not something to hand back to a pool the rest of the suite
 *   is still using.
 */

import { SQL } from 'bun';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { config } from '../../src/shared/config';

const SCHEMA = 'migration_window_demo';
const TABLE = `${SCHEMA}.pessoa`;

/** What the version already deployed knows how to do. It has never heard of `full_name`. */
const PREVIOUS_VERSION_READS = `SELECT nome FROM ${TABLE} ORDER BY nome`;
const PREVIOUS_VERSION_WRITES = `INSERT INTO ${TABLE} (id, nome) VALUES (gen_random_uuid(), 'Bruno')`;

/** What the version being deployed does. */
const NEW_VERSION_READS = `SELECT full_name FROM ${TABLE} ORDER BY full_name`;

const connection = new SQL({ url: config.databaseUrl, max: 1 });

const run = (statement: string): Promise<unknown> => connection.unsafe(statement);

const namesFrom = (rows: unknown): string[] =>
  (rows as Record<string, string>[]).map((row) => row['nome'] ?? row['full_name'] ?? '');

/** Steps 1 and 2 of ADR 0003: add — never NOT NULL without a default — and migrate the data. */
const openTheWindow = async (): Promise<void> => {
  await run(`ALTER TABLE ${TABLE} ADD COLUMN full_name text`);
  await run(`UPDATE ${TABLE} SET full_name = nome`);
};

/** Step 4: drop, once step 3 has held long enough that no rollback is plausible. */
const closeTheWindow = async (): Promise<void> => {
  await run(`ALTER TABLE ${TABLE} ALTER COLUMN full_name SET NOT NULL`);
  await run(`ALTER TABLE ${TABLE} DROP COLUMN nome`);
};

/** Runs a statement expecting it to fail, and hands back the message it failed with. */
const refusalOf = async (statement: () => Promise<unknown>): Promise<string> => {
  try {
    await statement();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('a instrução passou, e o caso existe justamente porque ela não deveria passar');
};

beforeEach(async () => {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await run(`CREATE SCHEMA ${SCHEMA}`);
  await run(`CREATE TABLE ${TABLE} (id uuid PRIMARY KEY, nome text NOT NULL)`);
  await run(`INSERT INTO ${TABLE} (id, nome) VALUES (gen_random_uuid(), 'Ana')`);
});

afterAll(async () => {
  await run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await connection.close();
});

/* ------------------------------------------------------------------------- */

describe('the window in motion: renaming a column without taking the previous version down', () => {
  test('with the window open, both versions read the same row', async () => {
    await openTheWindow();

    expect(namesFrom(await run(PREVIOUS_VERSION_READS))).toEqual(['Ana']);
    expect(namesFrom(await run(NEW_VERSION_READS))).toEqual(['Ana']);
  });

  /*
   * Why step 1 says "never NOT NULL without a default": the previous version writes the columns
   * it knows, and it does not know this one. Had the column been born NOT NULL, this INSERT — an
   * ordinary request, in flight while the deploy runs — would have failed.
   */
  test('with the window open, the previous version still writes', async () => {
    await openTheWindow();

    await run(PREVIOUS_VERSION_WRITES);

    expect(namesFrom(await run(PREVIOUS_VERSION_READS))).toEqual(['Ana', 'Bruno']);
  });

  /*
   * Why step 3 exists, and why it is a task and not a good intention: the row the previous version
   * wrote during the window carries no `full_name`. Closing before that version is off the air
   * corrupts nothing — it simply refuses, and the deploy stops.
   */
  test('closing while the previous version is still writing refuses', async () => {
    await openTheWindow();
    await run(PREVIOUS_VERSION_WRITES);

    const refusal = await refusalOf(closeTheWindow);

    expect(refusal).toContain('full_name');
    expect(namesFrom(await run(PREVIOUS_VERSION_READS))).toEqual(['Ana', 'Bruno']);
  });

  test('once nobody writes the old column, closing drops it and keeps the new one', async () => {
    await openTheWindow();
    await run(PREVIOUS_VERSION_WRITES);
    await run(`UPDATE ${TABLE} SET full_name = nome WHERE full_name IS NULL`);

    await closeTheWindow();

    expect(namesFrom(await run(NEW_VERSION_READS))).toEqual(['Ana', 'Bruno']);
    expect(await refusalOf(() => run(PREVIOUS_VERSION_READS))).toContain('nome');
  });

  /*
   * The photographic negative of everything above, and the reason the rule is written down. One
   * statement, no interval: the previous version's read stops working at the instant the migration
   * commits, with requests still in flight.
   */
  test('the one-step rename takes the previous version down at that very instant', async () => {
    await run(`ALTER TABLE ${TABLE} RENAME COLUMN nome TO full_name`);

    expect(namesFrom(await run(NEW_VERSION_READS))).toEqual(['Ana']);
    expect(await refusalOf(() => run(PREVIOUS_VERSION_READS))).toContain('nome');
    expect(await refusalOf(() => run(PREVIOUS_VERSION_WRITES))).toContain('nome');
  });
});
