import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { firstExistingPath } from '../apoio/paths';

const CAMINHO_DA_FOLHA = join(
  import.meta.dir,
  '..',
  '..',
  await firstExistingPath('src/web/public/app.css', 'src/web/public/app.css'),
);

const REGRA = /([^{}]+)\{([^{}]*)\}/g;

type Regra = { readonly seletores: readonly string[]; readonly declaracoes: string };

let folha = '';
let regras: readonly Regra[] = [];

const regrasDe = (css: string): Regra[] =>
  [...css.matchAll(REGRA)].map((achado) => ({
    seletores: (achado[1] ?? '').split(',').map((seletor) => seletor.trim()),
    declaracoes: achado[2] ?? '',
  }));

const declaracoesDe = (seletor: string): string =>
  regras
    .filter((regra) => regra.seletores.includes(seletor))
    .map((regra) => regra.declaracoes)
    .join(';');

function valorDe(seletor: string, propriedade: string): string | undefined {
  const busca = new RegExp(`(?:^|;|\\})\\s*${propriedade}\\s*:\\s*([^;]+)`, 'g');
  const encontrados = [...declaracoesDe(seletor).matchAll(busca)];
  return encontrados.at(-1)?.[1]?.trim();
}

describe('folha de estilo', () => {
  beforeAll(async () => {
    folha = await Bun.file(CAMINHO_DA_FOLHA).text();
    regras = regrasDe(folha);
  });

  test('o seletor de uma regra conhecida é lido como o arquivo o escreve', () => {
    const daFolha = regras.filter((regra) => regra.seletores.includes('.botao'));

    expect(daFolha).toHaveLength(1);
    expect(valorDe('.botao', 'cursor')).toBe('pointer');
  });

  test('campo e botão dividem a mesma altura de controle', () => {
    const alturaDoCampo = valorDe('input', 'min-block-size');

    const alturaDoBotao = valorDe('.botao', 'min-block-size');

    expect(alturaDoCampo).toBe('var(--controle-altura)');
    expect(alturaDoBotao).toBe('var(--controle-altura)');
  });

  test('a caixa de marcar não herda a altura de controle dos demais campos', () => {
    const altura = valorDe("input[type='checkbox']", 'min-block-size');

    expect(altura).toBe('0');
  });

  test('nenhum controle usa o atalho background, que apagaria a seta do select', () => {
    const doControle = /(?:^|[\s,>+~])(?:input|select|textarea)(?:[[:.\s]|$)/;

    const comAtalho = regras
      .filter((regra) => regra.seletores.some((seletor) => doControle.test(seletor)))
      .filter((regra) => /(?:^|;)\s*background\s*:/.test(regra.declaracoes))
      .map((regra) => regra.seletores.join(', '));

    expect(comAtalho).toEqual([]);
    expect(valorDe('select', 'background-image')).toContain('data:image/svg+xml');
  });

  test('o foco visível nunca é removido', () => {
    const contorno = valorDe(':focus-visible', 'outline');

    expect(contorno).toContain('var(--marca)');
    expect(folha).not.toMatch(/outline\s*:\s*(?:none|0)\s*[;}]/);
  });

  test('a rolagem lateral da tabela declara os dois eixos', () => {
    const horizontal = valorDe('.tabela-rolagem', 'overflow-x');

    const vertical = valorDe('.tabela-rolagem', 'overflow-y');

    expect(horizontal).toBe('auto');
    expect(vertical).toBe('hidden');
  });

  test('a coluna-âncora grudada tem fundo próprio em toda linha que a contém', () => {
    const ancora = valorDe(".tabela th[scope='row']", 'position');

    expect(ancora).toBe('sticky');
    expect(valorDe(".tabela th[scope='row']", 'background')).toBe('inherit');
    expect(valorDe('.tabela tbody tr', 'background')).toBeDefined();
    expect(valorDe('.tabela tfoot tr', 'background')).toBeDefined();
  });

  test('o ícone do botão respira por margem, e não por gap', () => {
    const respiro = valorDe('.botao > svg', 'margin-inline-end');

    expect(respiro).toBe('var(--e2)');
    expect(valorDe('.botao', 'gap')).toBeUndefined();
  });

  test('a página não rola de lado: o eixo horizontal pertence ao contêiner da tabela', () => {
    const doCorpo = valorDe('body', 'overflow-x');

    expect(doCorpo).toBe('clip');
  });
});
