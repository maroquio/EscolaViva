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
    const rate = readRate(0, 0);

    expect(rate).toBe(0);
    expect(Number.isNaN(rate)).toBe(false);
  });

  test('devolve a fração de destinatários que leram', () => {
    const rate = readRate(10, 3);

    expect(rate).toBe(0.3);
  });

  test('devolve 0 quando o comunicado foi entregue e ninguém abriu', () => {
    const rate = readRate(120, 0);

    expect(rate).toBe(0);
  });

  test('devolve 1 quando todo destinatário leu', () => {
    const rate = readRate(7, 7);

    expect(rate).toBe(1);
  });

  test('nunca passa de 1, mesmo com contagem inconsistente', () => {
    const rate = readRate(4, 9);

    expect(rate).toBe(1);
  });

  test('nunca fica negativa, mesmo com contagem inconsistente', () => {
    const rate = readRate(4, -2);

    expect(rate).toBe(0);
  });
});

describe('isValidTitle', () => {
  test('aceita um título comum', () => {
    const valid = isValidTitle('Reunião de pais na quinta-feira');

    expect(valid).toBe(true);
  });

  test('recusa título vazio ou só de espaços', () => {
    const rejected = ['', '   ', '\n\t'].map(isValidTitle);

    expect(rejected).toEqual([false, false, false]);
  });

  test('aceita o título no tamanho máximo e recusa um caractere além', () => {
    const atTheLimit = isValidTitle('t'.repeat(MAX_TITLE_LENGTH));
    const above = isValidTitle('t'.repeat(MAX_TITLE_LENGTH + 1));

    expect(atTheLimit).toBe(true);
    expect(above).toBe(false);
  });

  test('mede o título já sem os espaços das pontas', () => {
    const valid = isValidTitle(`  ${'t'.repeat(MAX_TITLE_LENGTH)}  `);

    expect(valid).toBe(true);
  });
});

describe('isValidBody', () => {
  test('aceita um corpo comum', () => {
    const valid = isValidBody('A reunião começa às 19h no auditório.');

    expect(valid).toBe(true);
  });

  test('recusa corpo vazio ou só de espaços', () => {
    const rejected = ['', '    '].map(isValidBody);

    expect(rejected).toEqual([false, false]);
  });

  test('aceita o corpo no tamanho máximo e recusa um caractere além', () => {
    const atTheLimit = isValidBody('c'.repeat(MAX_BODY_LENGTH));
    const above = isValidBody('c'.repeat(MAX_BODY_LENGTH + 1));

    expect(atTheLimit).toBe(true);
    expect(above).toBe(false);
  });
});

describe('isPublished', () => {
  test('o comunicado sem data de publicação não está publicado', () => {
    const published = isPublished({ publishedAt: null });

    expect(published).toBe(false);
  });

  test('o comunicado com data de publicação está publicado', () => {
    const published = isPublished({ publishedAt: '2026-05-10T12:00:00.000Z' });

    expect(published).toBe(true);
  });
});

describe('withAuthor', () => {
  test('troca o id do autor pelo nome sem deixar o id vazar para fora do módulo', () => {
    const stored = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorUserId: 'usuario-1',
      publishedAt: '2026-05-10T12:00:00.000Z',
    };

    const announcement = withAuthor(stored, 'Ana Prado');

    expect(announcement).toEqual({
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorName: 'Ana Prado',
      publishedAt: '2026-05-10T12:00:00.000Z',
    });
    expect(Object.keys(announcement)).not.toContain('authorUserId');
  });

  test('não altera o comunicado armazenado que recebeu', () => {
    const stored = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: 'usuario-1',
      publishedAt: null,
    };

    withAuthor(stored, 'Ana Prado');

    expect(stored.authorUserId).toBe('usuario-1');
    expect(Object.keys(stored)).not.toContain('authorName');
  });
});
