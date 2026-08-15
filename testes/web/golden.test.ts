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
 * e o diff do `git` passa a ser a revisão do refactor: cada linha alterada em `testes/web/golden/`
 * é uma mudança de comportamento que alguém precisa olhar e aceitar. Regravar sem ler o diff é o
 * único jeito de tornar este arquivo inútil.
 *
 * O cenário sobe UMA vez, em `beforeAll`, e nenhuma tela escreve — então nenhum caso precisa
 * isolar-se do vizinho, e a suíte não paga a rede inteira setenta vezes.
 */

import { mkdir } from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'bun:test';
import { limparBanco } from '../apoio/banco';
import {
  PASTA_GOLDEN,
  caminhoDoGolden,
  capturar,
  montarCenarioGolden,
  telasDoSistema,
  type CenarioGolden,
  type Tela,
} from './golden';

/** Ligada por `scripts/golden.ts --regravar`: em vez de comparar, cada arquivo é reescrito. */
const REGRAVANDO = Bun.env['GOLDEN_REGRAVAR'] === '1';

const SEM_ARQUIVO =
  '(nenhum arquivo golden gravado — rode `bun run golden --regravar` para criar a linha de base)';

/** Quantas divergências são impressas por inteiro antes de a mensagem virar uma lista de nomes. */
const DETALHES_NO_RELATORIO = 3;

let cenario: CenarioGolden;
let telas: readonly Tela[];

beforeAll(async () => {
  await limparBanco();
  cenario = await montarCenarioGolden();
  telas = telasDoSistema(cenario.ids);
  await mkdir(PASTA_GOLDEN, { recursive: true });
});

const telaChamada = (nome: string): Tela => {
  const encontrada = telas.find((candidata) => candidata.nome === nome);
  if (encontrada === undefined) throw new Error(`tela "${nome}" não está na lista`);
  return encontrada;
};

/* ------------------------------------------------------------------------- */

test('nenhuma tela do sistema mudou de HTML', async () => {
  const divergentes: { tela: Tela; esperado: string; atual: string }[] = [];
  let regravadas = 0;

  for (const tela of telas) {
    const atual = await capturar(tela, cenario);
    const arquivo = Bun.file(caminhoDoGolden(tela.nome));

    if (REGRAVANDO) {
      await Bun.write(arquivo, atual);
      regravadas += 1;
      continue;
    }

    const esperado = (await arquivo.exists()) ? await arquivo.text() : SEM_ARQUIVO;
    if (esperado !== atual) divergentes.push({ tela, esperado, atual });
  }

  if (REGRAVANDO) {
    console.log(`golden: ${regravadas} telas gravadas em ${PASTA_GOLDEN}`);
    expect(regravadas).toBe(telas.length);
    return;
  }

  if (divergentes.length > 0) throw new Error(relatorio(divergentes, telas.length));
  expect(divergentes.length).toBe(0);
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
  const instaveis: string[] = [];

  for (const tela of telas) {
    const primeira = await capturar(tela, cenario);
    const segunda = await capturar(tela, cenario);
    if (primeira !== segunda) instaveis.push(tela.nome);
  }

  expect(instaveis).toEqual([]);
});

/* ------------------------------------------------------------------------- */

/**
 * A normalização precisa ser cega para o que varia e enxergar tudo o que não varia. Estes casos
 * cobram o segundo lado — sem eles, uma normalização que apagasse o documento inteiro passaria em
 * todos os outros casos deste arquivo.
 */
describe('a normalização não apaga o que o golden existe para detectar', () => {
  test('um href trocado por outro caminho muda o texto normalizado', async () => {
    const original = await capturar(telaChamada('secretaria-alunos-busca'), cenario);

    expect(original).toContain('href="/secretaria/alunos/{{aluno01}}"');
    expect(original.replaceAll('/secretaria/alunos/', '/secretaria/turmas/')).not.toBe(original);
  });

  test('um rótulo perdido muda o texto normalizado', async () => {
    const original = await capturar(telaChamada('admin-rede-painel'), cenario);

    expect(original).toContain('Painel da rede');
    expect(original.replaceAll('Painel da rede', '')).not.toBe(original);
  });

  test('o identificador de um aluno não vira o de outro', async () => {
    const texto = await capturar(telaChamada('secretaria-alunos-busca'), cenario);

    // Cada registro do cenário tem marcador próprio: trocar dois `href` de lugar muda o arquivo.
    expect(texto).toContain('{{aluno01}}');
    expect(texto).toContain('{{aluno02}}');
  });

  test('o destino de um redirecionamento entra no arquivo congelado', async () => {
    const texto = await capturar(telaChamada('professor-painel-redirecionado'), cenario);

    expect(texto).toContain('status: 303');
    expect(texto).toContain('Location: /professor');
  });
});

/* ------------------------------------------------------------------------- */

type Divergencia = { tela: Tela; esperado: string; atual: string };

/** As primeiras linhas que deixaram de bater, com o número da linha e os dois lados. */
function diferenca(esperado: string, atual: string): string {
  const antes = esperado.split('\n');
  const depois = atual.split('\n');
  const total = Math.max(antes.length, depois.length);
  const LIMITE_DE_LINHAS = 10;
  const saida: string[] = [];

  for (let indice = 0; indice < total; indice += 1) {
    if (antes[indice] === depois[indice]) continue;
    if (saida.length >= LIMITE_DE_LINHAS * 3) {
      saida.push('  … (restante omitido)');
      break;
    }
    saida.push(`  linha ${indice + 1}`);
    saida.push(`  - ${antes[indice] ?? '(ausente)'}`);
    saida.push(`  + ${depois[indice] ?? '(ausente)'}`);
  }

  return saida.join('\n');
}

function relatorio(divergentes: readonly Divergencia[], total: number): string {
  const cabecalho =
    `${divergentes.length} de ${total} tela(s) divergem do golden.\n` +
    'Se a mudança for intencional: bun run golden --regravar (e leia o diff antes de commitar).\n';

  const nomes = divergentes.map(({ tela }) => `  · ${tela.nome} (${tela.caminho})`).join('\n');

  const detalhes = divergentes
    .slice(0, DETALHES_NO_RELATORIO)
    .map(
      ({ tela, esperado, atual }) =>
        `\n--- ${tela.nome} · ${caminhoDoGolden(tela.nome)}\n${diferenca(esperado, atual)}`,
    )
    .join('\n');

  return `${cabecalho}\n${nomes}\n${detalhes}`;
}
