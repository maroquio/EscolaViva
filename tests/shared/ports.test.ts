/*
 * As portas são o único ponto do sistema que fala com o relógio real e com o gerador de
 * identificador. O que se garante aqui é o contrato que os casos de uso assumem: `now()`
 * devolve um Date que anda com o tempo e `next()` devolve um uuid que nunca repete.
 */

import { describe, expect, test } from 'bun:test';
import { systemClock, uuidIdGenerator } from '../../src/shared/ports';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLL_CALLS = 1000;

describe('systemClock', () => {
  test('now() devolve um Date', () => {
    const clock = systemClock;

    const instant = clock.now();

    expect(instant).toBeInstanceOf(Date);
  });

  test('now() devolve o instante presente, entre o antes e o depois da chamada', () => {
    const before = Date.now();

    const instant = systemClock.now();

    expect(instant.getTime()).toBeGreaterThanOrEqual(before);
    expect(instant.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('now() nunca retrocede entre duas leituras seguidas', () => {
    const first = systemClock.now();

    const second = systemClock.now();

    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  test('now() devolve um Date novo a cada chamada, e não uma instância compartilhada', () => {
    const first = systemClock.now();

    const second = systemClock.now();

    expect(second).not.toBe(first);
  });
});

describe('uuidIdGenerator', () => {
  test('next() devolve um uuid válido', () => {
    const generator = uuidIdGenerator;

    const id = generator.next();

    expect(id).toMatch(UUID_V4);
  });

  test(`next() não repete em ${ROLL_CALLS} chamadas`, () => {
    const generator = uuidIdGenerator;

    const generated = new Set(Array.from({ length: ROLL_CALLS }, () => generator.next()));

    expect(generated.size).toBe(ROLL_CALLS);
  });

  test(`os ${ROLL_CALLS} identificadores gerados são todos uuid válidos`, () => {
    const generator = uuidIdGenerator;

    const invalid = Array.from({ length: ROLL_CALLS }, () => generator.next()).filter(
      (id) => !UUID_V4.test(id),
    );

    expect(invalid).toEqual([]);
  });
});
