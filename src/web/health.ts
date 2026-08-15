/**
 * I13 — saúde que diz a verdade.
 *
 * `/health` só responde 200 se o banco responder: um processo de pé com o PostgreSQL fora do ar
 * não está saudável, está apenas vivo. A distinção existe para que, quando houver balanceador
 * (E08) ou orquestrador, a decisão de tirar a instância do rodízio seja tomada pelo sinal certo.
 *
 * `/health/live` é a outra metade: confirma o processo sem tocar em dependência nenhuma, e é o que
 * responde durante o desligamento gracioso, enquanto as requisições em curso terminam.
 *
 * Os dois caminhos, o prazo da sonda e o corpo de cada resposta vivem nas constantes: `shared/`
 * também precisa conhecê-los (é infraestrutura que decide desligar a instância), e o corpo JSON é
 * contrato de quem monitora, não texto de tela.
 */

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
