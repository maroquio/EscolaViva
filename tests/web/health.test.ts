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
import { prepararBanco } from '../support/database';
import { abrir, saudeComBancoForaDoAr } from './support';

const PRAZO_DO_PROCESSO_MS = 30_000;

describe('rotas de saúde', () => {
  beforeAll(async () => {
    await prepararBanco();
  });

  test('/health responde 200 com o banco de pé', async () => {
    const resposta = await abrir('/health');

    const corpo = (await resposta.json()) as { status: string; banco: string };

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({ status: 'ok', banco: 'ok' });
  });

  test('/health/live responde 200 sem tocar no banco', async () => {
    const comBancoDePe = await abrir('/health/live');

    const semBanco = await saudeComBancoForaDoAr();

    expect(comBancoDePe.status).toBe(200);
    expect(semBanco.live).toBe(200);
    expect(semBanco.health).toBe(503);
  }, PRAZO_DO_PROCESSO_MS);

  test('as duas rotas de saúde recusam cache', async () => {
    const saude = await abrir('/health');
    const vivo = await abrir('/health/live');

    const cabecalhos = [saude.headers.get('Cache-Control'), vivo.headers.get('Cache-Control')];

    expect(cabecalhos).toEqual(['no-store', 'no-store']);
  });

  test('/health não é rota autenticada: responde sem sessão nenhuma', async () => {
    const resposta = await abrir('/health');

    const tipo = resposta.headers.get('Content-Type') ?? '';

    expect(resposta.status).toBe(200);
    expect(tipo).toContain('application/json');
  });
});
