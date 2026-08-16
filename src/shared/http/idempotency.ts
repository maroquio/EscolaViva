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
} from '../constants';
import type { Conexao } from '../db';
import { escrita } from '../db';
import { logger, redigir } from '../log';
import { paginaDeErro } from './errors';
import { usuarioAtualOuNulo } from './session';

export { CAMPO_CHAVE };

export type CorpoDeFormulario = Record<string, string | File | (string | File)[]>;

const liberarChave = async (sql: Conexao, chave: string): Promise<void> => {
  await sql`DELETE FROM idempotent_request WHERE idempotency_key = ${chave}`;
};

const ehRedirecionamento = (status: number): boolean => status >= 300 && status < 400;

export const middlewareIdempotencia: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== METODOS.post) return next();

  const corpo = await c.req.parseBody();
  c.set(VARIAVEIS_DE_CONTEXTO.corpo, corpo);

  const usuario = usuarioAtualOuNulo(c);
  if (usuario === null) return next();

  const chave = corpo[CAMPO_CHAVE];
  if (typeof chave !== 'string' || !FORMATOS.chaveDeIdempotencia.test(chave)) {
    const campos = { rota: c.req.path, usuario_id: usuario.id };
    logger.warn(redigir(campos), MOTIVOS_INTERNOS.escritaSemChave);
    return c.html(paginaDeErro(400), 400);
  }

  const sql = escrita();
  const inseridas: { idempotency_key: string }[] = await sql`
    INSERT INTO idempotent_request (idempotency_key, route, user_id, response_hash, response_location)
    VALUES (${chave}, ${c.req.path}, ${usuario.id}, '', '')
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;

  if (inseridas.length === 0) {
    const gravadas: { response_location: string }[] = await sql`
      SELECT response_location FROM idempotent_request WHERE idempotency_key = ${chave}`;
    const destino = gravadas[0]?.response_location ?? '';
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
    await liberarChave(sql, chave);
    return;
  }

  const hash = new Bun.CryptoHasher(HASH_DE_RESPOSTA.algoritmo)
    .update(local)
    .digest(HASH_DE_RESPOSTA.codificacao);
  await sql`
    UPDATE idempotent_request
       SET response_location = ${local}, response_hash = ${hash}
     WHERE idempotency_key = ${chave}`;
};
