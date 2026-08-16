import type { Context, MiddlewareHandler } from 'hono';
import { ENTRY_PATHS, INTERNAL_REASONS, METHODS } from '../constants';
import { logger, redact } from '../log';
import { Unauthorized, errorPage } from './errors';
import type { SessionRole, SessionUser } from './session';
import { currentUserOrNull } from './session';

export function hasRole(u: SessionUser, role: SessionRole): boolean {
  return u.papeis.some((roleAssignment) => roleAssignment.papel === role);
}

export function schoolsForRole(u: SessionUser, role: SessionRole): string[] {
  return u.papeis
    .filter((roleAssignment) => roleAssignment.papel === role)
    .map((roleAssignment) => roleAssignment.unidadeId);
}

const rejectAnonymous = (c: Context): Response => {
  if (c.req.method === METHODS.get) return c.redirect(ENTRY_PATHS.login, 303);
  throw new Unauthorized(INTERNAL_REASONS.requestWithoutSession);
};

export function requireLogin(): MiddlewareHandler {
  return async (c, next) => {
    if (currentUserOrNull(c) === null) return rejectAnonymous(c);
    await next();
  };
}

export function requireRole(...roles: SessionRole[]): MiddlewareHandler {
  return async (c, next) => {
    const user = currentUserOrNull(c);
    if (user === null) return rejectAnonymous(c);

    if (!roles.some((role) => hasRole(user, role))) {
      const fields = { rota: c.req.path, user_id: user.id, papeis_exigidos: roles };
      logger.warn(redact(fields), INTERNAL_REASONS.accessDeniedByRole);
      return c.html(errorPage(403), 403);
    }

    await next();
  };
}
