/**
 * I13 — saúde que diz a verdade.
 *
 * `/health` só responde 200 se o banco responder: um processo de pé com o PostgreSQL fora do ar
 * não está saudável, está apenas vivo. A distinção existe para que, quando houver balanceador
 * (E08) ou orquestrador, a decisão de tirar a instância do rodízio seja tomada pelo sinal certo.
 *
 * `/health/live` é a outra metade: confirma o processo sem tocar em dependência nenhuma, e é o que
 * responde durante o desligamento gracioso, enquanto as requisições em curso terminam.
 */

import { Hono } from 'hono';
import { verificarBanco } from '../shared/db';
import type { Variaveis } from '../shared/http';

/** Casado com o `SELECT 1` do I13: um banco fora do ar responde 503 rápido, sem pendurar a rota. */
const PRAZO_DO_BANCO_MS = 2000;

const SEM_CACHE = 'no-store';

export const rotasSaude = new Hono<{ Variables: Variaveis }>();

rotasSaude.get('/health', async (c) => {
  const bancoResponde = await verificarBanco(PRAZO_DO_BANCO_MS);
  c.header('Cache-Control', SEM_CACHE);
  if (bancoResponde) return c.json({ status: 'ok', banco: 'ok' }, 200);
  return c.json({ status: 'degradado', banco: 'indisponivel' }, 503);
});

rotasSaude.get('/health/live', (c) => {
  c.header('Cache-Control', SEM_CACHE);
  return c.json({ status: 'ok' }, 200);
});
