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
  consultarPagina,
  faixaDe,
  fatiar,
  paginaPedida,
  paginaVazia,
  recorte,
  totalDePaginas,
  type Faixa,
} from '../../src/shared/pagination';

describe('paginaPedida', () => {
  test('ausência vira a primeira página', () => {
    expect(paginaPedida(undefined)).toBe(1);
    expect(paginaPedida(null)).toBe(1);
  });

  test('texto que não é número vira a primeira página', () => {
    expect(paginaPedida('duas')).toBe(1);
    expect(paginaPedida('3; DROP TABLE aluno')).toBe(1);
  });

  test('zero e negativo viram a primeira página', () => {
    expect(paginaPedida('0')).toBe(1);
    expect(paginaPedida('-7')).toBe(1);
  });

  test('fração é truncada', () => {
    expect(paginaPedida('2.9')).toBe(2);
  });

  test('número válido passa como está', () => {
    expect(paginaPedida('42')).toBe(42);
  });
});

describe('faixaDe', () => {
  test('a primeira página não desloca nada', () => {
    expect(faixaDe(1, 20)).toEqual({ limite: 20, deslocamento: 0 });
  });

  test('o deslocamento é o tamanho vezes as páginas anteriores', () => {
    expect(faixaDe(4, 25)).toEqual({ limite: 25, deslocamento: 75 });
  });

  test('página abaixo de um nunca produz deslocamento negativo', () => {
    expect(faixaDe(-3, 20).deslocamento).toBe(0);
  });
});

describe('recorte', () => {
  test('faixa ausente vira NULL nos dois campos — o SQL entende como cláusula ausente', () => {
    expect(recorte(undefined)).toEqual({ limite: null, deslocamento: null });
  });

  test('faixa presente passa os números adiante', () => {
    expect(recorte({ limite: 20, deslocamento: 40 })).toEqual({ limite: 20, deslocamento: 40 });
  });
});

describe('totalDePaginas', () => {
  test('lista vazia continua tendo uma página', () => {
    expect(totalDePaginas(0, 20)).toBe(1);
  });

  test('a sobra ocupa uma página inteira', () => {
    expect(totalDePaginas(21, 20)).toBe(2);
    expect(totalDePaginas(40, 20)).toBe(2);
    expect(totalDePaginas(41, 20)).toBe(3);
  });
});

describe('paginaVazia', () => {
  test('descreve uma lista sem nada, e não uma lista sem forma', () => {
    expect(paginaVazia<string>(20)).toEqual({
      itens: [], total: 0, pagina: 1, tamanho: 20, paginas: 1,
    });
  });
});

describe('fatiar', () => {
  const dez = Array.from({ length: 10 }, (_, i) => i + 1);

  test('devolve o pedaço da página pedida', () => {
    expect(fatiar(dez, 2, 4).itens).toEqual([5, 6, 7, 8]);
  });

  test('a última página traz o que sobrou', () => {
    const ultima = fatiar(dez, 3, 4);
    expect(ultima.itens).toEqual([9, 10]);
    expect(ultima.paginas).toBe(3);
  });

  test('página além do fim é presa na última, em vez de devolver lista vazia', () => {
    const alem = fatiar(dez, 99, 4);
    expect(alem.pagina).toBe(3);
    expect(alem.itens).toEqual([9, 10]);
  });

  test('o total é o da lista inteira, não o da página', () => {
    expect(fatiar(dez, 1, 4).total).toBe(10);
  });
});

describe('consultarPagina', () => {
  /** Registra as faixas pedidas: é assim que se prova quantas buscas aconteceram, e com quê. */
  const espiao = (itens: readonly number[]) => {
    const pedidas: Faixa[] = [];
    const buscar = async (faixa: Faixa): Promise<number[]> => {
      pedidas.push(faixa);
      return itens.slice(faixa.deslocamento, faixa.deslocamento + faixa.limite);
    };
    return { pedidas, buscar };
  };

  const cem = Array.from({ length: 100 }, (_, i) => i + 1);

  test('devolve o recorte com o total da lista inteira', async () => {
    const { buscar } = espiao(cem);

    const pagina = await consultarPagina(2, 20, async () => 100, buscar);

    expect(pagina.itens).toEqual(cem.slice(20, 40));
    expect(pagina).toMatchObject({ total: 100, pagina: 2, tamanho: 20, paginas: 5 });
  });

  test('a página existente é servida com uma busca só', async () => {
    const { pedidas, buscar } = espiao(cem);

    await consultarPagina(3, 20, async () => 100, buscar);

    expect(pedidas).toEqual([{ limite: 20, deslocamento: 40 }]);
  });

  test('página além do fim serve a última, em vez de uma tela vazia', async () => {
    const { pedidas, buscar } = espiao(cem);

    const pagina = await consultarPagina(99, 20, async () => 100, buscar);

    expect(pagina.pagina).toBe(5);
    expect(pagina.itens).toEqual(cem.slice(80, 100));
    // A segunda busca é o preço de uma URL digitada à mão, e só acontece nesse caso.
    expect(pedidas).toHaveLength(2);
  });

  test('lista vazia devolve a primeira página, sem itens', async () => {
    const { buscar } = espiao([]);

    const pagina = await consultarPagina(1, 20, async () => 0, buscar);

    expect(pagina).toEqual({ itens: [], total: 0, pagina: 1, tamanho: 20, paginas: 1 });
  });
});
