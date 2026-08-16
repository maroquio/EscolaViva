import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import { CABECALHOS, FORMATOS, VARIAVEIS_DE_CONTEXTO } from '../constants';
import { registrarFonteDeCorrelacao } from '../log/logger';

export type ContextoRequisicao = { correlacaoId: string; usuarioId?: string; redeId?: string };

const armazenamento = new AsyncLocalStorage<ContextoRequisicao>();

export function contextoAtual(): ContextoRequisicao | undefined {
  return armazenamento.getStore();
}

export function comContexto<T>(ctx: ContextoRequisicao, fn: () => T): T {
  return armazenamento.run(ctx, fn);
}

const correlacaoRecebida = (cabecalho: string | undefined): string =>
  cabecalho !== undefined && FORMATOS.correlacao.test(cabecalho) ? cabecalho : crypto.randomUUID();

export const middlewareCorrelacao: MiddlewareHandler = async (c, next) => {
  const correlacaoId = correlacaoRecebida(c.req.header(CABECALHOS.correlacao));
  c.set(VARIAVEIS_DE_CONTEXTO.correlacaoId, correlacaoId);
  c.header(CABECALHOS.correlacao, correlacaoId);
  await comContexto({ correlacaoId }, next);
};

registrarFonteDeCorrelacao(() => contextoAtual()?.correlacaoId);
