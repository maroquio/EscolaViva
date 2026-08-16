export const AUDIENCES = ['unidade', 'selecionados'] as const;

export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE = { school: 'unidade', selected: 'selecionados' } as const satisfies
  Record<string, Audience>;

export const FIELDS = {
  title: 'title',
  body: 'body',
  schoolId: 'schoolId',
  authorUserId: 'authorUserId',
  recipients: 'recipients',
  audience: 'audience',
} as const;

export const CODES = {
  invalidTitle: 'titulo_invalido',
  invalidBody: 'corpo_invalido',
  unknownSchool: 'unidade_desconhecida',
  unknownAuthor: 'autor_desconhecido',
  noRecipients: 'sem_destinatarios',
} as const;

export const MESSAGES = {
  invalidTitle: (maximum: number): string => `Informe um título de 1 a ${maximum} caracteres.`,
  invalidBody: (maximum: number): string => `Informe um corpo de 1 a ${maximum} caracteres.`,
  unknownSchool: 'Unidade não encontrada nesta rede.',
  unknownAuthor: 'Autor não encontrado nesta rede.',
  noRecipients: 'Não há responsável para receber este comunicado.',
} as const;

export const INTERNAL_ERRORS = {
  authorOutsideNetwork: 'Comunicado com autor fora da rede',
  insertWithoutPublishedAt: 'INSERT em announcement não devolveu published_at',
} as const;
