import { Hono } from 'hono';
import { checkDatabase } from '../shared/db';
import type { Variables } from '../shared/http';
import { HEADERS, PROBE_TIMEOUT_MS } from '../shared/constants';
import { HEALTH_BODY, HEALTH_NO_CACHE, ROUTES } from './constants';

export const healthRoutes = new Hono<{ Variables: Variables }>();

healthRoutes.get(ROUTES.public.readiness.pattern, async (c) => {
  const databaseResponds = await checkDatabase(PROBE_TIMEOUT_MS);
  c.header(HEADERS.cacheControl, HEALTH_NO_CACHE);
  if (databaseResponds) return c.json(HEALTH_BODY.ok, 200);
  return c.json(HEALTH_BODY.degraded, 503);
});

healthRoutes.get(ROUTES.public.liveness.pattern, (c) => {
  c.header(HEADERS.cacheControl, HEALTH_NO_CACHE);
  return c.json(HEALTH_BODY.alive, 200);
});
