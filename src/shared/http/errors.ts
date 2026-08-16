import type { Context, MiddlewareHandler } from 'hono';
import { ERROR_TITLES, HTML_ENTITIES, HTTP_LOG_EVENTS } from '../constants';
import { logger, redact } from '../log';
import { currentContext } from './correlation';

export class Unauthorized extends Error {}
export class NotFound extends Error {}
export class Forbidden extends Error {}
export class BusinessRuleViolation extends Error {}

export type ErrorStatus = 400 | 401 | 403 | 404 | 422 | 500;

export type ErrorRenderer = (status: ErrorStatus, correlationId: string) => string;

let renderer: ErrorRenderer | null = null;

export function registerErrorRenderer(f: ErrorRenderer): void {
  renderer = f;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, HTML_ENTITIES.ampersand)
    .replace(/</g, HTML_ENTITIES.lessThan)
    .replace(/>/g, HTML_ENTITIES.greaterThan)
    .replace(/"/g, HTML_ENTITIES.doubleQuote);

const FALLBACK_PAGE = (title: string, correlationId: string): string =>
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  `<title>${title}</title></head><body><main><h1>${title}</h1>` +
  `<p>Informe este código ao pedir ajuda: <code>${correlationId}</code></p>` +
  '<p><a href="/">Voltar ao início</a></p></main></body></html>';

const minimalPage = (status: ErrorStatus, correlationId: string): string =>
  FALLBACK_PAGE(escapeHtml(ERROR_TITLES[status]), escapeHtml(correlationId));

export function errorPage(status: ErrorStatus): string {
  const correlationId = currentContext()?.correlationId ?? '';
  if (renderer === null) return minimalPage(status, correlationId);
  return renderer(status, correlationId);
}

const errorStatus = (error: unknown): ErrorStatus => {
  if (error instanceof Unauthorized) return 401;
  if (error instanceof Forbidden) return 403;
  if (error instanceof NotFound) return 404;
  if (error instanceof BusinessRuleViolation) return 422;
  return 500;
};

const logFailure = (c: Context, status: ErrorStatus, error: unknown): void => {
  const base = {
    status,
    metodo: c.req.method,
    rota: c.req.path,
    tipo: error instanceof Error ? error.constructor.name : typeof error,
    mensagem: error instanceof Error ? error.message : String(error),
  };
  const fields = redact(
    status === 500 && error instanceof Error ? { ...base, pilha: error.stack } : base,
  );
  if (status === 500) {
    logger.error(fields, HTTP_LOG_EVENTS.requestFailed);
    return;
  }
  logger.warn(fields, HTTP_LOG_EVENTS.requestRejected);
};

export const errorsMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    const status = errorStatus(error);
    logFailure(c, status, error);
    return c.html(errorPage(status), status);
  }
};
