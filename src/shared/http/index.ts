import type { CorpoDeFormulario } from './idempotency';
import type { UsuarioDaSessao } from './session';

export { comContexto, contextoAtual, middlewareCorrelacao } from './correlation';
export type { ContextoRequisicao } from './correlation';

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
} from './session';
export type { CarregadorDeUsuario, PapelDaSessao, UsuarioDaSessao } from './session';

export { exigirLogin, exigirPapel, temPapel, unidadesDoPapel } from './authorization';

export { redeAtual } from './tenant';

export { CAMPO_CHAVE, middlewareIdempotencia } from './idempotency';
export type { CorpoDeFormulario } from './idempotency';

export {
  NaoAutorizado,
  NaoEncontrado,
  Proibido,
  RegraDeNegocio,
  middlewareErros,
  registrarRenderizadorDeErro,
} from './errors';
export type { RenderizadorDeErro, StatusDeErro } from './errors';

export { ehIdentificador } from './identifier';

export type Variaveis = {
  correlacaoId: string;
  sessaoId: string | null;
  usuario: UsuarioDaSessao | null;
  corpo: CorpoDeFormulario;
};
