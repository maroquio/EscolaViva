import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { config } from '../config';
import { CONTEXT_VARIABLES, COOKIE, INTERNAL_REASONS, TIME } from '../constants';
import { currentContext, withContext } from './correlation';
import { Unauthorized } from './errors';

export type SessionRole = 'network_admin' | 'registrar' | 'teacher' | 'guardian';

export type SessionUser = {
  id: string;
  redeId: string;
  redeNome: string;
  redeSlug: string;
  nome: string;
  email: string;
  papeis: { unidadeId: string; unidadeNome: string; papel: SessionRole }[];
  responsavelId: string | null;
};

export const SESSION_COOKIE = COOKIE.session;

export type UserLoader = (sessionId: string) => Promise<SessionUser | null>;

const cookieOptions = () => ({
  path: COOKIE.path,
  httpOnly: true,
  secure: config.secureCookie,
  sameSite: COOKIE.sameSite,
  maxAge: config.sessionDurationHours * TIME.secondsPerHour,
});

const store = (c: Context, sessionId: string | null, user: SessionUser | null): void => {
  c.set(CONTEXT_VARIABLES.sessionId, sessionId);
  c.set(CONTEXT_VARIABLES.user, user);
};

const sessionIdFromCookie = async (c: Context): Promise<string | null> => {
  const value = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE);
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export function createSessionMiddleware(load: UserLoader): MiddlewareHandler {
  return async (c, next) => {
    const sessionId = await sessionIdFromCookie(c);
    if (sessionId === null) {
      store(c, null, null);
      return next();
    }
    const user = await load(sessionId);
    if (user === null) {
      await closeSession(c);
      return next();
    }
    store(c, sessionId, user);
    const context = currentContext();
    if (context === undefined) return next();
    return withContext({ ...context, userId: user.id, networkId: user.redeId }, next);
  };
}

export async function openSession(c: Context, sessionId: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, sessionId, config.sessionSecret, cookieOptions());
}

export async function closeSession(c: Context): Promise<void> {
  deleteCookie(c, SESSION_COOKIE, { path: COOKIE.path, secure: config.secureCookie });
  store(c, null, null);
}

export function currentSessionId(c: Context): string | null {
  const sessionId: string | null | undefined = c.get(CONTEXT_VARIABLES.sessionId);
  return sessionId ?? null;
}

export function currentUserOrNull(c: Context): SessionUser | null {
  const user: SessionUser | null | undefined = c.get(CONTEXT_VARIABLES.user);
  return user ?? null;
}

export function currentUser(c: Context): SessionUser {
  const user = currentUserOrNull(c);
  if (user === null) throw new Unauthorized(INTERNAL_REASONS.requestWithoutSession);
  return user;
}
