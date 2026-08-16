import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { existingPath } from '../support/paths';

const STYLESHEET_PATH = join(
  import.meta.dir,
  '..',
  '..',
  await existingPath('src/web/public/app.css'),
);

const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;

type Rule = { readonly selectors: readonly string[]; readonly declarations: string };

let stylesheet = '';
let rules: readonly Rule[] = [];

const rulesOf = (css: string): Rule[] =>
  [...css.matchAll(CSS_RULE)].map((finding) => ({
    selectors: (finding[1] ?? '').split(',').map((selector) => selector.trim()),
    declarations: finding[2] ?? '',
  }));

const declarationsOf = (selector: string): string =>
  rules
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.declarations)
    .join(';');

function propertyValue(selector: string, property: string): string | undefined {
  const search = new RegExp(`(?:^|;|\\})\\s*${property}\\s*:\\s*([^;]+)`, 'g');
  const found = [...declarationsOf(selector).matchAll(search)];
  return found.at(-1)?.[1]?.trim();
}

describe('the stylesheet', () => {
  beforeAll(async () => {
    stylesheet = await Bun.file(STYLESHEET_PATH).text();
    rules = rulesOf(stylesheet);
  });

  test('the selector of a known rule is read exactly as the file writes it', () => {
    const ofTheStylesheet = rules.filter((rule) => rule.selectors.includes('.button'));

    expect(ofTheStylesheet).toHaveLength(1);
    expect(propertyValue('.button', 'cursor')).toBe('pointer');
  });

  test('field and button share the same control height', () => {
    const fieldHeight = propertyValue('input', 'min-block-size');

    const buttonHeight = propertyValue('.button', 'min-block-size');

    expect(fieldHeight).toBe('var(--control-height)');
    expect(buttonHeight).toBe('var(--control-height)');
  });

  test('the checkbox does not inherit the control height of the other fields', () => {
    const height = propertyValue("input[type='checkbox']", 'min-block-size');

    expect(height).toBe('0');
  });

  test('no control uses the background shorthand, which would wipe out the select arrow', () => {
    const ofTheControl = /(?:^|[\s,>+~])(?:input|select|textarea)(?:[[:.\s]|$)/;

    const withShortcut = rules
      .filter((rule) => rule.selectors.some((selector) => ofTheControl.test(selector)))
      .filter((rule) => /(?:^|;)\s*background\s*:/.test(rule.declarations))
      .map((rule) => rule.selectors.join(', '));

    expect(withShortcut).toEqual([]);
    expect(propertyValue('select', 'background-image')).toContain('data:image/svg+xml');
  });

  test('the visible focus ring is never removed', () => {
    const outline = propertyValue(':focus-visible', 'outline');

    expect(outline).toContain('var(--brand)');
    expect(stylesheet).not.toMatch(/outline\s*:\s*(?:none|0)\s*[;}]/);
  });

  test('the table\'s sideways scrolling declares both axes', () => {
    const horizontal = propertyValue('.table-scroll', 'overflow-x');

    const vertical = propertyValue('.table-scroll', 'overflow-y');

    expect(horizontal).toBe('auto');
    expect(vertical).toBe('hidden');
  });

  test('the sticky anchor column has a background of its own on every row that holds it', () => {
    const anchor = propertyValue(".table th[scope='row']", 'position');

    expect(anchor).toBe('sticky');
    expect(propertyValue(".table th[scope='row']", 'background')).toBe('inherit');
    expect(propertyValue('.table tbody tr', 'background')).toBeDefined();
    expect(propertyValue('.table tfoot tr', 'background')).toBeDefined();
  });

  test('the button icon breathes through a margin, not through a gap', () => {
    const breathingRoom = propertyValue('.button > svg', 'margin-inline-end');

    expect(breathingRoom).toBe('var(--s2)');
    expect(propertyValue('.button', 'gap')).toBeUndefined();
  });

  test('the page does not scroll sideways: the horizontal axis belongs to the table container', () => {
    const ofTheBody = propertyValue('body', 'overflow-x');

    expect(ofTheBody).toBe('clip');
  });
});
