import type { Context, MiddlewareHandler } from 'hono';
import { CAMINHOS_DE_ENTRADA, METODOS, MOTIVOS_INTERNOS } from '../constantes';
import { logger, redigir } from '../log';
import { NaoAutorizado, paginaDeErro } from './erros';
import type { PapelDaSessao, UsuarioDaSessao } from './sessao';
import { usuarioAtualOuNulo } from './sessao';

export function temPapel(u: UsuarioDaSessao, papel: PapelDaSessao): boolean {
  return u.papeis.some((atribuicao) => atribuicao.papel === papel);
}

export function unidadesDoPapel(u: UsuarioDaSessao, papel: PapelDaSessao): string[] {
  return u.papeis.filter((atribuicao) => atribuicao.papel === papel).map((atribuicao) => atribuicao.unidadeId);
}

const recusarAnonimo = (c: Context): Response => {
  if (c.req.method === METODOS.get) return c.redirect(CAMINHOS_DE_ENTRADA.login, 303);
  throw new NaoAutorizado(MOTIVOS_INTERNOS.requisicaoSemSessao);
};

export function exigirLogin(): MiddlewareHandler {
  return async (c, next) => {
    if (usuarioAtualOuNulo(c) === null) return recusarAnonimo(c);
    await next();
  };
}

export function exigirPapel(...papeis: PapelDaSessao[]): MiddlewareHandler {
  return async (c, next) => {
    const usuario = usuarioAtualOuNulo(c);
    if (usuario === null) return recusarAnonimo(c);

    if (!papeis.some((papel) => temPapel(usuario, papel))) {
      const campos = { rota: c.req.path, usuario_id: usuario.id, papeis_exigidos: papeis };
      logger.warn(redigir(campos), MOTIVOS_INTERNOS.acessoNegadoPorPapel);
      return c.html(paginaDeErro(403), 403);
    }

    await next();
  };
}
