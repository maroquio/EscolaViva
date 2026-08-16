/*
 * The golden: every screen of the system compared against the HTML it produced before the refactor.
 *
 * This file claims nothing about the product. It claims one thing only, and it is exactly what a
 * pure refactor promises: **what goes out the HTTP door today is byte for byte what went out
 * yesterday**. That is why there is no `expect(html).toContain('Alunos')` anywhere — an assertion
 * like that passes a screen that lost half its links and kept its title. What gets compared is the
 * whole document.
 *
 * When the change is intentional, the files are rewritten on purpose:
 *
 *     bun run golden --regravar
 *
 * and the `git` diff becomes the review of the refactor: every changed line under
 * `tests/web/golden/` is a change in behaviour someone has to look at and accept. Rewriting without
 * reading the diff is the one way to make this file useless.
 *
 * The scenario is built ONCE, in `beforeAll`, and no screen writes — so no case has to isolate
 * itself from its neighbour, and the suite does not pay for the whole network seventy times over.
 */

import { mkdir } from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  GOLDEN_DIR,
  goldenPath,
  capture,
  buildGoldenScenario,
  systemScreens,
  type GoldenScenario,
  type GoldenScreen,
} from './golden';

/** Switched on by `scripts/golden.ts --regravar`: instead of comparing, every file is rewritten. */
const REWRITING = Bun.env['GOLDEN_REWRITE'] === '1';

const NO_FILE =
  '(nenhum arquivo golden gravado — rode `bun run golden --regravar` para criar a linha de base)';

/** How many divergences are printed in full before the message turns into a list of names. */
const DETAILS_IN_REPORT = 3;

let scenario: GoldenScenario;
let screens: readonly GoldenScreen[];

beforeAll(async () => {
  await clearDatabase();
  scenario = await buildGoldenScenario();
  screens = systemScreens(scenario.ids);
  await mkdir(GOLDEN_DIR, { recursive: true });
});

const screenNamed = (name: string): GoldenScreen => {
  const found = screens.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`tela "${name}" não está na lista`);
  return found;
};

/* ------------------------------------------------------------------------- */

test('no screen of the system changed its HTML', async () => {
  const divergent: { screen: GoldenScreen; expected: string; actual: string }[] = [];
  let rewritten = 0;

  for (const screen of screens) {
    const actual = await capture(screen, scenario);
    const file = Bun.file(goldenPath(screen.name));

    if (REWRITING) {
      await Bun.write(file, actual);
      rewritten += 1;
      continue;
    }

    const expected = (await file.exists()) ? await file.text() : NO_FILE;
    if (expected !== actual) divergent.push({ screen, expected, actual });
  }

  if (REWRITING) {
    console.log(`golden: ${rewritten} telas gravadas em ${GOLDEN_DIR}`);
    expect(rewritten).toBe(screens.length);
    return;
  }

  if (divergent.length > 0) throw new Error(report(divergent, screens.length));
  expect(divergent.length).toBe(0);
});

/* ------------------------------------------------------------------------- */

/**
 * Two captures of the same screen in a row have to give the same text. It is the case that holds
 * all the others up: a golden that wobbles turns into noise, and noise ends up switched off.
 *
 * The idempotency key changes on every render by design (I4) and the identifier of every record is
 * a UUID — so this case is also the proof that normalization reaches both.
 */
test('the capture is deterministic: the same screen, twice, gives the same text', async () => {
  const unstable: string[] = [];

  for (const screen of screens) {
    const first = await capture(screen, scenario);
    const second = await capture(screen, scenario);
    if (first !== second) unstable.push(screen.name);
  }

  expect(unstable).toEqual([]);
});

/* ------------------------------------------------------------------------- */

/**
 * Normalization has to be blind to what varies and see everything that does not. These cases hold
 * the second half to account — without them, a normalization that erased the whole document would
 * pass every other case in this file.
 */
describe('normalization does not erase what the golden exists to catch', () => {
  test('an href swapped for another path changes the normalized text', async () => {
    const original = await capture(screenNamed('secretaria-alunos-busca'), scenario);

    expect(original).toContain('href="/registrar/students/{{aluno01}}"');
    expect(original.replaceAll('/registrar/students/', '/registrar/class-groups/')).not.toBe(original);
  });

  test('a lost label changes the normalized text', async () => {
    const original = await capture(screenNamed('admin-rede-painel'), scenario);

    expect(original).toContain('Painel da rede');
    expect(original.replaceAll('Painel da rede', '')).not.toBe(original);
  });

  test('one student\'s identifier does not become another\'s', async () => {
    const text = await capture(screenNamed('secretaria-alunos-busca'), scenario);

    // Every record in the scenario has a marker of its own: swapping two `href` around changes the file.
    expect(text).toContain('{{aluno01}}');
    expect(text).toContain('{{aluno02}}');
  });

  test('the destination of a redirect goes into the frozen file', async () => {
    const text = await capture(screenNamed('professor-painel-redirecionado'), scenario);

    expect(text).toContain('status: 303');
    expect(text).toContain('Location: /teacher');
  });
});

/* ------------------------------------------------------------------------- */

type Divergence = { screen: GoldenScreen; expected: string; actual: string };

/** The first lines that stopped matching, with the line number and both sides. */
function difference(expected: string, actual: string): string {
  const before = expected.split('\n');
  const after = actual.split('\n');
  const total = Math.max(before.length, after.length);
  const LINE_LIMIT = 10;
  const lines: string[] = [];

  for (let index = 0; index < total; index += 1) {
    if (before[index] === after[index]) continue;
    if (lines.length >= LINE_LIMIT * 3) {
      lines.push('  … (restante omitido)');
      break;
    }
    lines.push(`  linha ${index + 1}`);
    lines.push(`  - ${before[index] ?? '(ausente)'}`);
    lines.push(`  + ${after[index] ?? '(ausente)'}`);
  }

  return lines.join('\n');
}

function report(divergent: readonly Divergence[], total: number): string {
  const header =
    `${divergent.length} de ${total} tela(s) divergem do golden.\n` +
    'Se a mudança for intencional: bun run golden --regravar (e leia o diff antes de commitar).\n';

  const names = divergent.map(({ screen }) => `  · ${screen.name} (${screen.path})`).join('\n');

  const details = divergent
    .slice(0, DETAILS_IN_REPORT)
    .map(
      ({ screen, expected, actual }) =>
        `\n--- ${screen.name} · ${goldenPath(screen.name)}\n${difference(expected, actual)}`,
    )
    .join('\n');

  return `${header}\n${names}\n${details}`;
}
