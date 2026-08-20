import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApplicationError } from '@escolaviva/contracts/errors';
import {
  NOT_FOUND_STATUS,
  SERVER_REFUSAL,
  UNREACHABLE_SERVER,
  UNREACHABLE_SERVER_WITH_RETRY,
  WHOLE_FORM,
  askingForHelp,
  refusedWithoutDetail,
} from './constants';

const API_ERROR_NAME = 'ApiError';
const WARNINGS_JOINER = ' ';
const UNACTIONABLE_BY_EDITING_THE_FORM_FROM = 500;

const withCode = (message: string, correlationId: string): string =>
  `${message} ${askingForHelp(correlationId)}`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ApplicationError[],
    readonly correlationId: string,
  ) {
    super(errors[0]?.message ?? UNREACHABLE_SERVER);
    this.name = API_ERROR_NAME;
  }

  messageWithNoField(): string | null {
    return this.errors.find((problem) => problem.field === undefined)?.message ?? null;
  }
}

export const isNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === NOT_FOUND_STATUS;

type ProblemWithAnInput = ApplicationError & { readonly field: string };

const belongsToAnInputThisFormHas = (
  problem: ApplicationError,
  known: readonly string[],
): problem is ProblemWithAnInput =>
  problem.field !== undefined && known.includes(problem.field);

export function applyErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  warn: (message: string) => void,
  known: readonly string[],
): void {
  if (!(error instanceof ApiError)) {
    warn(UNREACHABLE_SERVER_WITH_RETRY);
    return;
  }

  if (error.errors.length === 0) {
    warn(withCode(refusedWithoutDetail(error.status), error.correlationId));
    return;
  }

  const withoutAnInput: string[] = [];
  for (const problem of error.errors) {
    if (belongsToAnInputThisFormHas(problem, known)) {
      setError(problem.field as Path<T>, { type: SERVER_REFUSAL, message: problem.message });
      continue;
    }
    withoutAnInput.push(problem.message);
  }

  if (withoutAnInput.length === 0) return;

  const everythingWithoutAnInput = withoutAnInput.join(WARNINGS_JOINER);
  warn(
    error.status >= UNACTIONABLE_BY_EDITING_THE_FORM_FROM
      ? withCode(everythingWithoutAnInput, error.correlationId)
      : everythingWithoutAnInput,
  );
}

export function applyRefusal<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  known: readonly string[],
): void {
  applyErrors(
    error,
    setError,
    (message) => setError(WHOLE_FORM, { type: SERVER_REFUSAL, message }),
    known,
  );
}
