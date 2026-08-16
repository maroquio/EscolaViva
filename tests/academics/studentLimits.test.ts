import { beforeEach, describe, expect, test } from 'bun:test';
import { ACADEMIC_LIMITS, academics } from '../../src/academics';
import type { Result } from '../../src/shared/result';
import { clearDatabase } from '../support/database';
import { createStudent, createNetwork } from '../support/factories';

beforeEach(clearDatabase);

const SEARCH_ROWS = ACADEMIC_LIMITS.student.searchRows;
const NAME_CHARACTERS = ACADEMIC_LIMITS.student.name;

const numberedName = (position: number): string => `Pessoa ${String(position).padStart(3, '0')}`;

const fieldsWithError = <T>(result: Result<T>): string[] =>
  result.ok ? [] : result.erros.map((error) => error.campo ?? '');

describe('LIMITS.student.searchRows conta LINHAS devolvidas', () => {
  test('a busca sem faixa devolve no máximo esse tanto de linhas', async () => {
    const network = await createNetwork();
    for (let position = 1; position <= SEARCH_ROWS + 1; position += 1) {
      await createStudent({ networkId: network.id, name: numberedName(position) });
    }

    const found = await academics.searchStudents(network.id, 'Pessoa');

    expect(found).toHaveLength(SEARCH_ROWS);
    expect(found.map((student) => student.name)).toEqual(
      Array.from({ length: SEARCH_ROWS }, (_, index) => numberedName(index + 1)),
    );
  });

  test('o nome longo não estreita nem alarga o corte da busca', async () => {
    const network = await createNetwork();
    for (let position = 1; position <= SEARCH_ROWS + 1; position += 1) {
      await createStudent({ networkId: network.id, name: `${numberedName(position)} ${'x'.repeat(80)}` });
    }

    const found = await academics.searchStudents(network.id, 'Pessoa');

    expect(found).toHaveLength(SEARCH_ROWS);
  });
});

describe('LIMITS.student.name conta CARACTERES do nome', () => {
  test('aceita o nome com exatamente esse tanto de caracteres', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id,
      name: 'A'.repeat(NAME_CHARACTERS),
      birthDate: '2014-05-10',
    });

    expect(fieldsWithError(result)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('recusa o nome com um caractere a mais', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id,
      name: 'A'.repeat(NAME_CHARACTERS + 1),
      birthDate: '2014-05-10',
    });

    expect(fieldsWithError(result)).toEqual(['name']);
  });
});
