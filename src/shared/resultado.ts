/**
 * A notação que achata o caminho de um problema de schema em UM nome de campo.
 *
 * O `path` do Zod é uma lista de segmentos (`['notas', 0, 'valor']`); o formulário conhece o campo
 * por um nome só, e é esse nome que `it.erroDe(campo)` procura para decidir qual `<input>` fica
 * destacado. O ponto é a ponte entre os dois, e precisa ser o mesmo caractere aqui e no `name=` do
 * `.eta` — trocá-lo de um lado só não quebra nada visivelmente: a mensagem simplesmente para de
 * aparecer, e o usuário vê um formulário que recusa o envio sem dizer onde está o erro.
 *
 * Fica local a este arquivo, e não em `shared/constantes.ts`, porque é gramática de um único
 * tradutor — não há segundo ponto no código que costure ou desmonte esse caminho.
 */
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

/** Converte issues de ZodError em ErroDeAplicacao[] (usado por todos os casos de uso). */
export const errosDeSchema = (
  issues: { path: (string | number)[]; message: string; code: string }[],
): ErroDeAplicacao[] =>
  issues.map((problema) => {
    const campo = problema.path.join(SEPARADOR_DE_CAMINHO_DE_CAMPO);
    const erro: ErroDeAplicacao = { codigo: problema.code, mensagem: problema.message };
    // Erro na raiz do schema não tem campo; omitir a chave é diferente de gravá-la como
    // undefined — a tela decide entre destacar um input e mostrar um aviso geral.
    return campo === '' ? erro : { ...erro, campo };
  });
