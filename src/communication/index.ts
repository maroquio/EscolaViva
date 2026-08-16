import {
  comunicadoParaResponsavel,
  contagemDoMural,
  listarComunicados,
  muralDoResponsavel,
  paginaDeComunicados,
  paginaDoMural,
  resumoDeComunicados,
} from './application/queries';
import { marcarComoLido } from './application/markAsRead';
import { publicarComunicado } from './application/publishAnnouncement';

export type { Comunicado } from './domain/announcement';
export type { EstatisticaDeLeitura, ItemDoMural } from './domain/recipient';

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
} from './constants';
export type { Alcance } from './constants';

export { CORPO_TAMANHO_MAXIMO, TITULO_TAMANHO_MAXIMO } from './domain/announcement';
