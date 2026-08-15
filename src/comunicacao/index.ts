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

export {
  ALCANCE,
  CAMPOS as CAMPOS_DA_COMUNICACAO,
} from './constantes';
export type { Alcance } from './constantes';

export { CORPO_TAMANHO_MAXIMO, TITULO_TAMANHO_MAXIMO } from './dominio/comunicado';
