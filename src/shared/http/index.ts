import type { FormBody } from './idempotency';
import type { SessionUser } from './session';

export { correlationMiddleware, currentContext, withContext } from './correlation';
export type { RequestContext } from './correlation';

export { clientIp } from './ip';

export { cacheControlMiddleware } from './cacheControl';

export {
  SESSION_COOKIE,
  closeSession,
  createSessionMiddleware,
  currentSessionId,
  currentUser,
  currentUserOrNull,
  openSession,
} from './session';
export type { SessionRole, SessionUser, UserLoader } from './session';

export { hasRole, requireLogin, requireRole, schoolsForRole } from './authorization';

export { currentNetwork } from './tenant';

export { KEY_FIELD, idempotencyMiddleware } from './idempotency';
export type { FormBody } from './idempotency';

export {
  BusinessRuleViolation,
  Forbidden,
  NotFound,
  Unauthorized,
  errorsMiddleware,
  registerErrorRenderer,
} from './errors';
export type { ErrorRenderer, ErrorStatus } from './errors';

export { isUuid } from './identifier';

export type Variables = {
  correlationId: string;
  sessionId: string | null;
  user: SessionUser | null;
  body: FormBody;
};
