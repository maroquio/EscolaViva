import { Hono } from 'hono';
import { verificarBanco } from '../shared/db';
import type { Variaveis } from '../shared/http';
import { CABECALHOS, PRAZO_DA_SONDA_MS } from '../shared/constantes';
import { CORPO_DE_SAUDE, ROTAS, SEM_CACHE_NA_SAUDE } from './constantes';

export const rotasSaude = new Hono<{ Variables: Variaveis }>();

rotasSaude.get(ROTAS.publicas.saude.padrao, async (c) => {
  const bancoResponde = await verificarBanco(PRAZO_DA_SONDA_MS);
  c.header(CABECALHOS.cacheControl, SEM_CACHE_NA_SAUDE);
  if (bancoResponde) return c.json(CORPO_DE_SAUDE.ok, 200);
  return c.json(CORPO_DE_SAUDE.degradado, 503);
});

rotasSaude.get(ROTAS.publicas.saudeViva.padrao, (c) => {
  c.header(CABECALHOS.cacheControl, SEM_CACHE_NA_SAUDE);
  return c.json(CORPO_DE_SAUDE.vivo, 200);
});
