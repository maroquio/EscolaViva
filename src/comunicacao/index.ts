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
