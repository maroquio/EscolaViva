import type { JsonBody } from './idempotency';
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

export { jsonIdempotencyMiddleware } from './idempotency';
export type { JsonBody } from './idempotency';

export {
  BusinessRuleViolation,
  Forbidden,
  NotFound,
  Unauthorized,
  errorBody,
  errorResponse,
  errorStatus,
  errorsMiddleware,
} from './errors';
export type { ErrorBody, ErrorStatus } from './errors';

export { isUuid } from '../identifier';

export type Variables = {
  correlationId: string;
  sessionId: string | null;
  user: SessionUser | null;
  jsonBody: JsonBody;
  applicationDocument: boolean;
  arrivedWithASession: boolean;
};
