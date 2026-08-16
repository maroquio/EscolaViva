/*
 * O CPF é o identificador de acesso (ADR 0004), e a aritmética dos dígitos verificadores é a
 * única coisa que separa um número digitado de um documento.
 *
 * O gerador é testado junto do validador de propósito: são os dois lados do mesmo algoritmo, e
 * `isValidCpf(generateCpf(n))` sobre uma faixa de sementes derruba a suíte se qualquer um dos dois
 * estiver errado — coisa que um teste de tabela fixa não pegaria.
 */

import { describe, expect, test } from 'bun:test';
import { formatCpf, generateCpf, isValidCpf, normalizeCpf } from '../../src/shared/document';

/** CPF de teste consagrado: os dois verificadores fecham. Não pertence a ninguém. */
const VALIDO = '52998224725';
const SEMENTES = 500;

describe('normalizeCpf', () => {
  test('tira pontuação, traço e espaço', () => {
    expect(normalizeCpf(' 529.982.247-25 ')).toBe(VALIDO);
  });

  test('texto sem dígito nenhum vira string vazia', () => {
    expect(normalizeCpf('sem número')).toBe('');
  });
});

describe('isValidCpf', () => {
  test('aceita CPF com os dois verificadores corretos', () => {
    expect(isValidCpf(VALIDO)).toBe(true);
  });

  test('recusa quando o último dígito está errado', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  test('recusa comprimento diferente de onze', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });

  test('recusa o que não é só dígito — a normalização vem antes', () => {
    expect(isValidCpf('529.982.247-25')).toBe(false);
  });

  /* Sequência repetida fecha a conta dos verificadores e mesmo assim não é CPF de ninguém. */
  test('recusa sequência de dígitos repetidos', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });
});

describe('formatCpf', () => {
  test('aplica a máscara', () => {
    expect(formatCpf(VALIDO)).toBe('529.982.247-25');
  });

  test('entrada que não é CPF devolve o travessão das outras telas', () => {
    expect(formatCpf('')).toBe('—');
  });
});

describe('generateCpf', () => {
  test('a mesma semente devolve sempre o mesmo CPF', () => {
    expect(generateCpf(0)).toBe('10000000019');
    expect(generateCpf(0)).toBe(generateCpf(0));
  });

  test('tudo o que sai do gerador passa no validador', () => {
    const invalidos = Array.from({ length: SEMENTES }, (_, i) => generateCpf(i)).filter(
      (cpf) => !isValidCpf(cpf),
    );

    expect(invalidos).toEqual([]);
  });

  test('sementes distintas nunca colidem', () => {
    const gerados = Array.from({ length: SEMENTES }, (_, i) => generateCpf(i));

    expect(new Set(gerados).size).toBe(SEMENTES);
  });
});
