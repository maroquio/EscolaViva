import type { MiddlewareHandler } from 'hono';
import { ATIVOS, CABECALHOS, CACHE } from '../constantes';
import { usuarioAtualOuNulo } from './sessao';

/**
 * I11: não existe cache neste sistema, mas existe cabeçalho. Boletim de um aluno servido do cache
 * de um proxy para o responsável de outro é o erro mais grave da lista, e três linhas o impedem.
 *
 * O arquivo de `/publico/` é a única exceção: o nome já carrega o hash do conteúdo (I10), então
 * ele pode ser guardado para sempre — trocar o arquivo troca o nome.
 */
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
