export type ApplicationError = {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
};

export type ErrorBody = {
  readonly errors: readonly ApplicationError[];
  readonly correlationId: string;
};
