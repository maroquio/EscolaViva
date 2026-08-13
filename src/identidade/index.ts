import { autenticar } from './aplicacao/autenticar';
import {
  ehProfessorNaUnidade,
  listarUnidades,
  listarUsuarios,
  nomesDeUsuarios,
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

/**
 * Única porta de entrada do módulo (I1). `identidade` não conhece nenhum outro domínio: é a
 * folha do grafo, e é por isso que academico, avaliacao e comunicacao podem apontar para cá.
 */
export const identidade = {
  autenticar,
  sessaoValida,
  encerrarSessao,
  expurgarSessoesExpiradas,
  trocarSenha,
  convidarUsuario,
  criarUnidade,
  listarUnidades,
  unidadePorId,
  listarUsuarios,
  redePorSlug,
  ehProfessorNaUnidade,
  professoresDaUnidade,
  nomesDeUsuarios,
};
