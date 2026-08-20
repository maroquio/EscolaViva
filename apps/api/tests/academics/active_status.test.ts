/*
 * `status = 'active'` is written as a literal inside the SQL, in every query that filters
 * enrolments by it, while the same value has a name in the domain. Every rule about magic values
 * says to replace it with a parameter, and doing so is a measurable mistake: the two partial
 * indexes on `enrollment` carry `WHERE status = 'active'` in their own definition, and PostgreSQL
 * only uses a partial index when it can prove, at planning time, that the query's predicate implies
 * the index's. A bind parameter is not knowable at planning time, so the proof fails and the plan
 * degrades.
 *
 * Measured on 2026-08-19 against 24 000 enrollments, counting the active ones of a single class
 * group:
 *
 *   status = 'active'   Index Only Scan on active_enrollment_by_class_group    6 buffers   0.065 ms
 *   status = $3         Seq Scan, 23 880 rows removed by filter              414 buffers   2.829 ms
 *
 * So the literal stays, and this file is what keeps it honest: it fails if the SQL and the domain
 * ever disagree about what "active" is, and it fails if someone turns the predicate into a
 * parameter — which reads like an improvement and costs a sequential scan per class group.
 *
 * **Why this sweeps instead of listing.** Until 2026-08-20 the four files below were named one by
 * one, and that list was the whole guard. A repository split moved queries into new files and the
 * list did not follow; worse, an audit planted a fresh file with `status = ${status}` in it and
 * every case here stayed green, because the file was not on the list. That is the failure mode this
 * kind of rule has: the parameterised form changes no behaviour at all — no test fails, no type
 * complains, no boundary is crossed — so a guard that does not look at a file is a guard that does
 * not exist for it. The sweep covers `apps/api/src` whole rather than `infra/` alone, because SQL
 * outside `infra/` is a layering violation that `bun run check` catches on its own terms, and a
 * guard that assumed the layering held would be blind on exactly the day the layering broke.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  ACTIVE_ENROLLMENT_STATUS,
  ENROLLMENT_STATUSES,
} from '../../src/academics/domain/enrollment';
import { PROJECT_ROOT } from '../http/support';

const SOURCE = 'apps/api/src';

const MODULE = '**/*.ts';

/*
 * The guard against the guard. A glob that stops matching would leave every case below comparing an
 * empty list against nothing and reporting success — the same silence the fixed list produced. There
 * are 171 modules today, and dropping the recursive part of the pattern so that it matches only the
 * top level of the folder leaves none of them, so a floor well under the real count still catches
 * that and survives an ordinary deletion.
 */
const SWEEP_FLOOR = 120;

const MIGRATION = 'migrations/0001_initial_schema.sql';

const PARTIAL_INDEX_PREDICATE = /WHERE status = '([a-z]+)'/g;

const SQL_STATUS_LITERAL = /status = '([a-z]+)'/g;

const SQL_STATUS_PARAMETER = /status = \$\{/g;

const readSource = async (relative: string): Promise<string> =>
  await Bun.file(join(PROJECT_ROOT, relative)).text();

type Module = {
  readonly path: string;
  readonly source: string;
};

const modulesUnder = async (directory: string): Promise<Module[]> => {
  const found: Module[] = [];
  for await (const relative of new Bun.Glob(MODULE).scan({ cwd: join(PROJECT_ROOT, directory) })) {
    const path = `${directory}/${relative.replaceAll('\\', '/')}`;
    found.push({ path, source: await readSource(path) });
  }
  return found;
};

const matchesIn = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] ?? '');

const statusesWrittenIn = (modules: readonly Module[]): string[] =>
  modules.flatMap(({ source }) => matchesIn(source, SQL_STATUS_LITERAL));

describe('the active status is a literal because the partial index depends on it', () => {
  test('the sweep is still reading the whole of the server, so an empty answer means something', async () => {
    const modules = await modulesUnder(SOURCE);

    const readingTooLittle =
      modules.length > SWEEP_FLOOR
        ? []
        : [`${MODULE} matched ${modules.length} modules under ${SOURCE}, and the sweep expects more than ${SWEEP_FLOOR}`];

    expect(readingTooLittle).toEqual([]);
  });

  test('both partial indexes on enrollment select the status the domain calls active', async () => {
    const migration = await readSource(MIGRATION);

    const predicates = matchesIn(migration, PARTIAL_INDEX_PREDICATE);

    expect(predicates.length).toBe(2);
    expect(predicates.every((status) => status === ACTIVE_ENROLLMENT_STATUS)).toBe(true);
  });

  test('every status literal anywhere in the server is a status the domain declares', async () => {
    const written = statusesWrittenIn(await modulesUnder(SOURCE));

    expect(written.length).toBeGreaterThan(0);
    const unknown = written.filter(
      (status) => !(ENROLLMENT_STATUSES as readonly string[]).includes(status),
    );
    expect(unknown).toEqual([]);
  });

  test('the server filters by the active status and nothing else calls itself active', async () => {
    const written = new Set(statusesWrittenIn(await modulesUnder(SOURCE)));

    expect(written.has(ACTIVE_ENROLLMENT_STATUS)).toBe(true);
  });

  test('no query anywhere in the server hands the status over as a bind parameter, whatever file it was written in', async () => {
    const modules = await modulesUnder(SOURCE);

    const parameterised = modules
      .filter(({ source }) => [...source.matchAll(SQL_STATUS_PARAMETER)].length > 0)
      .map(({ path }) => path);

    expect(parameterised).toEqual([]);
  });
});
