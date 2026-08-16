import { Hono } from 'hono';
import { checkDatabase } from '../shared/db';
import type { Variables } from '../shared/http';
import { HEADERS, PROBE_TIMEOUT_MS } from '../shared/constants';
import { CORPO_DE_SAUDE, ROTAS, SEM_CACHE_NA_SAUDE } from './constantes';

export const rotasSaude = new Hono<{ Variables: Variables }>();

rotasSaude.get(ROTAS.publicas.saude.padrao, async (c) => {
  const bancoResponde = await checkDatabase(PROBE_TIMEOUT_MS);
  c.header(HEADERS.cacheControl, SEM_CACHE_NA_SAUDE);
  if (bancoResponde) return c.json(CORPO_DE_SAUDE.ok, 200);
  return c.json(CORPO_DE_SAUDE.degradado, 503);
});

rotasSaude.get(ROTAS.publicas.saudeViva.padrao, (c) => {
  c.header(HEADERS.cacheControl, SEM_CACHE_NA_SAUDE);
  return c.json(CORPO_DE_SAUDE.vivo, 200);
});
