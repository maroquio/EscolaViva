import type { MiddlewareHandler } from 'hono';
import {
  CONTEXT_VARIABLES,
  ERROR_CODES,
  FORMATS,
  HEADERS,
  INTERNAL_REASONS,
  METHODS,
  STATUS,
  isClientOrServerError,
} from '../constants';
import { RepeatedWrite, pendingWrite, readerFresh, withPendingWrite, writer } from '../db';
import { logger, redact } from '../log';
import type { ApplicationError } from '../result';
import { IDEMPOTENCY_MESSAGES, RESPONSE_HASH } from './constants';
import { errorBody } from './errors';
import { currentUserOrNull } from './session';

export type JsonBody = unknown;

const MISSING_KEY: ApplicationError = {
  code: ERROR_CODES.missingIdempotencyKey,
  message: IDEMPOTENCY_MESSAGES.missingKey,
};

const STILL_FINISHING: ApplicationError = {
  code: ERROR_CODES.idempotencyKeyStillFinishing,
  message: IDEMPOTENCY_MESSAGES.stillFinishing,
};

const KEY_OF_ANOTHER_REQUEST: ApplicationError = {
  code: ERROR_CODES.idempotencyKeyOfAnotherRequest,
  message: IDEMPOTENCY_MESSAGES.keyOfAnotherRequest,
};

const MALFORMED_BODY: ApplicationError = {
  code: ERROR_CODES.malformedBody,
  message: IDEMPOTENCY_MESSAGES.malformedBody,
};

const BODY_METHODS = new Set<string>([METHODS.post, METHODS.put, METHODS.patch]);

export const jsonIdempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  if (!BODY_METHODS.has(c.req.method)) return next();

  const raw = await c.req.text();
  let body: JsonBody;
  if (raw === '') {
    body = undefined;
  } else {
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json(errorBody([MALFORMED_BODY]), STATUS.invalidShape);
    }
  }
  c.set(CONTEXT_VARIABLES.jsonBody, body);

  if (c.req.method !== METHODS.post) return next();

  const user = currentUserOrNull(c);
  if (user === null) return next();

  const key = c.req.header(HEADERS.idempotencyKey);
  if (key === undefined || !FORMATS.uuid.test(key)) {
    logger.warn(redact({ route: c.req.path, user_id: user.id }), INTERNAL_REASONS.writeWithoutKey);
    return c.json(errorBody([MISSING_KEY]), STATUS.invalidShape);
  }

  const pending = pendingWrite(key, c.req.path, user.id);
  try {
    await withPendingWrite(pending, next);
  } catch (error) {
    if (!(error instanceof RepeatedWrite)) throw error;
  }

  if (pending.claimedByAnEarlierRequest) {
    const saved: { response_location: string; response_hash: string }[] = await readerFresh()`
      SELECT response_location, response_hash
        FROM idempotent_request
       WHERE idempotency_key = ${key} AND user_id = ${user.id} AND route = ${c.req.path}`;
    const mine = saved[0];
    if (mine === undefined) {
      c.res = c.json(errorBody([KEY_OF_ANOTHER_REQUEST]), STATUS.conflict);
      return;
    }
    if (mine.response_hash === '') {
      c.res = c.json(errorBody([STILL_FINISHING]), STATUS.conflict);
      return;
    }
    c.res = c.json({ repeated: true, location: mine.response_location }, STATUS.ok);
    return;
  }

  if (isClientOrServerError(c.res.status)) return;

  const location = c.res.headers.get(HEADERS.location) ?? '';
  const hash = new Bun.CryptoHasher(RESPONSE_HASH.algorithm)
    .update(location)
    .digest(RESPONSE_HASH.encoding);
  try {
    await writer()`
      UPDATE idempotent_request
         SET response_location = ${location}, response_hash = ${hash}
       WHERE idempotency_key = ${key}`;
  } catch (error) {
    logger.warn(
      redact({ route: c.req.path, user_id: user.id, reason: String(error) }),
      INTERNAL_REASONS.replayDestinationNotStored,
    );
  }
};
