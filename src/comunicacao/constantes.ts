/**
 * As constantes do módulo de comunicação: o que a escola diz ao responsável e como a leitura é
 * medida.
 *
 * Duas separações que este arquivo preserva:
 *
 *   - `MENSAGENS.unidadeDesconhecida` é "Unidade não encontrada nesta rede." — o MESMO texto que o
 *     acadêmico usa ao cadastrar turma, com código diferente (`unidade_desconhecida` aqui,
 *     `unidade_nao_encontrada` lá) e dono diferente. A regra `sem-atalho-entre-modulos` já
 *     impediria o atalho; o texto igual é coincidência de português, não política única.
 *   - `CAMPOS.titulo` e `CAMPOS.corpo` são chaves de formulário deste módulo. Não são o `'titulo'`
 *     da lista de redação de log (`shared/log/redacao.ts`) nem o `'corpo'` da variável de contexto
 *     do Hono (`shared/http/idempotencia.ts`), que por acaso se escrevem igual.
 *
 * Os limites de tamanho do comunicado continuam em `dominio/comunicado.ts`, onde são fonte da
 * regra; o `index.ts` os reexporta. Este arquivo não importa nada em tempo de execução.
 */

/* --- Alcance ---------------------------------------------------------------- */

/**
 * Para quem o comunicado vai: a unidade inteira, ou os responsáveis marcados um a um.
 *
 * É vocabulário de domínio e não de tela — os mesmos dois valores estão nos `radio` do formulário
 * e no ramo que decide a consulta de destinatários. Escrever um deles errado no `.eta` faz o envio
 * cair silenciosamente no outro alcance, e um comunicado dirigido a três pessoas chega à unidade
 * inteira sem nenhum erro em lugar nenhum.
 */
export const ALCANCES = ['unidade', 'selecionados'] as const;

export type Alcance = (typeof ALCANCES)[number];

export const ALCANCE = { unidade: 'unidade', selecionados: 'selecionados' } as const satisfies
  Record<string, Alcance>;

/* --- Nomes de campo --------------------------------------------------------- */

export const CAMPOS = {
  titulo: 'titulo',
  corpo: 'corpo',
  unidadeId: 'unidadeId',
  autorUsuarioId: 'autorUsuarioId',
  destinatarios: 'destinatarios',
  alcance: 'alcance',
} as const;

/* --- Códigos de erro -------------------------------------------------------- */

export const CODIGOS = {
  tituloInvalido: 'titulo_invalido',
  corpoInvalido: 'corpo_invalido',
  unidadeDesconhecida: 'unidade_desconhecida',
  autorDesconhecido: 'autor_desconhecido',
  semDestinatarios: 'sem_destinatarios',
} as const;

/* --- Mensagens -------------------------------------------------------------- */

export const MENSAGENS = {
  tituloInvalido: (maximo: number): string => `Informe um título de 1 a ${maximo} caracteres.`,
  corpoInvalido: (maximo: number): string => `Informe um corpo de 1 a ${maximo} caracteres.`,
  unidadeDesconhecida: 'Unidade não encontrada nesta rede.',
  autorDesconhecido: 'Autor não encontrado nesta rede.',
  semDestinatarios: 'Não há responsável para receber este comunicado.',
} as const;

/* --- Erros internos --------------------------------------------------------- */

/** `throw` de invariante quebrada: dado inconsistente na leitura, não erro de quem está usando. */
export const ERROS_INTERNOS = {
  autorForaDaRede: 'Comunicado com autor fora da rede',
  insercaoSemPublicadoEm: 'INSERT em comunicado não devolveu publicado_em',
} as const;
