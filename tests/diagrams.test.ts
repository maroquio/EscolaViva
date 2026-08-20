/*
 * The numbers a diagram states out loud, checked against the repository that is supposed to contain
 * them.
 *
 * The architecture drawing carries a panel — *The system in numbers* — and until 2026-08-17 one of
 * its cells read **45 · .eta templates**. Those files had been deleted, along with the whole
 * server-rendered layer, and nothing noticed: a diagram is an image, `bun run verify` never opens it,
 * and the person reading it has no way to tell a current number from a stale one. It survived the
 * removal of the very thing it counted.
 *
 * That is what makes a diagram worse than out-of-date prose. Prose that lies still reads like prose;
 * a number that lies reads like a measurement. So the panel is treated here as an assertion the
 * repository has to satisfy, cell by cell.
 *
 * **What this cannot check, said plainly:** the shape of the drawing. Boxes, arrows and the sentences
 * inside them are not verified by anything, and a wrong arrow will go on being wrong. What is covered
 * is the part that pretends to be a fact.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const ROOT = join(import.meta.dir, '..');

const DIAGRAMS = join(ROOT, 'docs', 'diagrams');

/*
 * One folder per generation date, and the newest is the one that describes the repository as it
 * stands. The older ones are history and are deliberately left alone — an earlier generation is a
 * record of what the system was, and rewriting it would destroy the only evidence that a migration
 * did not touch the domain.
 */
const newestGeneration = (): string => {
  const dated = readdirSync(DIAGRAMS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = dated.at(-1);
  if (newest === undefined) throw new Error('docs/diagrams has no dated folder');
  return newest;
};

const architecture = async (): Promise<string> =>
  await Bun.file(join(DIAGRAMS, newestGeneration(), 'architecture', 'architecture.svg')).text();

const countFiles = async (directory: string, pattern: string): Promise<number> => {
  let total = 0;
  for await (const _ of new Bun.Glob(pattern).scan({ cwd: join(ROOT, directory) })) total += 1;
  return total;
};

const countIn = async (pattern: string, needle: string | RegExp): Promise<number> => {
  let total = 0;
  const test = typeof needle === 'string' ? (line: string) => line.includes(needle) : undefined;
  for await (const relative of new Bun.Glob(pattern).scan({ cwd: ROOT })) {
    const content = await Bun.file(join(ROOT, relative)).text();
    total += content
      .split('\n')
      .filter((line) => (test === undefined ? (needle as RegExp).test(line) : test(line))).length;
  }
  return total;
};

/* Every `<number>` immediately followed by its label, which is how the panel is laid out. */
const panel = async (): Promise<Map<string, number>> => {
  const svg = await architecture();
  const start = svg.indexOf('The system in numbers');
  expect(start).toBeGreaterThan(-1);

  const cells = new Map<string, number>();
  const cell = /<text[^>]*>(\d+)<\/text>\s*<text[^>]*>([^<]+)<\/text>/g;
  for (const [, value, label] of svg.slice(start).matchAll(cell)) {
    if (!cells.has(label as string)) cells.set(label as string, Number(value));
  }
  return cells;
};

/* ------------------------------------------------------------------------- */

describe('the newest architecture diagram counts what the repository holds', () => {
  /*
   * The guard against the guard. If the panel stopped being found — renamed, restyled, exported by a
   * different tool — every case below would compare an empty map against nothing and pass. This is
   * the case that fails instead.
   */
  test('the numbers panel was found, and it has cells', async () => {
    const cells = await panel();

    expect(cells.size).toBeGreaterThanOrEqual(6);
  });

  test('bounded contexts', async () => {
    const cells = await panel();
    const modules = ['identity', 'academics', 'assessment', 'communication'];

    expect(cells.get('bounded contexts')).toBe(modules.length);
  });

  test('use cases', async () => {
    const cells = await panel();

    expect(cells.get('use cases')).toBe(await countFiles('apps/api/src', '*/application/!(index).ts'));
  });

  test('aggregates', async () => {
    const cells = await panel();

    expect(cells.get('aggregates')).toBe(await countFiles('apps/api/src', '*/domain/!(index).ts'));
  });

  test('repositories', async () => {
    const cells = await panel();

    expect(cells.get('repositories')).toBe(await countFiles('apps/api/src', '*/infra/*Repository.ts'));
  });

  /*
   * Counted from the migrations rather than from a live database, so the case says nothing about
   * whichever schema happens to be up. `CREATE TABLE` inside a comment is why the line has to start
   * with the statement.
   */
  test('tables', async () => {
    const cells = await panel();

    expect(cells.get('tables')).toBe(await countIn('migrations/*.sql', /^\s*CREATE TABLE /));
  });

  test('migrations', async () => {
    const cells = await panel();

    expect(cells.get('migrations')).toBe(await countFiles('migrations', '*.sql'));
  });

  test('test files, both sides', async () => {
    const cells = await panel();
    const api = await countFiles('apps/api/tests', '**/*.test.ts');
    const front = await countFiles('apps/web/tests', '**/*.test.{ts,tsx}');
    const repository = await countFiles('tests', '**/*.test.ts');

    expect(cells.get('test files, both sides')).toBe(api + front + repository);
  });

  test('browser journeys', async () => {
    const cells = await panel();

    expect(cells.get('browser journeys')).toBe(await countFiles('e2e', '*.spec.ts'));
  });
});

/* ------------------------------------------------------------------------- */

/*
 * The other half of the same rot, and the cheaper one to check. A diagram that names a file is making
 * a claim about the repository, and `src/web/templates/` was such a claim for two generations after
 * the folder existed. Any path with a slash that looks like a repository path has to resolve.
 */
describe('the newest diagrams name no path that has stopped existing', () => {
  const CANDIDATE = /\b(?:apps\/(?:api|web)\/[\w./-]+|scripts\/[\w.-]+\.(?:ts|sh)|migrations\/[\w.-]+)/g;

  /*
   * `apps/web/dist` is a build output: present after `build:web` and absent in a fresh clone, so
   * asserting it would make the suite depend on whether somebody has built the front.
   */
  const IGNORED = ['apps/web/dist'];

  const pathsNamedIn = async (file: string): Promise<string[]> => {
    const content = await Bun.file(file).text();
    const found = new Set<string>();
    for (const match of content.matchAll(CANDIDATE)) {
      const candidate = match[0].replace(/[.,;:]+$/, '');
      if (!IGNORED.some((prefix) => candidate.startsWith(prefix))) found.add(candidate);
    }
    return [...found];
  };

  const svgsOfTheNewestGeneration = (): string[] => {
    const generation = join(DIAGRAMS, newestGeneration());
    return readdirSync(generation, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((type) =>
        readdirSync(join(generation, type.name))
          .filter((name) => name.endsWith('.svg'))
          .map((name) => join(generation, type.name, name)),
      );
  };

  test('the sweep really did read the diagrams, and not an empty folder', () => {
    expect(svgsOfTheNewestGeneration().length).toBeGreaterThan(0);
  });

  test('every path a diagram names is a path that is there', async () => {
    const missing: string[] = [];

    for (const svg of svgsOfTheNewestGeneration()) {
      for (const named of await pathsNamedIn(svg)) {
        /* A trailing slash means a folder, and a folder is a path the same way a file is. */
        const target = join(ROOT, named);
        if (!existsSync(target)) missing.push(`${svg.slice(ROOT.length + 1)} → ${named}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
