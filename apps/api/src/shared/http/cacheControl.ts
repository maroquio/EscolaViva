import type { Context, MiddlewareHandler } from 'hono';
import { ASSETS, CACHE, CONTEXT_VARIABLES, HEADERS, STATUS } from '../constants';
import { currentUserOrNull } from './session';

const IMMUTABLE_PREFIXES: readonly string[] = [ASSETS.buildUrlPrefix];

const isApplicationDocument = (c: Context): boolean =>
  c.get(CONTEXT_VARIABLES.applicationDocument) === true;

export const cacheControlMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  const underAnImmutablePrefix = IMMUTABLE_PREFIXES.some((prefix) =>
    c.req.path.startsWith(prefix),
  );
  if (underAnImmutablePrefix && c.res.status === STATUS.ok) {
    c.header(HEADERS.cacheControl, CACHE.asset);
    return;
  }
  if (underAnImmutablePrefix) {
    c.header(HEADERS.cacheControl, CACHE.anonymous);
    return;
  }

  if (isApplicationDocument(c)) {
    c.header(HEADERS.cacheControl, CACHE.anonymous);
    return;
  }

  if (currentUserOrNull(c) !== null || c.get(CONTEXT_VARIABLES.arrivedWithASession) === true) {
    c.header(HEADERS.cacheControl, CACHE.authenticated);
    c.header(HEADERS.vary, HEADERS.cookie, { append: true });
    return;
  }

  c.header(HEADERS.cacheControl, CACHE.anonymous);
};
