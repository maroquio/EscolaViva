import type { MiddlewareHandler } from 'hono';
import { INTERNAL_REASONS, STATUS } from '../constants';
import { logger, redact } from '../log';
import { Unauthorized, errorResponse } from './errors';
import { currentUserOrNull, type SessionRole, type SessionUser } from './session';

export function hasRole(u: SessionUser, role: SessionRole): boolean {
  return u.roles.some((roleAssignment) => roleAssignment.role === role);
}

export function schoolsForRole(u: SessionUser, role: SessionRole): string[] {
  return u.roles
    .filter((roleAssignment) => roleAssignment.role === role)
    .map((roleAssignment) => roleAssignment.schoolId);
}

const rejectAnonymous = (): never => {
  throw new Unauthorized(INTERNAL_REASONS.requestWithoutSession);
};

export function requireLogin(): MiddlewareHandler {
  return async (c, next) => {
    if (currentUserOrNull(c) === null) return rejectAnonymous();
    await next();
  };
}

export function requireRole(...roles: SessionRole[]): MiddlewareHandler {
  return async (c, next) => {
    const user = currentUserOrNull(c);
    if (user === null) return rejectAnonymous();

    if (!roles.some((role) => hasRole(user, role))) {
      const fields = { route: c.req.path, user_id: user.id, required_roles: roles };
      logger.warn(redact(fields), INTERNAL_REASONS.accessDeniedByRole);
      return errorResponse(c, STATUS.forbidden);
    }

    await next();
  };
}
