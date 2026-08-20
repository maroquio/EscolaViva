import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import { CONTEXT_VARIABLES, FORMATS, HEADERS } from '../constants';
import { registerCorrelationSource } from '../log/logger';

export type RequestContext = { correlationId: string; userId?: string; networkId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function withContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

const incomingCorrelation = (header: string | undefined): string =>
  header !== undefined && FORMATS.correlation.test(header) ? header : crypto.randomUUID();

export const correlationMiddleware: MiddlewareHandler = async (c, next) => {
  const correlationId = incomingCorrelation(c.req.header(HEADERS.correlation));
  c.set(CONTEXT_VARIABLES.correlationId, correlationId);
  c.header(HEADERS.correlation, correlationId);
  await withContext({ correlationId }, next);
};

registerCorrelationSource(() => currentContext()?.correlationId);
