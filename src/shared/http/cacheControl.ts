import type { MiddlewareHandler } from 'hono';
import { ASSETS, CACHE, HEADERS } from '../constants';
import { currentUserOrNull } from './session';

export const cacheControlMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  if (c.req.path.startsWith(ASSETS.urlPrefix)) {
    c.header(HEADERS.cacheControl, CACHE.asset);
    return;
  }

  if (currentUserOrNull(c) !== null) {
    c.header(HEADERS.cacheControl, CACHE.authenticated);
    c.header(HEADERS.vary, HEADERS.cookie);
    return;
  }

  c.header(HEADERS.cacheControl, CACHE.anonymous);
};
