/**
 * Única porta de entrada do módulo `comunicacao` (I1). O que não está aqui é privado — inclusive
 * o repositório e a forma armazenada do comunicado.
 */
import {
  comunicadoParaResponsavel,
  contagemDoMural,
  listarComunicados,
  muralDoResponsavel,
  paginaDeComunicados,
  paginaDoMural,
  resumoDeComunicados,
} from './aplicacao/consultas';
import { marcarComoLido } from './aplicacao/marcarComoLido';
import { publicarComunicado } from './aplicacao/publicarComunicado';

export type { Comunicado } from './dominio/comunicado';
export type { EstatisticaDeLeitura, ItemDoMural } from './dominio/destinatario';

export const comunicacao = {
  publicarComunicado,
  muralDoResponsavel,
  paginaDoMural,
  contagemDoMural,
  comunicadoParaResponsavel,
  marcarComoLido,
  listarComunicados,
  paginaDeComunicados,
  resumoDeComunicados,
};

/**
 * As constantes do módulo que alguém de fora precisa ler, com o sufixo do dono para a travessia.
 *
 * Sai `ALCANCE`, o objeto nomeado que a rota compara; fica dentro `ALCANCES`, a lista que existe
 * para gerar o tipo. `CODIGOS`, `MENSAGENS` e `ERROS_INTERNOS` também ficam: viajam no `Resultado`
 * e ninguém os alcança pelo nome do outro lado da fronteira.
 */
export {
  ALCANCE,
  CAMPOS as CAMPOS_DA_COMUNICACAO,
} from './constantes';
export type { Alcance } from './constantes';

/** Os limites do comunicado são fonte da regra: saem de `dominio/comunicado.ts`. */
export { CORPO_TAMANHO_MAXIMO, TITULO_TAMANHO_MAXIMO } from './dominio/comunicado';
