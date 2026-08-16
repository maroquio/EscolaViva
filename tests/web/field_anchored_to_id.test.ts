/*
 * A control's `id` is the field name — and a field name has an owner.
 *
 * In a form the field name shows up four times on the same line of code: in `name`, which is what
 * the browser sends back; in `id`, which is the control's anchor; in the label's `for`, which has
 * to match that `id`; and inside the derived ids (`name-help`, `name-error`) that
 * `aria-describedby` cites. Three of those four already came from the constant —
 * `name="<%= fields.name %>"`, `it.helpId(fields.name)`, `describedBy(fields.name, true)`. The
 * fourth, the base `id`, was rewritten by hand.
 *
 * This is not cosmetics: the `id`, the `for` and the `name` of the same control have to be the SAME
 * word, or the label stops clicking through to the field and the screen reader stops announcing it.
 * As long as one of the four is a copy, renaming the field in the constant breaks the screen in
 * silence — the `name` follows along, the `id` stays behind, and no route test notices, because the
 * form keeps on saving.
 *
 * The magic-values checker reaches neither `id` nor `for`: it sweeps `name`, `value`, `href`,
 * `action`, `maxlength` and the text attributes, and not these. This file is what holds the rule
 * here, and that is why it comes in three parts: the rule, the probe proving the rule has teeth,
 * and the frozen screen, where the anchor that now comes from the constant still comes out bearing
 * the field name.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { FIELDS } from '../../src/web/constants';
import { existingPath } from '../support/paths';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');

const TEMPLATE = () => existingPath('src/web/templates/registrar/student_new.eta');

const FROZEN_SCREEN = join(import.meta.dir, 'golden', 'secretaria-aluno-novo.txt');

const FIELD_NAMES = Object.values(FIELDS.student);

/** The constant's key is what the template writes; the value is what comes out in the HTML. */
const FIELD_NAME: Record<string, string> = FIELDS.student;
const FIELD_KEYS = Object.keys(FIELD_NAME);

const ANCHOR = /\b(id|for)\s*=\s*"([^"]*)"/g;

const ETA_BLOCK = /<%[\s\S]*?%>/g;

const templateSource = async (): Promise<string> =>
  Bun.file(join(PROJECT_ROOT, await TEMPLATE())).text();

type Anchor = { readonly attribute: string; readonly value: string };

const anchorsOf = (source: string): Anchor[] =>
  [...source.matchAll(ANCHOR)].map((finding) => ({
    attribute: finding[1] ?? '',
    value: finding[2] ?? '',
  }));

/** What is left of the anchor once the interpolated part is taken out: the piece written by hand. */
const writtenByHand = (value: string): string => value.replaceAll(ETA_BLOCK, '');

const anchorsThatRewriteTheField = (source: string): string[] =>
  anchorsOf(source)
    .filter(({ value }) => FIELD_NAMES.some((field) => writtenByHand(value).includes(field)))
    .map(({ attribute, value }) => `${attribute}="${value}"`);

const INTERPOLATING_ANCHOR = new RegExp(
  `\\b(id|for)="<%=\\s*fields\\.(${FIELD_KEYS.join('|')})\\s*%>"`,
  'g',
);

/** Undoes the fix: puts the `id`/`for` back to a hand-written name, the way it used to be. */
const withTheFieldRewrittenByHand = (source: string): string =>
  source.replaceAll(
    INTERPOLATING_ANCHOR,
    (_inteiro, attribute: string, key: string) => `${attribute}="${FIELD_NAME[key] ?? key}"`,
  );

const LIVE_PROBE = 'a sonda devolveu ao menos uma âncora ao nome escrito à mão';

const DEAD_PROBE =
  'a sonda não conseguiu reescrever âncora nenhuma — ela deixou de provar qualquer coisa sobre a ' +
  'regra acima; conserte a sonda antes de confiar no resultado dela.';

const probeVerdict = (source: string, regression: string): string =>
  regression === source ? DEAD_PROBE : LIVE_PROBE;

describe('the student field name comes from the constant in every anchor', () => {
  test('no `id` or `for` in the form rewrites the field name by hand', async () => {
    const source = await templateSource();

    expect(anchorsOf(source).length).toBeGreaterThan(0);
    expect(anchorsThatRewriteTheField(source)).toEqual([]);
  });

  test('the probe: putting the anchor back to a hand-written name is reported again', async () => {
    const source = await templateSource();
    const regression = withTheFieldRewrittenByHand(source);

    expect(probeVerdict(source, regression)).toBe(LIVE_PROBE);
    expect(anchorsThatRewriteTheField(regression).length).toBeGreaterThan(0);
  });

  test('the frozen screen still matches every `for` to the `id` of the same name', async () => {
    const html = await Bun.file(FROZEN_SCREEN).text();
    const anchors = anchorsOf(html);

    const labels = anchors.filter(({ attribute }) => attribute === 'for').map(({ value }) => value);
    const controls = new Set(
      anchors.filter(({ attribute }) => attribute === 'id').map(({ value }) => value),
    );

    expect(labels).toEqual([...FIELD_NAMES]);
    expect(labels.filter((label) => !controls.has(label))).toEqual([]);
  });
});
