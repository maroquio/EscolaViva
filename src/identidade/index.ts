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

/**
 * As constantes do módulo que alguém de fora precisa ler, com o sufixo do dono para a travessia.
 *
 * `CODIGOS`, `MENSAGENS` e `ERROS_INTERNOS` ficam de dentro: viajam no `Resultado` e ninguém os
 * alcança pelo nome. `SEGURANCA` e `SEPARADOR_DE_ATRIBUICAO` também — o hash de tempo constante e
 * o separador da chave em memória são de como este módulo faz, não de o que ele promete.
 */
export {
  CAMPOS as CAMPOS_DE_IDENTIDADE,
  EVENTOS_DE_LOG as EVENTOS_DE_LOG_DE_IDENTIDADE,
  EXPURGO_DE_SESSOES,
  LIMITES as LIMITES_DE_IDENTIDADE,
  PAPEL,
  REDE_ATIVA,
  VOCABULARIO as VOCABULARIO_DE_IDENTIDADE,
} from './constantes';

/** Vocabulário fechado do domínio: fonte de tipo, reexportado direto de `dominio/`. */
export { PAPEIS } from './dominio/papel';
export { STATUS_DE_REDE } from './dominio/rede';
export { TAMANHO_MINIMO_DE_SENHA } from './dominio/usuario';
