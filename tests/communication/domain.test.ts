/*
 * O domínio de `communication` sem banco: o que vale como título e corpo, o que conta como
 * publicado e a taxa de leitura — a medição que tira "ninguém lê o mural" do campo da opinião e
 * que, por isso, não pode devolver `NaN` para a tela.
 */

import { describe, expect, test } from 'bun:test';
import {
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  isPublished,
  isValidBody,
  isValidTitle,
  withAuthor,
} from '../../src/communication/domain/announcement';
import { readRate } from '../../src/communication/domain/recipient';

describe('readRate', () => {
  test('devolve 0 sem destinatário, em vez de dividir por zero', () => {
    const taxa = readRate(0, 0);

    expect(taxa).toBe(0);
    expect(Number.isNaN(taxa)).toBe(false);
  });

  test('devolve a fração de destinatários que leram', () => {
    const taxa = readRate(10, 3);

    expect(taxa).toBe(0.3);
  });

  test('devolve 0 quando o comunicado foi entregue e ninguém abriu', () => {
    const taxa = readRate(120, 0);

    expect(taxa).toBe(0);
  });

  test('devolve 1 quando todo destinatário leu', () => {
    const taxa = readRate(7, 7);

    expect(taxa).toBe(1);
  });

  test('nunca passa de 1, mesmo com contagem inconsistente', () => {
    const taxa = readRate(4, 9);

    expect(taxa).toBe(1);
  });

  test('nunca fica negativa, mesmo com contagem inconsistente', () => {
    const taxa = readRate(4, -2);

    expect(taxa).toBe(0);
  });
});

describe('isValidTitle', () => {
  test('aceita um título comum', () => {
    const valido = isValidTitle('Reunião de pais na quinta-feira');

    expect(valido).toBe(true);
  });

  test('recusa título vazio ou só de espaços', () => {
    const recusados = ['', '   ', '\n\t'].map(isValidTitle);

    expect(recusados).toEqual([false, false, false]);
  });

  test('aceita o título no tamanho máximo e recusa um caractere além', () => {
    const noLimite = isValidTitle('t'.repeat(MAX_TITLE_LENGTH));
    const acima = isValidTitle('t'.repeat(MAX_TITLE_LENGTH + 1));

    expect(noLimite).toBe(true);
    expect(acima).toBe(false);
  });

  test('mede o título já sem os espaços das pontas', () => {
    const valido = isValidTitle(`  ${'t'.repeat(MAX_TITLE_LENGTH)}  `);

    expect(valido).toBe(true);
  });
});

describe('isValidBody', () => {
  test('aceita um corpo comum', () => {
    const valido = isValidBody('A reunião começa às 19h no auditório.');

    expect(valido).toBe(true);
  });

  test('recusa corpo vazio ou só de espaços', () => {
    const recusados = ['', '    '].map(isValidBody);

    expect(recusados).toEqual([false, false]);
  });

  test('aceita o corpo no tamanho máximo e recusa um caractere além', () => {
    const noLimite = isValidBody('c'.repeat(MAX_BODY_LENGTH));
    const acima = isValidBody('c'.repeat(MAX_BODY_LENGTH + 1));

    expect(noLimite).toBe(true);
    expect(acima).toBe(false);
  });
});

describe('isPublished', () => {
  test('o comunicado sem data de publicação não está publicado', () => {
    const publicado = isPublished({ publishedAt: null });

    expect(publicado).toBe(false);
  });

  test('o comunicado com data de publicação está publicado', () => {
    const publicado = isPublished({ publishedAt: '2026-05-10T12:00:00.000Z' });

    expect(publicado).toBe(true);
  });
});

describe('withAuthor', () => {
  test('troca o id do autor pelo nome sem deixar o id vazar para fora do módulo', () => {
    const armazenado = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorUserId: 'usuario-1',
      publishedAt: '2026-05-10T12:00:00.000Z',
    };

    const comunicado = withAuthor(armazenado, 'Ana Prado');

    expect(comunicado).toEqual({
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorName: 'Ana Prado',
      publishedAt: '2026-05-10T12:00:00.000Z',
    });
    expect(Object.keys(comunicado)).not.toContain('authorUserId');
  });

  test('não altera o comunicado armazenado que recebeu', () => {
    const armazenado = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: 'usuario-1',
      publishedAt: null,
    };

    withAuthor(armazenado, 'Ana Prado');

    expect(armazenado.authorUserId).toBe('usuario-1');
    expect(Object.keys(armazenado)).not.toContain('authorName');
  });
});
