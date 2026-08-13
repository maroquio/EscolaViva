/*
 * As portas são o único ponto do sistema que fala com o relógio real e com o gerador de
 * identificador. O que se garante aqui é o contrato que os casos de uso assumem: `agora()`
 * devolve um Date que anda com o tempo e `novo()` devolve um uuid que nunca repete.
 */

import { describe, expect, test } from 'bun:test';
import { clockDoSistema, idGeneratorUuid } from '../../src/shared/ports';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHAMADAS = 1000;

describe('clockDoSistema', () => {
  test('agora() devolve um Date', () => {
    const relogio = clockDoSistema;

    const instante = relogio.agora();

    expect(instante).toBeInstanceOf(Date);
  });

  test('agora() devolve o instante presente, entre o antes e o depois da chamada', () => {
    const antes = Date.now();

    const instante = clockDoSistema.agora();

    expect(instante.getTime()).toBeGreaterThanOrEqual(antes);
    expect(instante.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('agora() nunca retrocede entre duas leituras seguidas', () => {
    const primeira = clockDoSistema.agora();

    const segunda = clockDoSistema.agora();

    expect(segunda.getTime()).toBeGreaterThanOrEqual(primeira.getTime());
  });

  test('agora() devolve um Date novo a cada chamada, e não uma instância compartilhada', () => {
    const primeira = clockDoSistema.agora();

    const segunda = clockDoSistema.agora();

    expect(segunda).not.toBe(primeira);
  });
});

describe('idGeneratorUuid', () => {
  test('novo() devolve um uuid válido', () => {
    const gerador = idGeneratorUuid;

    const id = gerador.novo();

    expect(id).toMatch(UUID_V4);
  });

  test(`novo() não repete em ${CHAMADAS} chamadas`, () => {
    const gerador = idGeneratorUuid;

    const gerados = new Set(Array.from({ length: CHAMADAS }, () => gerador.novo()));

    expect(gerados.size).toBe(CHAMADAS);
  });

  test(`os ${CHAMADAS} identificadores gerados são todos uuid válidos`, () => {
    const gerador = idGeneratorUuid;

    const invalidos = Array.from({ length: CHAMADAS }, () => gerador.novo()).filter(
      (id) => !UUID_V4.test(id),
    );

    expect(invalidos).toEqual([]);
  });
});
