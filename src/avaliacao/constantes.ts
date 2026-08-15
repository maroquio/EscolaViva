export const LIMITES = {
  nota: { minimo: 0, maximo: 10 },
  caracteresDaJustificativa: 500,
} as const;

export const ARITMETICA = {
  centesimos: 100,
  percentual: 100,
  toleranciaDeRepresentacao: 1e-6,
} as const;

export const APROVACAO = {
  mediaMinimaEmCentesimos: 600,
  frequenciaMinimaEmCentesimos: 7500,
} as const;

export const MEIA_NOITE_UTC = 'T00:00:00Z';

export const MEIO_DIA_UTC = 'T12:00:00Z';

export const CAMPOS = {
  turmaId: 'turmaId',
  turmaDisciplinaId: 'turmaDisciplinaId',
  bimestre: 'bimestre',
  data: 'data',
  notas: 'notas',
  linhas: 'linhas',
} as const;

export const CODIGOS = {
  naoEncontrada: 'nao_encontrada',
  turmaDisciplinaNaoEncontrada: 'nao_encontrada',
  anoLetivoAusente: 'ano_letivo_ausente',
  dataForaDoAnoLetivo: 'data_fora_do_ano_letivo',
  bimestreFechado: 'bimestre_fechado',
  jaFechado: 'ja_fechado',
  semDisciplina: 'sem_disciplina',
  semMatriculaAtiva: 'sem_matricula_ativa',
  fechamentoIncompleto: 'fechamento_incompleto',

  notas: {
    matriculaForaDaTurma: 'matricula_fora_da_turma',
    matriculaRepetida: 'matricula_repetida',
  },
  chamada: {
    matriculaForaDaTurma: 'matricula_fora_da_turma',
    matriculaRepetida: 'matricula_repetida',
  },
} as const;

export const MENSAGENS = {
  bimestreInvalido: 'O bimestre precisa ser 1, 2, 3 ou 4.',
  notaForaDaEscala: 'A nota precisa ficar entre 0 e 10.',
  loteDeNotasVazio: 'Nenhuma nota foi enviada.',
  turmaNaoEncontrada: 'Turma não encontrada nesta rede.',
  turmaDisciplinaNaoEncontrada: 'Disciplina da turma não encontrada nesta rede.',
  bimestreFechadoParaLancamento:
    'O bimestre já foi fechado para esta turma; as notas não podem mais ser alteradas.',

  notas: {
    matriculaForaDaTurma: 'Há aluno sem matrícula ativa nesta turma no lançamento.',
    matriculaRepetida: 'O mesmo aluno aparece duas vezes.',
  },
  chamada: {
    dataInvalida: 'Informe uma data válida no formato AAAA-MM-DD.',
    justificativaLonga: 'A justificativa é longa demais.',
    loteVazio: 'Nenhuma linha de chamada foi enviada.',
    anoLetivoAusente: 'A turma não tem ano letivo definido.',
    dataForaDoAnoLetivo: (inicio: string, fim: string): string =>
      `A chamada precisa cair entre ${inicio} e ${fim}.`,
    matriculaForaDaTurma: 'Há aluno sem matrícula ativa nesta turma na chamada.',
    matriculaRepetida: 'O mesmo aluno aparece duas vezes.',
  },
  fechamento: {
    semDisciplina: 'A turma não tem disciplina alocada; não há bimestre a fechar.',
    semMatriculaAtiva: 'A turma não tem matrícula ativa; não há bimestre a fechar.',
    jaFechado: 'Este bimestre já está fechado para a turma.',
    pendencia: (disciplina: string, faltando: number): string => `${disciplina} (${faltando})`,
    separadorDePendencias: ', ',
    pendenciaSingular: (detalhe: string): string =>
      `Falta 1 nota para fechar o bimestre: ${detalhe}.`,
    pendenciaPlural: (total: number, detalhe: string): string =>
      `Faltam ${total} notas para fechar o bimestre: ${detalhe}.`,
  },
} as const;

export const VOCABULARIO = {
  situacaoFinal: { aprovado: 'Aprovado', reprovado: 'Reprovado', em_curso: 'Em curso' },
  presenca: { presente: 'Presente', faltaJustificada: 'Falta justificada', falta: 'Falta' },
  fechamento: { fechado: 'Fechado', aberto: 'Aberto' },
} as const;

export const ROTULO_DE_BIMESTRE = (numero: number): string => `${numero}º bimestre`;
