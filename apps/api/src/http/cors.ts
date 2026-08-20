import type { MiddlewareHandler } from 'hono';
import { CORS_HEADERS, HEADERS, METHODS, STATUS } from '../shared/constants';
import { CORS } from './constants';

export function createCorsMiddleware(origins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(origins);
  const allowedHeaders = [HEADERS.contentType, HEADERS.idempotencyKey, HEADERS.requestedBy].join(
    CORS.headerSeparator,
  );
  const exposedHeaders = [HEADERS.location, HEADERS.correlation].join(CORS.headerSeparator);

  return async (c, next) => {
    if (allowed.size === 0) return next();

    const origin = c.req.header(HEADERS.origin);
    if (origin === undefined || !allowed.has(origin)) {
      if (c.req.method === METHODS.options) return c.body(null, STATUS.noContent);
      return next();
    }

    c.header(CORS_HEADERS.allowOrigin, origin);
    c.header(CORS_HEADERS.allowCredentials, CORS.credentials);
    c.header(HEADERS.vary, HEADERS.origin, { append: true });
    c.header(CORS_HEADERS.exposeHeaders, exposedHeaders);

    if (c.req.method === METHODS.options) {
      c.header(CORS_HEADERS.allowMethods, CORS.methods);
      c.header(CORS_HEADERS.allowHeaders, allowedHeaders);
      c.header(CORS_HEADERS.maxAge, CORS.maxAge);
      return c.body(null, STATUS.noContent);
    }

    return next();
  };
}
