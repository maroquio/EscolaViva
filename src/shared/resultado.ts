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

/** Converte issues de ZodError em ErroDeAplicacao[] (usado por todos os casos de uso). */
export const errosDeSchema = (
  issues: { path: (string | number)[]; message: string; code: string }[],
): ErroDeAplicacao[] =>
  issues.map((problema) => {
    const campo = problema.path.join('.');
    const erro: ErroDeAplicacao = { codigo: problema.code, mensagem: problema.message };
    // Erro na raiz do schema não tem campo; omitir a chave é diferente de gravá-la como
    // undefined — a tela decide entre destacar um input e mostrar um aviso geral.
    return campo === '' ? erro : { ...erro, campo };
  });
