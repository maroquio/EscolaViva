import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identity } from '../../identity';
import { config } from '../../shared/config';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import {
  clientIp,
  closeSession,
  currentSessionId,
  currentUser,
  currentUserOrNull,
  errorBody,
  openSession,
  requireLogin,
  type Variables,
} from '../../shared/http';
import { logger } from '../../shared/log';
import { API_ROUTES } from '../constants';
import { LOG_EVENTS } from './constants';
import { userAsJson } from '../presenters/session';
import { parse } from '../schemas/parse';
import { signInSchema } from '../schemas/session';

export const sessionRoutes = new Hono<{ Variables: Variables }>();

const remoteAddress = (c: Context): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
};

sessionRoutes.post(API_ROUTES.root, async (c) => {
  if (currentUserOrNull(c) !== null) {
    return c.json({ user: userAsJson(currentUser(c)) }, STATUS.ok);
  }

  const input = parse(signInSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const { networkSlug, cpf, password } = input.value;
  const ip = clientIp(c.req.raw, remoteAddress(c), config.trustedProxies);
  const result = await identity.authenticate({
    networkSlug,
    loginIdentifier: cpf,
    password,
    ip,
  });

  if (!result.ok) {
    logger.warn(
      { network_slug: networkSlug, result: LOG_EVENTS.rejected, ip },
      LOG_EVENTS.signInAttempt,
    );
    return c.json(errorBody(result.errors), STATUS.refused);
  }

  await openSession(c, result.value.sessionId);
  logger.info(
    { network_slug: networkSlug, result: LOG_EVENTS.success, ip },
    LOG_EVENTS.signInAttempt,
  );
  return c.json({ user: userAsJson(result.value.user) }, STATUS.created);
});

sessionRoutes.get(API_ROUTES.root, requireLogin(), (c) => c.json({ user: userAsJson(currentUser(c)) }, STATUS.ok));

sessionRoutes.delete(API_ROUTES.root, async (c) => {
  const sessionId = currentSessionId(c);
  if (sessionId !== null) await identity.endSession(sessionId);
  await closeSession(c);
  return c.body(null, STATUS.noContent);
});
