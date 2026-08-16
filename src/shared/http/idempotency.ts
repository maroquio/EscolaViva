import type { MiddlewareHandler } from 'hono';
import {
  CONTEXT_VARIABLES,
  ENTRY_PATHS,
  FORMATS,
  HEADERS,
  INTERNAL_REASONS,
  KEY_FIELD,
  METHODS,
  RESPONSE_HASH,
} from '../constants';
import type { Connection } from '../db';
import { writer } from '../db';
import { logger, redact } from '../log';
import { errorPage } from './errors';
import { currentUserOrNull } from './session';

export { KEY_FIELD };

export type FormBody = Record<string, string | File | (string | File)[]>;

const releaseKey = async (sql: Connection, key: string): Promise<void> => {
  await sql`DELETE FROM idempotent_request WHERE idempotency_key = ${key}`;
};

const isRedirect = (status: number): boolean => status >= 300 && status < 400;

export const idempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== METHODS.post) return next();

  const body = await c.req.parseBody();
  c.set(CONTEXT_VARIABLES.body, body);

  const user = currentUserOrNull(c);
  if (user === null) return next();

  const key = body[KEY_FIELD];
  if (typeof key !== 'string' || !FORMATS.idempotencyKey.test(key)) {
    const fields = { route: c.req.path, user_id: user.id };
    logger.warn(redact(fields), INTERNAL_REASONS.writeWithoutKey);
    return c.html(errorPage(400), 400);
  }

  const sql = writer();
  const inserted: { idempotency_key: string }[] = await sql`
    INSERT INTO idempotent_request (idempotency_key, route, user_id, response_hash, response_location)
    VALUES (${key}, ${c.req.path}, ${user.id}, '', '')
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;

  if (inserted.length === 0) {
    const saved: { response_location: string }[] = await sql`
      SELECT response_location FROM idempotent_request WHERE idempotency_key = ${key}`;
    const target = saved[0]?.response_location ?? '';
    return c.redirect(target === '' ? ENTRY_PATHS.dashboard : target, 303);
  }

  try {
    await next();
  } catch (error) {
    await releaseKey(sql, key);
    throw error;
  }

  const location = c.res.headers.get(HEADERS.location);
  if (location === null || !isRedirect(c.res.status)) {
    await releaseKey(sql, key);
    return;
  }

  const hash = new Bun.CryptoHasher(RESPONSE_HASH.algorithm)
    .update(location)
    .digest(RESPONSE_HASH.encoding);
  await sql`
    UPDATE idempotent_request
       SET response_location = ${location}, response_hash = ${hash}
     WHERE idempotency_key = ${key}`;
};
