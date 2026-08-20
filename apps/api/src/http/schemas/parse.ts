import type { ZodType } from 'zod';
import { ERROR_CODES } from '../../shared/constants';
import { failure, schemaErrors, success, type Result } from '../../shared/result';
import { VALIDATION_MESSAGES, ZOD_DEFAULT_PREFIXES } from './constants';

const wroteItsOwn = (message: string): boolean =>
  !ZOD_DEFAULT_PREFIXES.some((prefix) => message.startsWith(prefix));

export function parse<T>(schema: ZodType<T>, body: unknown): Result<T> {
  const analysis = schema.safeParse(body);
  if (analysis.success) return success(analysis.data);
  return failure<T>(
    ...schemaErrors(analysis.error.issues).map((problem) =>
      wroteItsOwn(problem.message)
        ? problem
        : {
            ...problem,
            code: ERROR_CODES.invalidRequest,
            message: VALIDATION_MESSAGES.invalidShape,
          },
    ),
  );
}
