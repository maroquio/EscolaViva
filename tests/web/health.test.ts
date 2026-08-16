/*
 * I13 — as duas rotas de saúde dizem coisas diferentes de propósito.
 *
 * `/health` afirma que o sistema atende: só responde 200 se o banco responder. `/health/live`
 * afirma que o processo existe, e nada mais — é o que continua respondendo enquanto o banco está
 * fora do ar e enquanto as requisições em curso drenam no desligamento.
 *
 * Nenhuma das duas pode ser guardada por proxy nenhum: uma resposta de saúde em cache é uma
 * mentira com validade.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { prepareDatabase } from '../support/database';
import { open, healthWithDatabaseDown } from './support';

const PROCESS_DEADLINE_MS = 30_000;

describe('rotas de saúde', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  test('/health responde 200 com o banco de pé', async () => {
    const response = await open('/health');

    const body = (await response.json()) as { status: string; banco: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', banco: 'ok' });
  });

  test('/health/live responde 200 sem tocar no banco', async () => {
    const withDatabaseUp = await open('/health/live');

    const withoutDatabase = await healthWithDatabaseDown();

    expect(withDatabaseUp.status).toBe(200);
    expect(withoutDatabase.live).toBe(200);
    expect(withoutDatabase.health).toBe(503);
  }, PROCESS_DEADLINE_MS);

  test('as duas rotas de saúde recusam cache', async () => {
    const health = await open('/health');
    const live = await open('/health/live');

    const headers = [health.headers.get('Cache-Control'), live.headers.get('Cache-Control')];

    expect(headers).toEqual(['no-store', 'no-store']);
  });

  test('/health não é rota autenticada: responde sem sessão nenhuma', async () => {
    const response = await open('/health');

    const kind = response.headers.get('Content-Type') ?? '';

    expect(response.status).toBe(200);
    expect(kind).toContain('application/json');
  });
});
