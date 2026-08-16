/*
 * As portas são o único ponto do sistema que fala com o relógio real e com o gerador de
 * identificador. O que se garante aqui é o contrato que os casos de uso assumem: `now()`
 * devolve um Date que anda com o tempo e `next()` devolve um uuid que nunca repete.
 */

import { describe, expect, test } from 'bun:test';
import { systemClock, uuidIdGenerator } from '../../src/shared/ports';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHAMADAS = 1000;

describe('systemClock', () => {
  test('now() devolve um Date', () => {
    const relogio = systemClock;

    const instante = relogio.now();

    expect(instante).toBeInstanceOf(Date);
  });

  test('now() devolve o instante presente, entre o antes e o depois da chamada', () => {
    const antes = Date.now();

    const instante = systemClock.now();

    expect(instante.getTime()).toBeGreaterThanOrEqual(antes);
    expect(instante.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('now() nunca retrocede entre duas leituras seguidas', () => {
    const primeira = systemClock.now();

    const segunda = systemClock.now();

    expect(segunda.getTime()).toBeGreaterThanOrEqual(primeira.getTime());
  });

  test('now() devolve um Date novo a cada chamada, e não uma instância compartilhada', () => {
    const primeira = systemClock.now();

    const segunda = systemClock.now();

    expect(segunda).not.toBe(primeira);
  });
});

describe('uuidIdGenerator', () => {
  test('next() devolve um uuid válido', () => {
    const gerador = uuidIdGenerator;

    const id = gerador.next();

    expect(id).toMatch(UUID_V4);
  });

  test(`next() não repete em ${CHAMADAS} chamadas`, () => {
    const gerador = uuidIdGenerator;

    const gerados = new Set(Array.from({ length: CHAMADAS }, () => gerador.next()));

    expect(gerados.size).toBe(CHAMADAS);
  });

  test(`os ${CHAMADAS} identificadores gerados são todos uuid válidos`, () => {
    const gerador = uuidIdGenerator;

    const invalidos = Array.from({ length: CHAMADAS }, () => gerador.next()).filter(
      (id) => !UUID_V4.test(id),
    );

    expect(invalidos).toEqual([]);
  });
});
