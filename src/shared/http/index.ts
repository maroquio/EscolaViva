import type { CorpoDeFormulario } from './idempotencia';
import type { UsuarioDaSessao } from './sessao';

export { comContexto, contextoAtual, middlewareCorrelacao } from './correlacao';
export type { ContextoRequisicao } from './correlacao';

export { ipDoCliente } from './ip';

export { middlewareCacheControl } from './cacheControl';

export {
  COOKIE_SESSAO,
  abrirSessao,
  criarMiddlewareSessao,
  fecharSessao,
  sessaoIdAtual,
  usuarioAtual,
  usuarioAtualOuNulo,
} from './sessao';
export type { CarregadorDeUsuario, PapelDaSessao, UsuarioDaSessao } from './sessao';

export { exigirLogin, exigirPapel, temPapel, unidadesDoPapel } from './autorizacao';

export { redeAtual } from './tenant';

export { CAMPO_CHAVE, middlewareIdempotencia } from './idempotencia';
export type { CorpoDeFormulario } from './idempotencia';

export {
  NaoAutorizado,
  NaoEncontrado,
  Proibido,
  RegraDeNegocio,
  middlewareErros,
  registrarRenderizadorDeErro,
} from './erros';
export type { RenderizadorDeErro, StatusDeErro } from './erros';

export { ehIdentificador } from './identificador';

/**
 * O que os middlewares guardam no contexto da requisição. A camada web monta o servidor com
 * `new Hono<{ Variables: Variaveis }>()` e passa a ler `c.get(...)` já tipado.
 *
 * `corpo` é preenchido pelo middleware de idempotência nas requisições POST, que lê o formulário
 * uma única vez.
 */
export type Variaveis = {
  correlacaoId: string;
  sessaoId: string | null;
  usuario: UsuarioDaSessao | null;
  corpo: CorpoDeFormulario;
};
