import { autenticar } from './application/authenticate';
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
} from './application/queries';
import { convidarUsuario } from './application/inviteUser';
import { criarUnidade } from './application/createSchool';
import { encerrarSessao } from './application/endSession';
import { expurgarSessoesExpiradas } from './application/purgeSessions';
import { trocarSenha } from './application/changePassword';

export type { Papel, PapelEmUnidade } from './domain/role';
export type { Unidade } from './domain/school';
export type { UsuarioAutenticado, UsuarioResumo } from './domain/user';

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
} from './constants';

export { PAPEIS } from './domain/role';
export { STATUS_DE_REDE } from './domain/network';
export { TAMANHO_MINIMO_DE_SENHA } from './domain/user';
