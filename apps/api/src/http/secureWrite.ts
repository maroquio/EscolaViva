import type { MiddlewareHandler } from 'hono';
import {
  APPLICATION_MARK,
  ERROR_CODES,
  ERROR_MESSAGES,
  HEADERS,
  INTERNAL_REASONS,
  METHODS,
  STATUS,
} from '../shared/constants';
import { errorBody } from '../shared/http';
import { logger, redact } from '../shared/log';
import type { ApplicationError } from '../shared/result';
import { API, SECURE_WRITE_MESSAGES } from './constants';

const WRITE_METHODS = new Set<string>([
  METHODS.post,
  METHODS.put,
  METHODS.patch,
  METHODS.delete,
]);

const WRITE_WITHOUT_MARK: ApplicationError = {
  code: ERROR_CODES.writeWithoutMark,
  message: SECURE_WRITE_MESSAGES.missingMark,
};

const UNSUPPORTED_TYPE: ApplicationError = {
  code: ERROR_CODES.unsupportedMediaType,
  message: ERROR_MESSAGES[STATUS.unsupportedMediaType],
};

export const secureWriteMiddleware: MiddlewareHandler = async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  if (c.req.header(HEADERS.requestedBy) !== APPLICATION_MARK) {
    logger.warn(
      redact({ route: c.req.path, method: c.req.method }),
      INTERNAL_REASONS.writeWithoutMark,
    );
    return c.json(errorBody([WRITE_WITHOUT_MARK]), STATUS.forbidden);
  }

  if (c.req.method === METHODS.delete) return next();

  if (!(c.req.header(HEADERS.contentType) ?? '').startsWith(API.mediaType)) {
    return c.json(errorBody([UNSUPPORTED_TYPE]), STATUS.unsupportedMediaType);
  }

  return next();
};
