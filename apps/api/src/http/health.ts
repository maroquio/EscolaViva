import { Hono } from 'hono';
import { checkDatabase } from '../shared/db';
import type { Variables } from '../shared/http';
import { HEADERS, HEALTH_PATHS, STATUS } from '../shared/constants';
import { HEALTH_BODY, HEALTH_NO_CACHE, PROBE_TIMEOUT_MS } from './constants';

export const healthRoutes = new Hono<{ Variables: Variables }>();

healthRoutes.get(HEALTH_PATHS.readiness, async (c) => {
  const databaseResponds = await checkDatabase(PROBE_TIMEOUT_MS);
  c.header(HEADERS.cacheControl, HEALTH_NO_CACHE);
  if (databaseResponds) return c.json(HEALTH_BODY.ok, STATUS.ok);
  return c.json(HEALTH_BODY.degraded, STATUS.unavailable);
});

healthRoutes.get(HEALTH_PATHS.liveness, (c) => {
  c.header(HEADERS.cacheControl, HEALTH_NO_CACHE);
  return c.json(HEALTH_BODY.alive, STATUS.ok);
});
