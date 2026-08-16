export const ALCANCES = ['unidade', 'selecionados'] as const;

export type Alcance = (typeof ALCANCES)[number];

export const ALCANCE = { unidade: 'unidade', selecionados: 'selecionados' } as const satisfies
  Record<string, Alcance>;

export const CAMPOS = {
  titulo: 'titulo',
  corpo: 'corpo',
  unidadeId: 'unidadeId',
  autorUsuarioId: 'autorUsuarioId',
  destinatarios: 'destinatarios',
  alcance: 'alcance',
} as const;

export const CODIGOS = {
  tituloInvalido: 'titulo_invalido',
  corpoInvalido: 'corpo_invalido',
  unidadeDesconhecida: 'unidade_desconhecida',
  autorDesconhecido: 'autor_desconhecido',
  semDestinatarios: 'sem_destinatarios',
} as const;

export const MENSAGENS = {
  tituloInvalido: (maximo: number): string => `Informe um título de 1 a ${maximo} caracteres.`,
  corpoInvalido: (maximo: number): string => `Informe um corpo de 1 a ${maximo} caracteres.`,
  unidadeDesconhecida: 'Unidade não encontrada nesta rede.',
  autorDesconhecido: 'Autor não encontrado nesta rede.',
  semDestinatarios: 'Não há responsável para receber este comunicado.',
} as const;

export const ERROS_INTERNOS = {
  autorForaDaRede: 'Comunicado com autor fora da rede',
  insercaoSemPublicadoEm: 'INSERT em announcement não devolveu published_at',
} as const;
