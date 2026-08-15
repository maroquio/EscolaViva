import { autenticar } from './aplicacao/autenticar';
import {
  contarUnidadesEUsuarios,
  ehProfessorNaUnidade,
  listarUnidades,
  listarUsuarios,
  nomesDeUsuarios,
  paginaDeUnidades,
  paginaDeUsuarios,
  professoresDaUnidade,
  redePorSlug,
  sessaoValida,
  unidadePorId,
} from './aplicacao/consultas';
import { convidarUsuario } from './aplicacao/convidarUsuario';
import { criarUnidade } from './aplicacao/criarUnidade';
import { encerrarSessao } from './aplicacao/encerrarSessao';
import { expurgarSessoesExpiradas } from './aplicacao/expurgarSessoes';
import { trocarSenha } from './aplicacao/trocarSenha';

export type { Papel, PapelEmUnidade } from './dominio/papel';
export type { Unidade } from './dominio/unidade';
export type { UsuarioAutenticado, UsuarioResumo } from './dominio/usuario';

export const identidade = {
  autenticar,
  sessaoValida,
  encerrarSessao,
  expurgarSessoesExpiradas,
  trocarSenha,
  convidarUsuario,
  criarUnidade,
  listarUnidades,
  paginaDeUnidades,
  unidadePorId,
  listarUsuarios,
  paginaDeUsuarios,
  contarUnidadesEUsuarios,
  redePorSlug,
  ehProfessorNaUnidade,
  professoresDaUnidade,
  nomesDeUsuarios,
};

export {
  CAMPOS as CAMPOS_DE_IDENTIDADE,
  EVENTOS_DE_LOG as EVENTOS_DE_LOG_DE_IDENTIDADE,
  EXPURGO_DE_SESSOES,
  LIMITES as LIMITES_DE_IDENTIDADE,
  PAPEL,
  REDE_ATIVA,
  VOCABULARIO as VOCABULARIO_DE_IDENTIDADE,
} from './constantes';

export { PAPEIS } from './dominio/papel';
export { STATUS_DE_REDE } from './dominio/rede';
export { TAMANHO_MINIMO_DE_SENHA } from './dominio/usuario';
