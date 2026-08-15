import type { MiddlewareHandler } from 'hono';
import { ATIVOS, CABECALHOS, CACHE } from '../constantes';
import { usuarioAtualOuNulo } from './sessao';

export const middlewareCacheControl: MiddlewareHandler = async (c, next) => {
  await next();

  if (c.req.path.startsWith(ATIVOS.prefixoDeUrl)) {
    c.header(CABECALHOS.cacheControl, CACHE.asset);
    return;
  }

  if (usuarioAtualOuNulo(c) !== null) {
    c.header(CABECALHOS.cacheControl, CACHE.autenticado);
    c.header(CABECALHOS.vary, CABECALHOS.cookie);
    return;
  }

  c.header(CABECALHOS.cacheControl, CACHE.anonimo);
};
