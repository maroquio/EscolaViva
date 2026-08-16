import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { firstExistingPath } from '../support/paths';

const STYLESHEET_PATH = join(
  import.meta.dir,
  '..',
  '..',
  await firstExistingPath('src/web/public/app.css', 'src/web/public/app.css'),
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

describe('folha de estilo', () => {
  beforeAll(async () => {
    stylesheet = await Bun.file(STYLESHEET_PATH).text();
    rules = rulesOf(stylesheet);
  });

  test('o seletor de uma regra conhecida é lido como o arquivo o escreve', () => {
    const ofTheStylesheet = rules.filter((rule) => rule.selectors.includes('.botao'));

    expect(ofTheStylesheet).toHaveLength(1);
    expect(propertyValue('.botao', 'cursor')).toBe('pointer');
  });

  test('campo e botão dividem a mesma altura de controle', () => {
    const fieldHeight = propertyValue('input', 'min-block-size');

    const buttonHeight = propertyValue('.botao', 'min-block-size');

    expect(fieldHeight).toBe('var(--controle-altura)');
    expect(buttonHeight).toBe('var(--controle-altura)');
  });

  test('a caixa de marcar não herda a altura de controle dos demais campos', () => {
    const height = propertyValue("input[type='checkbox']", 'min-block-size');

    expect(height).toBe('0');
  });

  test('nenhum controle usa o atalho background, que apagaria a seta do select', () => {
    const ofTheControl = /(?:^|[\s,>+~])(?:input|select|textarea)(?:[[:.\s]|$)/;

    const withShortcut = rules
      .filter((rule) => rule.selectors.some((selector) => ofTheControl.test(selector)))
      .filter((rule) => /(?:^|;)\s*background\s*:/.test(rule.declarations))
      .map((rule) => rule.selectors.join(', '));

    expect(withShortcut).toEqual([]);
    expect(propertyValue('select', 'background-image')).toContain('data:image/svg+xml');
  });

  test('o foco visível nunca é removido', () => {
    const outline = propertyValue(':focus-visible', 'outline');

    expect(outline).toContain('var(--marca)');
    expect(stylesheet).not.toMatch(/outline\s*:\s*(?:none|0)\s*[;}]/);
  });

  test('a rolagem lateral da tabela declara os dois eixos', () => {
    const horizontal = propertyValue('.tabela-rolagem', 'overflow-x');

    const vertical = propertyValue('.tabela-rolagem', 'overflow-y');

    expect(horizontal).toBe('auto');
    expect(vertical).toBe('hidden');
  });

  test('a coluna-âncora grudada tem fundo próprio em toda linha que a contém', () => {
    const anchor = propertyValue(".tabela th[scope='row']", 'position');

    expect(anchor).toBe('sticky');
    expect(propertyValue(".tabela th[scope='row']", 'background')).toBe('inherit');
    expect(propertyValue('.tabela tbody tr', 'background')).toBeDefined();
    expect(propertyValue('.tabela tfoot tr', 'background')).toBeDefined();
  });

  test('o ícone do botão respira por margem, e não por gap', () => {
    const breathingRoom = propertyValue('.botao > svg', 'margin-inline-end');

    expect(breathingRoom).toBe('var(--e2)');
    expect(propertyValue('.botao', 'gap')).toBeUndefined();
  });

  test('a página não rola de lado: o eixo horizontal pertence ao contêiner da tabela', () => {
    const ofTheBody = propertyValue('body', 'overflow-x');

    expect(ofTheBody).toBe('clip');
  });
});
