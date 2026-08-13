import type { MiddlewareHandler } from 'hono';
import { usuarioAtualOuNulo } from './sessao';

const PREFIXO_PUBLICO = '/publico/';
const CACHE_DE_ASSET = 'public, max-age=31536000, immutable';
const CACHE_AUTENTICADO = 'private, no-store';
const CACHE_ANONIMO = 'no-store';

/**
 * I11: não existe cache neste sistema, mas existe cabeçalho. Boletim de um aluno servido do cache
 * de um proxy para o responsável de outro é o erro mais grave da lista, e três linhas o impedem.
 *
 * O arquivo de `/publico/` é a única exceção: o nome já carrega o hash do conteúdo (I10), então
 * ele pode ser guardado para sempre — trocar o arquivo troca o nome.
 */
export const middlewareCacheControl: MiddlewareHandler = async (c, next) => {
  await next();

  if (c.req.path.startsWith(PREFIXO_PUBLICO)) {
    c.header('Cache-Control', CACHE_DE_ASSET);
    return;
  }

  if (usuarioAtualOuNulo(c) !== null) {
    c.header('Cache-Control', CACHE_AUTENTICADO);
    c.header('Vary', 'Cookie');
    return;
  }

  c.header('Cache-Control', CACHE_ANONIMO);
};
