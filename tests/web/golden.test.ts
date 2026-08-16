/*
 * O golden: toda tela do sistema comparada com o HTML que ela produzia antes do refactor.
 *
 * Este arquivo não afirma nada sobre o produto. Ele afirma uma coisa só, e é exatamente a coisa que
 * um refactor puro promete: **o que sai pela porta HTTP hoje é byte a byte o que saía ontem**. Por
 * isso não há `expect(html).toContain('Alunos')` em lugar nenhum — uma asserção assim aprova uma
 * tela que perdeu metade dos links e manteve o título. O que se compara é o documento inteiro.
 *
 * Quando a mudança é intencional, os arquivos são regravados de propósito:
 *
 *     bun run golden --regravar
 *
 * e o diff do `git` passa a ser a revisão do refactor: cada linha alterada em `tests/web/golden/`
 * é uma mudança de comportamento que alguém precisa olhar e aceitar. Regravar sem ler o diff é o
 * único jeito de tornar este arquivo inútil.
 *
 * O cenário sobe UMA vez, em `beforeAll`, e nenhuma tela escreve — então nenhum caso precisa
 * isolar-se do vizinho, e a suíte não paga a rede inteira setenta vezes.
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

/** Ligada por `scripts/golden.ts --regravar`: em vez de comparar, cada arquivo é reescrito. */
const REWRITING = Bun.env['GOLDEN_REGRAVAR'] === '1';

const NO_FILE =
  '(nenhum arquivo golden gravado — rode `bun run golden --regravar` para criar a linha de base)';

/** Quantas divergências são impressas por inteiro antes de a mensagem virar uma lista de nomes. */
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

test('nenhuma tela do sistema mudou de HTML', async () => {
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
 * Duas capturas seguidas da mesma tela precisam dar o mesmo texto. É o caso que sustenta todos os
 * outros: um golden que oscila vira ruído, e ruído acaba desligado.
 *
 * A chave de idempotência muda a cada render por decisão de projeto (I4) e o identificador de todo
 * registro é UUID — então este caso é também a prova de que a normalização alcança os dois.
 */
test('a captura é determinística: a mesma tela, duas vezes, dá o mesmo texto', async () => {
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
 * A normalização precisa ser cega para o que varia e enxergar tudo o que não varia. Estes casos
 * cobram o segundo lado — sem eles, uma normalização que apagasse o documento inteiro passaria em
 * todos os outros casos deste arquivo.
 */
describe('a normalização não apaga o que o golden existe para detectar', () => {
  test('um href trocado por outro caminho muda o texto normalizado', async () => {
    const original = await capture(screenNamed('secretaria-alunos-busca'), scenario);

    expect(original).toContain('href="/secretaria/alunos/{{aluno01}}"');
    expect(original.replaceAll('/secretaria/alunos/', '/secretaria/turmas/')).not.toBe(original);
  });

  test('um rótulo perdido muda o texto normalizado', async () => {
    const original = await capture(screenNamed('admin-rede-painel'), scenario);

    expect(original).toContain('Painel da rede');
    expect(original.replaceAll('Painel da rede', '')).not.toBe(original);
  });

  test('o identificador de um aluno não vira o de outro', async () => {
    const text = await capture(screenNamed('secretaria-alunos-busca'), scenario);

    // Cada registro do cenário tem marcador próprio: trocar dois `href` de lugar muda o arquivo.
    expect(text).toContain('{{aluno01}}');
    expect(text).toContain('{{aluno02}}');
  });

  test('o destino de um redirecionamento entra no arquivo congelado', async () => {
    const text = await capture(screenNamed('professor-painel-redirecionado'), scenario);

    expect(text).toContain('status: 303');
    expect(text).toContain('Location: /professor');
  });
});

/* ------------------------------------------------------------------------- */

type Divergence = { screen: GoldenScreen; expected: string; actual: string };

/** As primeiras linhas que deixaram de bater, com o número da linha e os dois lados. */
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
