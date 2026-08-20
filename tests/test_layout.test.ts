/*
 * Where a test lives, and the rule that decides it.
 *
 * A test has a **subject**: the thing it makes claims about. There are three subjects in this
 * repository, and each one keeps its tests somewhere different — not by convention, but because the
 * three have different lifetimes:
 *
 *   the code of a package     ->  inside the package        it moves when the package moves; if
 *                                 (apps/*\/tests)            `apps/api` is ever extracted, its suite
 *                                                           goes with it in one move
 *
 *   the running system        ->  e2e/                      another runtime (Node) and another
 *                                                           runner (Playwright); needs a server, a
 *                                                           build and a browser
 *
 *   the project itself        ->  tests/                    files, configuration, conventions,
 *                                                           documentation, packaging — owned by no
 *                                                           package
 *
 * The question that sorts any new test is one: **does it import the code of a package?** If it does,
 * it belongs to that package. If it only reads files, it belongs to the project.
 *
 * That rule was applied by hand once, in August 2026, and applied incompletely: six files moved out
 * of the API suite and a seventh — `backup_and_restore`, which reads `scripts/backup.sh` and imports
 * nothing — stayed behind for another day. This file exists so the rule stops depending on whoever
 * remembers it.
 *
 * There is no fifth home and no exemption. `budget.test.ts` was one for a while — it weighs `dist/`,
 * so it may not run before `build:web` — and the reason turned out to be about *when* it runs, not
 * about where it lives: it sits with the rest of the front suite and is reached through a config of
 * its own. A test does not earn a corner of the tree for a scheduling reason.
 *
 * It also pins the decision that `src/` holds production code and nothing else. Three things in the
 * repository lean on that: the image copies `apps/api/src` whole, `magic-values` sweeps
 * `apps/api/src/**` without exceptions, and the diagram counts `*\/domain/!(index).ts` as aggregates.
 * A single `enrollment.test.ts` sitting in `src/` would ship to production, be swept for magic
 * values, and be counted as an aggregate.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const TEST_FILE = '**/*.{test,spec}.{ts,tsx}';

type Home = {
  readonly directory: string;
  readonly subject: string;
  readonly runner: string;
};

const HOMES: readonly Home[] = [
  { directory: 'apps/api/tests', subject: 'the API', runner: 'bun test' },
  { directory: 'apps/web/tests', subject: 'the front', runner: 'vitest' },
  { directory: 'tests', subject: 'the project', runner: 'bun test' },
  { directory: 'e2e', subject: 'the running system', runner: 'playwright' },
];

const IGNORED = ['node_modules', 'dist', 'test-results', '.git'];

const isIgnored = (path: string): boolean =>
  IGNORED.some((part) => path.split('/').includes(part));

async function everyTestFile(): Promise<string[]> {
  const found: string[] = [];
  for await (const relative of new Bun.Glob(TEST_FILE).scan({ cwd: ROOT })) {
    const path = relative.replaceAll('\\', '/');
    if (!isIgnored(path)) found.push(path);
  }
  return found.sort();
}

const filesIn = async (directory: string): Promise<string[]> => {
  const found: string[] = [];
  for await (const relative of new Bun.Glob(TEST_FILE).scan({ cwd: join(ROOT, directory) })) {
    found.push(`${directory}/${relative.replaceAll('\\', '/')}`);
  }
  return found;
};

const readsPackageCode = (content: string): boolean =>
  /from\s+'(?:\.\.\/)*(?:\.\.\/)apps\/|from\s+'\.\.\/\.\.\/src\/|from\s+'@escolaviva\//.test(content);

describe('every test has a home, and the home follows from its subject', () => {
  test('the four homes all exist and none of them is empty', async () => {
    const counted = await Promise.all(
      HOMES.map(async (home) => ({ home, files: await filesIn(home.directory) })),
    );

    const empty = counted.filter(({ files }) => files.length === 0);

    expect(empty.map(({ home }) => home.directory)).toEqual([]);
  });

  test('no test file lives outside the four homes — there is no fifth, and no exception', async () => {
    const all = await everyTestFile();
    const housed = new Set((await Promise.all(HOMES.map((home) => filesIn(home.directory)))).flat());

    const stray = all.filter((path) => !housed.has(path));

    expect(stray).toEqual([]);
  });

  /*
   * `src/` is production code. This is the case that says so out loud.
   */
  test('no package keeps a test inside src, where only production code belongs', async () => {
    const all = await everyTestFile();

    const inside = all.filter((path) => /^(?:apps|packages)\/[^/]+\/src\//.test(path));

    expect(inside).toEqual([]);
  });

  /*
   * The rule itself, checked in the direction that catches the mistake that was actually made: a
   * test whose subject is a package, filed under the project.
   */
  test('nothing in tests/ imports the code of a package — that would make it the package\'s test', async () => {
    const project = await filesIn('tests');

    const misfiled: string[] = [];
    for (const path of project) {
      if (readsPackageCode(await Bun.file(join(ROOT, path)).text())) misfiled.push(path);
    }

    expect(misfiled).toEqual([]);
  });

  test('the sweep reads the whole repository, so an empty answer means something', async () => {
    const all = await everyTestFile();

    expect(all.length).toBeGreaterThan(80);
  });
});
