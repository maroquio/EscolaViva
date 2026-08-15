const SEPARADOR_DE_CAMINHO_DE_CAMPO = '.';

export type ErroDeAplicacao = { campo?: string; codigo: string; mensagem: string };

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erros: ErroDeAplicacao[] };

export const sucesso = <T>(valor: T): Resultado<T> => ({ ok: true, valor });

export const falha = <T = never>(...erros: ErroDeAplicacao[]): Resultado<T> => ({
  ok: false,
  erros,
});

export const falhaDeCampo = <T = never>(
  campo: string,
  codigo: string,
  mensagem: string,
): Resultado<T> => ({ ok: false, erros: [{ campo, codigo, mensagem }] });

export const errosDeSchema = (
  issues: { path: (string | number)[]; message: string; code: string }[],
): ErroDeAplicacao[] =>
  issues.map((problema) => {
    const campo = problema.path.join(SEPARADOR_DE_CAMINHO_DE_CAMPO);
    const erro: ErroDeAplicacao = { codigo: problema.code, mensagem: problema.message };
    return campo === '' ? erro : { ...erro, campo };
  });
