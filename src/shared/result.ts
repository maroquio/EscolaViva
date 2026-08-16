const FIELD_PATH_SEPARATOR = '.';

export type ApplicationError = { field?: string; code: string; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; errors: ApplicationError[] };

export const success = <T>(value: T): Result<T> => ({ ok: true, value });

export const failure = <T = never>(...errors: ApplicationError[]): Result<T> => ({
  ok: false,
  errors,
});

export const fieldFailure = <T = never>(
  field: string,
  code: string,
  message: string,
): Result<T> => ({ ok: false, errors: [{ field, code, message }] });

export const schemaErrors = (
  issues: { path: (string | number)[]; message: string; code: string }[],
  fieldNames: Readonly<Record<string, string>> = {},
): ApplicationError[] =>
  issues.map((issue) => {
    const path = issue.path.join(FIELD_PATH_SEPARATOR);
    const field = fieldNames[path] ?? path;
    const error: ApplicationError = { code: issue.code, message: issue.message };
    return field === '' ? error : { ...error, field };
  });
