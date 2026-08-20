/*
 * The Stage 01 document describes the schema. This file makes it answer for that.
 *
 * `docs/ESCOLAVIVA_STAGE_01.md` carries the data model in `CREATE TABLE` blocks, and it is the only
 * place that explains why each table looks the way it does. That kind of document rots quietly: it
 * fell out of step with the code three times, and all three times it was found by someone reading
 * it, not by anything running. A prose description nobody checks is worse than none — it is wrong
 * with the authority of documentation.
 *
 * What is compared: the set of tables, the set of indexes, and, table by table, the columns and the
 * named constraints. What is deliberately not compared: `created_at`, `updated_at` and the triggers,
 * which the document's own conventions declare omitted from every block — and that declaration is
 * itself asserted below, so the exemption cannot quietly widen.
 *
 * The document is the expectation and the migration is the truth: when they diverge, it is the
 * document that has to move, unless the schema is what went wrong.
 */

import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { existingPath } from './support/paths';

const DOCUMENT = 'docs/ESCOLAVIVA_STAGE_01.md';
const MIGRATION = 'migrations/0001_initial_schema.sql';

const PROJECT_ROOT = join(import.meta.dir, '..');

/** The two columns every business table carries, and which the document states it leaves out. */
const OMITTED_BY_CONVENTION = ['created_at', 'updated_at'];

const OMISSION_NOTICE =
  'The blocks below omit `created_at`, `updated_at` and the triggers';

type Table = { columns: string[]; constraints: string[] };

const read = async (path: string): Promise<string> =>
  await Bun.file(join(PROJECT_ROOT, await existingPath(path))).text();

/**
 * Reads the `CREATE TABLE` blocks of a file. Both sides go through the same reader, so a
 * difference in the result is a difference in the schema, never in how each side was parsed.
 */
const tablesOf = (sql: string): Map<string, Table> => {
  const tables = new Map<string, Table>();
  for (const match of sql.matchAll(/^CREATE TABLE ([a-z_]+) \(\n([\s\S]*?)^\);/gm)) {
    const [, name = '', body = ''] = match;
    const columns: string[] = [];
    const constraints: string[] = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim().replace(/,$/, '');
      if (line === '' || line.startsWith('--')) continue;
      if (line.toUpperCase().startsWith('CONSTRAINT')) {
        constraints.push(line.split(/\s+/)[1] ?? '');
      } else if (line.toUpperCase().startsWith('PRIMARY KEY')) {
        constraints.push(`PRIMARY KEY${line.slice('PRIMARY KEY'.length).replace(/\s+/g, '')}`);
      } else {
        columns.push(line.split(/\s+/)[0] ?? '');
      }
    }
    tables.set(name, { columns, constraints: constraints.sort() });
  }
  return tables;
};

const indexesOf = (sql: string): string[] =>
  [...sql.matchAll(/^CREATE (?:UNIQUE )?INDEX ([a-z_]+)/gm)]
    .map((match) => match[1] ?? '')
    .sort();

const documented = async (): Promise<Map<string, Table>> => tablesOf(await read(DOCUMENT));
const created = async (): Promise<Map<string, Table>> => tablesOf(await read(MIGRATION));

/* ------------------------------------------------------------------------- */

describe('the Stage 01 document describes the schema that exists', () => {
  test('it names every table the migration creates, and no other', async () => {
    const [inDocument, inMigration] = await Promise.all([documented(), created()]);

    expect([...inDocument.keys()].sort()).toEqual([...inMigration.keys()].sort());
    expect(inMigration.size).toBeGreaterThan(0);
  });

  test('it names every index the migration creates, and no other', async () => {
    const [document, migration] = await Promise.all([read(DOCUMENT), read(MIGRATION)]);

    expect(indexesOf(document)).toEqual(indexesOf(migration));
    expect(indexesOf(migration).length).toBeGreaterThan(0);
  });

  test('every table carries the same columns on both sides', async () => {
    const [inDocument, inMigration] = await Promise.all([documented(), created()]);

    const divergent = [...inMigration].flatMap(([name, table]) => {
      const expected = table.columns.filter((column) => !OMITTED_BY_CONVENTION.includes(column));
      const written = inDocument.get(name)?.columns ?? [];
      return written.join() === expected.join()
        ? []
        : [`${name}: the document says [${written}], the migration creates [${expected}]`];
    });

    expect(divergent).toEqual([]);
  });

  test('every table carries the same named constraints on both sides', async () => {
    const [inDocument, inMigration] = await Promise.all([documented(), created()]);

    const divergent = [...inMigration].flatMap(([name, table]) => {
      const written = inDocument.get(name)?.constraints ?? [];
      return written.join() === table.constraints.join()
        ? []
        : [`${name}: the document says [${written}], the migration declares [${table.constraints}]`];
    });

    expect(divergent).toEqual([]);
  });

  /*
   * The exemption above is only honest while the document keeps saying it takes it. Without this
   * case, deleting the notice would silently turn two missing columns per table into the rule.
   */
  test('the document states that it omits the timestamps, and omits them everywhere', async () => {
    const document = await read(DOCUMENT);

    expect(document).toContain(OMISSION_NOTICE);
    const stillWritten = [...tablesOf(document)].flatMap(([name, table]) =>
      table.columns
        .filter((column) => OMITTED_BY_CONVENTION.includes(column))
        .map((column) => `${name}.${column}`),
    );

    expect(stillWritten).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */

/*
 * The comparison above is only worth something if a divergence really does break it. These cases
 * feed the reader a document that drifted, and demand the difference show up.
 */
describe('the comparison does catch a document that drifted', () => {
  const SCHEMA = `CREATE TABLE aluno (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  CONSTRAINT aluno_name_unique UNIQUE (network_id, name)
);`;

  test('a column dropped from the document shows up as a difference', () => {
    const drifted = SCHEMA.replace('  name        text NOT NULL,\n', '');

    expect(tablesOf(drifted).get('aluno')?.columns).not.toEqual(
      tablesOf(SCHEMA).get('aluno')?.columns,
    );
  });

  test('a renamed constraint shows up as a difference', () => {
    const drifted = SCHEMA.replace('aluno_name_unique', 'aluno_nome_unico');

    expect(tablesOf(drifted).get('aluno')?.constraints).not.toEqual(
      tablesOf(SCHEMA).get('aluno')?.constraints,
    );
  });

  test('a table that exists on one side only shows up as a difference', () => {
    const drifted = `${SCHEMA}\n\nCREATE TABLE responsavel (\n  id uuid PRIMARY KEY\n);`;

    expect([...tablesOf(drifted).keys()]).not.toEqual([...tablesOf(SCHEMA).keys()]);
  });

  test('an index that exists on one side only shows up as a difference', () => {
    const withIndex = `${SCHEMA}\nCREATE INDEX aluno_by_name ON aluno (network_id, name);`;

    expect(indexesOf(withIndex)).not.toEqual(indexesOf(SCHEMA));
  });
});
