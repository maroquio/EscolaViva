import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identity } from '../../identity';
import { config } from '../../shared/config';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import {
  clientIp,
  closeSession,
  currentSessionId,
  currentUserOrNull,
  openSession,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { logger } from '../../shared/log';
import {
  FIELDS,
  INITIAL_VALUES,
  LOG_EVENTS,
  NOTICES,
  PARAMS,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { render } from '../render';

const TARGET_AFTER_SIGN_IN = ROUTES.public.dashboard();

const TARGET_AFTER_SIGN_OUT = `${ROUTES.public.login()}?${PARAMS.ok}=${encodeURIComponent(NOTICES.sessionEnded)}`;

export const loginRoutes = new Hono<{ Variables: Variables }>();

const text = (body: FormBody, field: string): string => {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : '';
};

const typedPassword = (body: FormBody): string => {
  const value = body[FIELDS.login.password];
  return typeof value === 'string' ? value : '';
};

const remoteAddress = (c: Context): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
};

const signInScreen = (c: Context, data: Record<string, unknown> = {}): Response =>
  render(c, TEMPLATES.login, {
    title: TITLES.login,
    values: INITIAL_VALUES.login,
    errors: [],
    ...data,
  });

loginRoutes.get(ROUTES.public.login.pattern, (c) => {
  if (currentUserOrNull(c) !== null) return c.redirect(TARGET_AFTER_SIGN_IN, 303);
  return signInScreen(c);
});

loginRoutes.post(ROUTES.public.login.pattern, async (c) => {
  if (currentUserOrNull(c) !== null) return c.redirect(TARGET_AFTER_SIGN_IN, 303);

  const body = c.get(CONTEXT_VARIABLES.body);
  const networkSlug = text(body, FIELDS.login.networkSlug);
  const cpf = text(body, FIELDS.login.cpf);
  const ip = clientIp(c.req.raw, remoteAddress(c), config.trustedProxies);

  const result = await identity.authenticate({
    networkSlug,
    loginIdentifier: cpf,
    password: typedPassword(body),
    ip,
  });

  if (!result.ok) {
    logger.warn(
      { network_slug: networkSlug, result: LOG_EVENTS.rejected, ip },
      LOG_EVENTS.signInAttempt,
    );
    return signInScreen(c, { values: { networkSlug, cpf }, errors: result.erros });
  }

  await openSession(c, result.valor.sessionId);
  logger.info(
    { network_slug: networkSlug, result: LOG_EVENTS.success, ip },
    LOG_EVENTS.signInAttempt,
  );
  return c.redirect(TARGET_AFTER_SIGN_IN, 303);
});

loginRoutes.post(ROUTES.public.logout.pattern, async (c) => {
  const sessionId = currentSessionId(c);
  if (sessionId !== null) await identity.endSession(sessionId);
  await closeSession(c);
  return c.redirect(TARGET_AFTER_SIGN_OUT, 303);
});
