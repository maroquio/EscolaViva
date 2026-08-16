/*
 * O CPF é o identificador de acesso (ADR 0004), e a aritmética dos dígitos verificadores é a
 * única coisa que separa um número digitado de um documento.
 *
 * O gerador é testado junto do validador de propósito: são os dois lados do mesmo algoritmo, e
 * `cpfValido(gerarCpf(n))` sobre uma faixa de sementes derruba a suíte se qualquer um dos dois
 * estiver errado — coisa que um teste de tabela fixa não pegaria.
 */

import { describe, expect, test } from 'bun:test';
import { cpfValido, formatarCpf, gerarCpf, normalizarCpf } from '../../src/shared/document';

/** CPF de teste consagrado: os dois verificadores fecham. Não pertence a ninguém. */
const VALIDO = '52998224725';
const SEMENTES = 500;

describe('normalizarCpf', () => {
  test('tira pontuação, traço e espaço', () => {
    expect(normalizarCpf(' 529.982.247-25 ')).toBe(VALIDO);
  });

  test('texto sem dígito nenhum vira string vazia', () => {
    expect(normalizarCpf('sem número')).toBe('');
  });
});

describe('cpfValido', () => {
  test('aceita CPF com os dois verificadores corretos', () => {
    expect(cpfValido(VALIDO)).toBe(true);
  });

  test('recusa quando o último dígito está errado', () => {
    expect(cpfValido('52998224724')).toBe(false);
  });

  test('recusa comprimento diferente de onze', () => {
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('529982247250')).toBe(false);
  });

  test('recusa o que não é só dígito — a normalização vem antes', () => {
    expect(cpfValido('529.982.247-25')).toBe(false);
  });

  /* Sequência repetida fecha a conta dos verificadores e mesmo assim não é CPF de ninguém. */
  test('recusa sequência de dígitos repetidos', () => {
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('00000000000')).toBe(false);
  });
});

describe('formatarCpf', () => {
  test('aplica a máscara', () => {
    expect(formatarCpf(VALIDO)).toBe('529.982.247-25');
  });

  test('entrada que não é CPF devolve o travessão das outras telas', () => {
    expect(formatarCpf('')).toBe('—');
  });
});

describe('gerarCpf', () => {
  test('a mesma semente devolve sempre o mesmo CPF', () => {
    expect(gerarCpf(0)).toBe('10000000019');
    expect(gerarCpf(0)).toBe(gerarCpf(0));
  });

  test('tudo o que sai do gerador passa no validador', () => {
    const invalidos = Array.from({ length: SEMENTES }, (_, i) => gerarCpf(i)).filter(
      (cpf) => !cpfValido(cpf),
    );

    expect(invalidos).toEqual([]);
  });

  test('sementes distintas nunca colidem', () => {
    const gerados = Array.from({ length: SEMENTES }, (_, i) => gerarCpf(i));

    expect(new Set(gerados).size).toBe(SEMENTES);
  });
});
