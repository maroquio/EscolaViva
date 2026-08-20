import type { Context, MiddlewareHandler } from 'hono';
import { ERROR_CODES, ERROR_MESSAGES, HTTP_LOG_EVENTS, STATUS } from '../constants';
import { RepeatedWrite } from '../db';
import { logger, redact } from '../log';
import type { ApplicationError } from '../result';
import { currentContext } from './correlation';
import { currentUserOrNull } from './session';

export class Unauthorized extends Error {}
export class NotFound extends Error {}
export class Forbidden extends Error {}
export class BusinessRuleViolation extends Error {}

export type ErrorStatus =
  | typeof STATUS.invalidShape
  | typeof STATUS.unauthenticated
  | typeof STATUS.forbidden
  | typeof STATUS.notFound
  | typeof STATUS.unsupportedMediaType
  | typeof STATUS.refused
  | typeof STATUS.internalFailure;

export const errorStatus = (error: unknown): ErrorStatus => {
  if (error instanceof Unauthorized) return STATUS.unauthenticated;
  if (error instanceof Forbidden) return STATUS.forbidden;
  if (error instanceof NotFound) return STATUS.notFound;
  if (error instanceof BusinessRuleViolation) return STATUS.refused;
  return STATUS.internalFailure;
};

const ERRORS_BY_STATUS: Record<ErrorStatus, ApplicationError> = {
  [STATUS.invalidShape]: {
    code: ERROR_CODES.invalidRequest,
    message: ERROR_MESSAGES[STATUS.invalidShape],
  },
  [STATUS.unauthenticated]: {
    code: ERROR_CODES.noSession,
    message: ERROR_MESSAGES[STATUS.unauthenticated],
  },
  [STATUS.forbidden]: {
    code: ERROR_CODES.forbidden,
    message: ERROR_MESSAGES[STATUS.forbidden],
  },
  [STATUS.notFound]: {
    code: ERROR_CODES.notFound,
    message: ERROR_MESSAGES[STATUS.notFound],
  },
  [STATUS.unsupportedMediaType]: {
    code: ERROR_CODES.unsupportedMediaType,
    message: ERROR_MESSAGES[STATUS.unsupportedMediaType],
  },
  [STATUS.refused]: {
    code: ERROR_CODES.businessRule,
    message: ERROR_MESSAGES[STATUS.refused],
  },
  [STATUS.internalFailure]: {
    code: ERROR_CODES.internalFailure,
    message: ERROR_MESSAGES[STATUS.internalFailure],
  },
};

export type ErrorBody = {
  readonly errors: readonly ApplicationError[];
  readonly correlationId: string;
};

export const errorBody = (errors: readonly ApplicationError[]): ErrorBody => ({
  errors,
  correlationId: currentContext()?.correlationId ?? '',
});

export const errorResponse = (c: Context, status: ErrorStatus): Response =>
  c.json(errorBody([ERRORS_BY_STATUS[status]]), status);

const logFailure = (c: Context, status: ErrorStatus, error: unknown): void => {
  const attempted = currentUserOrNull(c);
  const base = {
    status,
    method: c.req.method,
    route: c.req.path,
    ...(attempted === null ? {} : { user_id: attempted.id }),
    type: error instanceof Error ? error.constructor.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };
  const fields = redact(
    status === STATUS.internalFailure && error instanceof Error ? { ...base, stack: error.stack } : base,
  );
  if (status === STATUS.internalFailure) {
    logger.error(fields, HTTP_LOG_EVENTS.requestFailed);
    return;
  }
  logger.warn(fields, HTTP_LOG_EVENTS.requestRejected);
};

export const errorsMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof RepeatedWrite) return;
    const status = errorStatus(error);
    logFailure(c, status, error);
    return errorResponse(c, status);
  }
};
