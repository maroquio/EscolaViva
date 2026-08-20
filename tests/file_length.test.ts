/*
 * How long a source file is allowed to get, and why the number is not 150.
 *
 * Four rounds of decomposition took `apps/web/src/features/network/UserForm.tsx` from 304 lines to
 * 133, and the front's largest file down to 146. Nothing in the repository measured any of it. No
 * linter is configured here at all, `depcruise` checks direction rather than size, and `bun run
 * verify` never asks. The number did exist in writing — `MAX_LINES = 150`, in the throwaway scripts
 * that drove those rounds — which is precisely the wrong place for it: a driver script runs once and
 * is never read again, while the files it shortened go on being edited. That is the state
 * `docs/diagrams` was in before `diagrams.test.ts` existed, and it rotted for the same reason: a
 * fact nobody re-measures stops being a fact and becomes a story about the past.
 *
 * **Why the ceiling is 180 and not 150.** 150 is the number the rounds worked to, and it is a good
 * number to *write* to. It is a bad number to *gate* on, because the largest file in the front is
 * 146: four lines of room, less than one Mantine field. A field on these forms costs about ten
 * lines — a `<Controller>` with its `render`, a line in the Zod schema, a default value — so the
 * first honest field added to `registrar/mutations.ts` would turn this file red, and the cheapest
 * repair available at that moment is to edit the number a few lines below. A gate placed on the
 * target does not get obeyed, it gets edited, and then it is worse than nothing: it still looks
 * like a guarantee.
 *
 * 180 is 34 lines above the front's largest — three more fields on the biggest form — and 124 below
 * the file that started the rounds. Nothing in the front sits closer than those 34 lines, so the
 * gate cannot fire there on an honest edit; and a file that does reach it has not been nibbled at,
 * it has taken on a second job. That is the failure this catches. The habit stays 150; the alarm is
 * at 180.
 *
 * **The narrowest clearance is no longer in the front.** `apps/api/src` joined the sweep, and its
 * two largest files — `shared/constants.ts` and `academics/constants.ts` — sit at 171: nine lines
 * under, not thirty-four. In a constants table a line is one entry, so nine entries is a plausible
 * season of growth rather than a second job, and this is the one place where the gate could fire on
 * work that was not careless. It is still not a reason to move the number, because the repair is
 * already named by the decomposition that left those two at 171: what stayed in
 * `shared/constants.ts` is the vocabulary more than one folder speaks, so an entry only one folder
 * says belongs in that folder's own `constants.ts` — a file `scripts/magic-values.ts` already reads
 * as a source of truth by its name alone. A tenth entry that genuinely belongs to everybody is the
 * case where 180 was reached honestly, and that case deserves a conversation. A red gate is how the
 * conversation gets scheduled.
 *
 * **What is swept.** `apps/web/src`, `packages/contracts/src` and `apps/api/src`. Contracts joined
 * first for the reason the API could not: its largest file is 95 lines, so the rule was already true
 * there and stating it cost nothing. The API was excluded when this file was written — measured on
 * 2026-08-19 it had ten files above this ceiling, the worst being
 * `http/routes/registrar/students.ts` at 397, and folding it in would have made this file red on the
 * day it was written, which is the surest way to get a gate deleted. That exclusion was never left
 * to this paragraph to retire: a case below held it open and failed on the day it stopped being
 * deserved. It failed later the same day, after the decomposition rounds, and the API was swept in
 * and the case removed — kept, it would have been an assertion that can no longer fail, which reads
 * like coverage and buys nothing. `scripts/` stays out on the measurement that once excluded the
 * API and for one more reason: `scripts/magic-values.ts` is 1017 lines of single-entry tool, not a
 * module in a tree.
 *
 * **What is not swept, and why not.** `apps/web/tests` and `apps/api/tests` stay out: a test file's
 * length tracks how many cases its subject has, not how many jobs the file does, and
 * `Teacher.test.tsx` is over 800 lines of cases without being wrong. `dist/` and `node_modules/` need no
 * filter — they are siblings of `src`, not children, so the sweep never reaches them, and a filter
 * for them would be a line no one could make fail. `vite-env.d.ts` is the one file in `src` nobody
 * wrote by hand; at 9 lines, exempting it would be an exception with no consequence, so it is
 * measured like the rest. The one file in `src` that is genuinely skipped is
 * `app/Layout.module.css`: a stylesheet's length tracks the markup it dresses, and `.module.css`
 * binds it to a single component by its own filename, so it cannot take on the second job this rule
 * exists to catch.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const FRONT = 'apps/web/src';
const CONTRACTS = 'packages/contracts/src';
const API = 'apps/api/src';

const SWEPT = [FRONT, CONTRACTS, API] as const;

const MODULE = '**/*.{ts,tsx}';

