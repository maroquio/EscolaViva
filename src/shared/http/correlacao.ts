import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import { registrarFonteDeCorrelacao } from '../log/logger';

export type ContextoRequisicao = { correlacaoId: string; usuarioId?: string; redeId?: string };

const CABECALHO_CORRELACAO = 'X-Correlation-Id';

/**
 * O identificador aceito de fora é curto e imprimível — ele volta no cabeçalho da resposta,
 * então não pode carregar conteúdo arbitrário do cliente.
 */
const FORMATO_ACEITO = /^[A-Za-z0-9._:-]{8,128}$/;

const armazenamento = new AsyncLocalStorage<ContextoRequisicao>();

export function contextoAtual(): ContextoRequisicao | undefined {
  return armazenamento.getStore();
}

export function comContexto<T>(ctx: ContextoRequisicao, fn: () => T): T {
  return armazenamento.run(ctx, fn);
}

const correlacaoRecebida = (cabecalho: string | undefined): string =>
  cabecalho !== undefined && FORMATO_ACEITO.test(cabecalho) ? cabecalho : crypto.randomUUID();

/**
 * I16: o identificador de correlação nasce na borda — aproveitado do cabeçalho quando o cliente
 * envia um válido, gerado aqui quando não envia — e é devolvido na resposta. Não existe coleta de
 * métricas nem tracing neste sistema: o rastro é o log, e este é o formato dele.
 */
export const middlewareCorrelacao: MiddlewareHandler = async (c, next) => {
  const correlacaoId = correlacaoRecebida(c.req.header(CABECALHO_CORRELACAO));
  c.set('correlacaoId', correlacaoId);
  c.header(CABECALHO_CORRELACAO, correlacaoId);
  await comContexto({ correlacaoId }, next);
};

// O logger não conhece HTTP: ele pergunta a esta fonte qual é a correlação da requisição em curso.
// Registrar no carregamento do módulo garante que toda linha de log já saia correlacionada.
registrarFonteDeCorrelacao(() => contextoAtual()?.correlacaoId);
