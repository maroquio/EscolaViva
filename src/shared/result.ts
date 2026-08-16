const FIELD_PATH_SEPARATOR = '.';

export type ApplicationError = { campo?: string; codigo: string; mensagem: string };

export type Result<T> = { ok: true; valor: T } | { ok: false; erros: ApplicationError[] };

export const success = <T>(valor: T): Result<T> => ({ ok: true, valor });

export const failure = <T = never>(...erros: ApplicationError[]): Result<T> => ({
  ok: false,
  erros,
});

export const fieldFailure = <T = never>(
  campo: string,
  codigo: string,
  mensagem: string,
): Result<T> => ({ ok: false, erros: [{ campo, codigo, mensagem }] });

export const schemaErrors = (
  issues: { path: (string | number)[]; message: string; code: string }[],
): ApplicationError[] =>
  issues.map((issue) => {
    const campo = issue.path.join(FIELD_PATH_SEPARATOR);
    const error: ApplicationError = { codigo: issue.code, mensagem: issue.message };
    return campo === '' ? error : { ...error, campo };
  });
