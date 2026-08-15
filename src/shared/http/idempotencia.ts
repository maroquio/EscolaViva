import type { MiddlewareHandler } from 'hono';
import {
  CABECALHOS,
  CAMINHOS_DE_ENTRADA,
  CAMPO_CHAVE,
  FORMATOS,
  HASH_DE_RESPOSTA,
  METODOS,
  MOTIVOS_INTERNOS,
  VARIAVEIS_DE_CONTEXTO,
} from '../constantes';
import type { Conexao } from '../db';
import { escrita } from '../db';
import { logger, redigir } from '../log';
import { paginaDeErro } from './erros';
import { usuarioAtualOuNulo } from './sessao';

/**
 * O nome do campo oculto mora em `shared/constantes.ts`, junto do resto do vocabulário de
 * infraestrutura — os `.eta` que o escrevem e este middleware que o lê passaram a ler do mesmo
 * lugar. Segue reexportado daqui porque é por aqui que o `index.ts` do módulo o publica.
 */
export { CAMPO_CHAVE };

export type CorpoDeFormulario = Record<string, string | File | (string | File)[]>;

const liberarChave = async (sql: Conexao, chave: string): Promise<void> => {
  await sql`DELETE FROM requisicao_idempotente WHERE chave = ${chave}`;
};

const ehRedirecionamento = (status: number): boolean => status >= 300 && status < 400;

/**
 * I4: o navegador é entrada externa. Um responsável com 4G ruim toca em "enviar" duas vezes e o
 * sistema recebe duas requisições idênticas — sem esta tabela, duas matrículas. A chave vem no
 * próprio formulário, gerada no render, e a linha é inserida antes do processamento: quem chega
 * depois encontra o conflito e é levado ao resultado da primeira, sem reprocessar nada.
 *
 * A garantia não é do formulário HTML: qualquer entrada externa que traga uma chave — um webhook,
 * por exemplo — usa esta mesma tabela sem uma linha de mudança.
 */
export const middlewareIdempotencia: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== METODOS.post) return next();

  // O corpo é lido uma única vez e fica no contexto: as rotas o reaproveitam sem reler o fluxo.
  const corpo = await c.req.parseBody();
  c.set(VARIAVEIS_DE_CONTEXTO.corpo, corpo);

  const usuario = usuarioAtualOuNulo(c);
  // A linha exige `usuario_id`; a única escrita anônima é o próprio login, e ela não tem o que
  // registrar — repetir um login apenas cria outra sessão.
  if (usuario === null) return next();

  const chave = corpo[CAMPO_CHAVE];
  if (typeof chave !== 'string' || !FORMATOS.chaveDeIdempotencia.test(chave)) {
    const campos = { rota: c.req.path, usuario_id: usuario.id };
    logger.warn(redigir(campos), MOTIVOS_INTERNOS.escritaSemChave);
    return c.html(paginaDeErro(400), 400);
  }

  const sql = escrita();
  const inseridas: { chave: string }[] = await sql`
    INSERT INTO requisicao_idempotente (chave, rota, usuario_id, resposta_hash, resposta_local)
    VALUES (${chave}, ${c.req.path}, ${usuario.id}, '', '')
    ON CONFLICT (chave) DO NOTHING
    RETURNING chave`;

  if (inseridas.length === 0) {
    const gravadas: { resposta_local: string }[] = await sql`
      SELECT resposta_local FROM requisicao_idempotente WHERE chave = ${chave}`;
    const destino = gravadas[0]?.resposta_local ?? '';
    // Quando a requisição original ainda está em curso, não há destino gravado para reapresentar.
    return c.redirect(destino === '' ? CAMINHOS_DE_ENTRADA.painel : destino, 303);
  }

  try {
    await next();
  } catch (erro) {
    await liberarChave(sql, chave);
    throw erro;
  }

  const local = c.res.headers.get(CABECALHOS.location);
  if (local === null || !ehRedirecionamento(c.res.status)) {
    // Sem redirecionamento não houve escrita concluída (a página voltou com erros de validação):
    // a chave é devolvida para que a correção possa ser enviada.
    await liberarChave(sql, chave);
    return;
  }

  const hash = new Bun.CryptoHasher(HASH_DE_RESPOSTA.algoritmo)
    .update(local)
    .digest(HASH_DE_RESPOSTA.codificacao);
  await sql`
    UPDATE requisicao_idempotente
       SET resposta_local = ${local}, resposta_hash = ${hash}
     WHERE chave = ${chave}`;
};
