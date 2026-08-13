/*
 * O domínio de `comunicacao` sem banco: o que vale como título e corpo, o que conta como publicado
 * e a taxa de leitura — a medição que tira "ninguém lê o mural" do campo da opinião e que, por
 * isso, não pode devolver `NaN` para a tela.
 */

import { describe, expect, test } from 'bun:test';
import {
  CORPO_TAMANHO_MAXIMO,
  TITULO_TAMANHO_MAXIMO,
  comAutor,
  corpoValido,
  estaPublicado,
  tituloValido,
} from '../../src/comunicacao/dominio/comunicado';
import { taxaDeLeitura } from '../../src/comunicacao/dominio/destinatario';

describe('taxaDeLeitura', () => {
  test('devolve 0 sem destinatário, em vez de dividir por zero', () => {
    const taxa = taxaDeLeitura(0, 0);

    expect(taxa).toBe(0);
    expect(Number.isNaN(taxa)).toBe(false);
  });

  test('devolve a fração de destinatários que leram', () => {
    const taxa = taxaDeLeitura(10, 3);

    expect(taxa).toBe(0.3);
  });

  test('devolve 0 quando o comunicado foi entregue e ninguém abriu', () => {
    const taxa = taxaDeLeitura(120, 0);

    expect(taxa).toBe(0);
  });

  test('devolve 1 quando todo destinatário leu', () => {
    const taxa = taxaDeLeitura(7, 7);

    expect(taxa).toBe(1);
  });

  test('nunca passa de 1, mesmo com contagem inconsistente', () => {
    const taxa = taxaDeLeitura(4, 9);

    expect(taxa).toBe(1);
  });

  test('nunca fica negativa, mesmo com contagem inconsistente', () => {
    const taxa = taxaDeLeitura(4, -2);

    expect(taxa).toBe(0);
  });
});

describe('tituloValido', () => {
  test('aceita um título comum', () => {
    const valido = tituloValido('Reunião de pais na quinta-feira');

    expect(valido).toBe(true);
  });

  test('recusa título vazio ou só de espaços', () => {
    const recusados = ['', '   ', '\n\t'].map(tituloValido);

    expect(recusados).toEqual([false, false, false]);
  });

  test('aceita o título no tamanho máximo e recusa um caractere além', () => {
    const noLimite = tituloValido('t'.repeat(TITULO_TAMANHO_MAXIMO));
    const acima = tituloValido('t'.repeat(TITULO_TAMANHO_MAXIMO + 1));

    expect(noLimite).toBe(true);
    expect(acima).toBe(false);
  });

  test('mede o título já sem os espaços das pontas', () => {
    const valido = tituloValido(`  ${'t'.repeat(TITULO_TAMANHO_MAXIMO)}  `);

    expect(valido).toBe(true);
  });
});

describe('corpoValido', () => {
  test('aceita um corpo comum', () => {
    const valido = corpoValido('A reunião começa às 19h no auditório.');

    expect(valido).toBe(true);
  });

  test('recusa corpo vazio ou só de espaços', () => {
    const recusados = ['', '    '].map(corpoValido);

    expect(recusados).toEqual([false, false]);
  });

  test('aceita o corpo no tamanho máximo e recusa um caractere além', () => {
    const noLimite = corpoValido('c'.repeat(CORPO_TAMANHO_MAXIMO));
    const acima = corpoValido('c'.repeat(CORPO_TAMANHO_MAXIMO + 1));

    expect(noLimite).toBe(true);
    expect(acima).toBe(false);
  });
});

describe('estaPublicado', () => {
  test('o comunicado sem data de publicação não está publicado', () => {
    const publicado = estaPublicado({ publicadoEm: null });

    expect(publicado).toBe(false);
  });

  test('o comunicado com data de publicação está publicado', () => {
    const publicado = estaPublicado({ publicadoEm: '2026-05-10T12:00:00.000Z' });

    expect(publicado).toBe(true);
  });
});

describe('comAutor', () => {
  test('troca o id do autor pelo nome sem deixar o id vazar para fora do módulo', () => {
    const armazenado = {
      id: 'c1',
      redeId: 'r1',
      unidadeId: 'u1',
      titulo: 'Reunião de pais',
      corpo: 'A reunião começa às 19h.',
      autorUsuarioId: 'usuario-1',
      publicadoEm: '2026-05-10T12:00:00.000Z',
    };

    const comunicado = comAutor(armazenado, 'Ana Prado');

    expect(comunicado).toEqual({
      id: 'c1',
      redeId: 'r1',
      unidadeId: 'u1',
      titulo: 'Reunião de pais',
      corpo: 'A reunião começa às 19h.',
      autorNome: 'Ana Prado',
      publicadoEm: '2026-05-10T12:00:00.000Z',
    });
    expect(Object.keys(comunicado)).not.toContain('autorUsuarioId');
  });

  test('não altera o comunicado armazenado que recebeu', () => {
    const armazenado = {
      id: 'c1',
      redeId: 'r1',
      unidadeId: 'u1',
      titulo: 'Aviso',
      corpo: 'Corpo do aviso.',
      autorUsuarioId: 'usuario-1',
      publicadoEm: null,
    };

    comAutor(armazenado, 'Ana Prado');

    expect(armazenado.autorUsuarioId).toBe('usuario-1');
    expect(Object.keys(armazenado)).not.toContain('autorNome');
  });
});