const CEILING = 180;

const SWEEP_FLOOR = 290;

type Measured = {
  readonly path: string;
  readonly lines: number;
};

/*
 * `wc -l` counts line breaks, so a file whose last line has no break comes out one short of what
 * the editor numbers. The failure below asks its reader to open the file and see the number for
 * themselves, so it has to be the number they will find there.
 */
const lineCount = (content: string): number => {
  const lines = content.split('\n');
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
};

const measure = async (directory: string): Promise<Measured[]> => {
  const measured: Measured[] = [];
  for await (const relative of new Bun.Glob(MODULE).scan({ cwd: join(ROOT, directory) })) {
    const path = `${directory}/${relative.replaceAll('\\', '/')}`;
    measured.push({ path, lines: lineCount(await Bun.file(join(ROOT, path)).text()) });
  }
  return measured;
};

const measureAll = async (directories: readonly string[]): Promise<Measured[]> =>
  (await Promise.all(directories.map(measure))).flat();

/*
 * Longest first, so that when several files cross at once the reader is told which one to open.
 */
const overTheCeiling = (measured: readonly Measured[]): string[] =>
  [...measured]
    .filter(({ lines }) => lines > CEILING)
    .sort((a, b) => b.lines - a.lines)
    .map(({ path, lines }) => `${path} has ${lines} lines, the ceiling is ${CEILING}`);

describe('a source file stays short enough to hold one job', () => {
  /*
   * The guard against the guard. A glob that stops matching would leave every case below comparing
   * an empty list against nothing and reporting success. A folder renamed out from under the sweep
   * already fails loudly, with the path, when `Bun.Glob` cannot open it; what needs saying here is
   * the quieter version, where the pattern still matches something but no longer matches the files
   * that matter.
   *
   * There are 333 today — 149 in the front, 13 in contracts, 171 in the API — and dropping either
   * extension from `MODULE` leaves 250 or 83. Sweeping the API in is what made this number worth
   * recomputing rather than nudging: when the front was swept alone, losing `.tsx` left 79 of 162
   * and the shortfall was obvious. Now the two `.ts` trees carry 250 of the 333, so losing every
   * component in the repository still leaves three quarters of the sweep looking healthy. That 250
   * is the number the floor has to be above. 290 is 40 above it and 43 below today's 333, near the
   * middle of the only interval that works — high enough that no extension can go missing quietly,
   * low enough that deleting a feature folder does not fail a test about globs.
   */
  test('the sweep is still reading whole folders, so an empty answer means something', async () => {
    const counted = await Promise.all(
      SWEPT.map(async (directory) => ({ directory, found: (await measure(directory)).length })),
    );
    const total = counted.reduce((sum, { found }) => sum + found, 0);

    const readingTooLittle =
      total > SWEEP_FLOOR
        ? []
        : [
            `${MODULE} matched ${total} files — ${counted
              .map(({ directory, found }) => `${directory} (${found})`)
              .join(', ')} — and the sweep expects more than ${SWEEP_FLOOR}`,
          ];

    expect(readingTooLittle).toEqual([]);
  });

  test(`no file in ${SWEPT.join(', ')} is longer than ${CEILING} lines`, async () => {
    const tooLong = overTheCeiling(await measureAll(SWEPT));

    expect(tooLong).toEqual([]);
  });
});
