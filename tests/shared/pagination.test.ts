/*
 * A régua do recorte, sem banco no meio.
 *
 * Duas coisas se provam aqui. A primeira é que número de página que vem de fora nunca produz uma
 * consulta estranha: texto, zero, negativo e fração viram a primeira página, e não um OFFSET
 * negativo. A segunda é a ordem das consultas — contagem e recorte partem juntos, e a segunda
 * busca só acontece quando a página pedida passou do fim.
 */

import { describe, expect, test } from 'bun:test';
import {
  emptyPage,
  pageCount,
  queryPage,
  rangeFor,
  rangeParams,
  requestedPage,
  sliceItems,
  type Range,
} from '../../src/shared/pagination';

describe('requestedPage', () => {
  test('ausência vira a primeira página', () => {
    expect(requestedPage(undefined)).toBe(1);
    expect(requestedPage(null)).toBe(1);
  });

  test('texto que não é número vira a primeira página', () => {
    expect(requestedPage('duas')).toBe(1);
    expect(requestedPage('3; DROP TABLE aluno')).toBe(1);
  });

  test('zero e negativo viram a primeira página', () => {
    expect(requestedPage('0')).toBe(1);
    expect(requestedPage('-7')).toBe(1);
  });

  test('fração é truncada', () => {
    expect(requestedPage('2.9')).toBe(2);
  });

  test('número válido passa como está', () => {
    expect(requestedPage('42')).toBe(42);
  });
});

describe('rangeFor', () => {
  test('a primeira página não desloca nada', () => {
    expect(rangeFor(1, 20)).toEqual({ limit: 20, offset: 0 });
  });

  test('o deslocamento é o tamanho vezes as páginas anteriores', () => {
    expect(rangeFor(4, 25)).toEqual({ limit: 25, offset: 75 });
  });

  test('página abaixo de um nunca produz deslocamento negativo', () => {
    expect(rangeFor(-3, 20).offset).toBe(0);
  });
});

describe('rangeParams', () => {
  test('faixa ausente vira NULL nos dois campos — o SQL entende como cláusula ausente', () => {
    expect(rangeParams(undefined)).toEqual({ limit: null, offset: null });
  });

  test('faixa presente passa os números adiante', () => {
    expect(rangeParams({ limit: 20, offset: 40 })).toEqual({ limit: 20, offset: 40 });
  });
});

describe('pageCount', () => {
  test('lista vazia continua tendo uma página', () => {
    expect(pageCount(0, 20)).toBe(1);
  });

  test('a sobra ocupa uma página inteira', () => {
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });
});

describe('emptyPage', () => {
  test('descreve uma lista sem nada, e não uma lista sem forma', () => {
    expect(emptyPage<string>(20)).toEqual({
      items: [], total: 0, page: 1, size: 20, pages: 1,
    });
  });
});

describe('sliceItems', () => {
  const dez = Array.from({ length: 10 }, (_, i) => i + 1);

  test('devolve o pedaço da página pedida', () => {
    expect(sliceItems(dez, 2, 4).items).toEqual([5, 6, 7, 8]);
  });

  test('a última página traz o que sobrou', () => {
    const ultima = sliceItems(dez, 3, 4);
    expect(ultima.items).toEqual([9, 10]);
    expect(ultima.pages).toBe(3);
  });

  test('página além do fim é presa na última, em vez de devolver lista vazia', () => {
    const alem = sliceItems(dez, 99, 4);
    expect(alem.page).toBe(3);
    expect(alem.items).toEqual([9, 10]);
  });

  test('o total é o da lista inteira, não o da página', () => {
    expect(sliceItems(dez, 1, 4).total).toBe(10);
  });
});

describe('queryPage', () => {
  /** Registra as faixas pedidas: é assim que se prova quantas buscas aconteceram, e com quê. */
  const espiao = (itens: readonly number[]) => {
    const pedidas: Range[] = [];
    const buscar = async (faixa: Range): Promise<number[]> => {
      pedidas.push(faixa);
      return itens.slice(faixa.offset, faixa.offset + faixa.limit);
    };
    return { pedidas, buscar };
  };

  const cem = Array.from({ length: 100 }, (_, i) => i + 1);

  test('devolve o recorte com o total da lista inteira', async () => {
    const { buscar } = espiao(cem);

    const pagina = await queryPage(2, 20, async () => 100, buscar);

    expect(pagina.items).toEqual(cem.slice(20, 40));
    expect(pagina).toMatchObject({ total: 100, page: 2, size: 20, pages: 5 });
  });

  test('a página existente é servida com uma busca só', async () => {
    const { pedidas, buscar } = espiao(cem);

    await queryPage(3, 20, async () => 100, buscar);

    expect(pedidas).toEqual([{ limit: 20, offset: 40 }]);
  });

  test('página além do fim serve a última, em vez de uma tela vazia', async () => {
    const { pedidas, buscar } = espiao(cem);

    const pagina = await queryPage(99, 20, async () => 100, buscar);

    expect(pagina.page).toBe(5);
    expect(pagina.items).toEqual(cem.slice(80, 100));
    // A segunda busca é o preço de uma URL digitada à mão, e só acontece nesse caso.
    expect(pedidas).toHaveLength(2);
  });

  test('lista vazia devolve a primeira página, sem itens', async () => {
    const { buscar } = espiao([]);

    const pagina = await queryPage(1, 20, async () => 0, buscar);

    expect(pagina).toEqual({ items: [], total: 0, page: 1, size: 20, pages: 1 });
  });
});
