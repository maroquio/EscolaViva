export const LIMITS = {
  grade: { minimum: 0, maximum: 10 },
  excuseCharacters: 500,
} as const;

export const ARITHMETIC = {
  hundredths: 100,
  percent: 100,
  representationTolerance: 1e-6,
} as const;

export const PASSING = {
  minimumAverageInHundredths: 600,
  minimumAttendanceInHundredths: 7500,
} as const;

export const MIDNIGHT_UTC = 'T00:00:00Z';

export const NOON_UTC = 'T12:00:00Z';

export const FIELDS = {
  classGroupId: 'classGroupId',
  classGroupSubjectId: 'classGroupSubjectId',
  term: 'term',
  date: 'date',
  grades: 'grades',
  rows: 'rows',
} as const;

export const CODES = {
  notFound: 'not_found',
  classGroupSubjectNotFound: 'not_found',
  academicYearMissing: 'academic_year_missing',
  dateOutsideAcademicYear: 'date_outside_academic_year',
  termClosed: 'term_closed',
  alreadyClosed: 'already_closed',
  noSubject: 'no_subject',
  noActiveEnrollment: 'no_active_enrollment',
  incompleteClosing: 'incomplete_closing',

  grades: {
    enrollmentOutsideClassGroup: 'enrollment_outside_class_group',
    duplicateEnrollment: 'duplicate_enrollment',
  },
  rollCall: {
    enrollmentOutsideClassGroup: 'enrollment_outside_class_group',
    duplicateEnrollment: 'duplicate_enrollment',
  },
} as const;

export const MESSAGES = {
  invalidTerm: 'O bimestre precisa ser 1, 2, 3 ou 4.',
  gradeOutOfScale: 'A nota precisa ficar entre 0 e 10.',
  emptyGradeBatch: 'Nenhuma nota foi enviada.',
  classGroupNotFound: 'Turma não encontrada nesta rede.',
  classGroupSubjectNotFound: 'Disciplina da turma não encontrada nesta rede.',
  termClosedForPosting:
    'O bimestre já foi fechado para esta turma; as notas não podem mais ser alteradas.',

  grades: {
    enrollmentOutsideClassGroup: 'Há aluno sem matrícula ativa nesta turma no lançamento.',
    duplicateEnrollment: 'O mesmo aluno aparece duas vezes.',
  },
  rollCall: {
    invalidDate: 'Informe uma data válida no formato AAAA-MM-DD.',
    excuseTooLong: 'A justificativa é longa demais.',
    emptyBatch: 'Nenhuma linha de chamada foi enviada.',
    academicYearMissing: 'A turma não tem ano letivo definido.',
    dateOutsideAcademicYear: (start: string, end: string): string =>
      `A chamada precisa cair entre ${start} e ${end}.`,
    enrollmentOutsideClassGroup: 'Há aluno sem matrícula ativa nesta turma na chamada.',
    duplicateEnrollment: 'O mesmo aluno aparece duas vezes.',
  },
  closing: {
    noSubject: 'A turma não tem disciplina alocada; não há bimestre a fechar.',
    noActiveEnrollment: 'A turma não tem matrícula ativa; não há bimestre a fechar.',
    alreadyClosed: 'Este bimestre já está fechado para a turma.',
    pendingItem: (subject: string, missing: number): string => `${subject} (${missing})`,
    pendingItemsSeparator: ', ',
    singlePendingItem: (detail: string): string =>
      `Falta 1 nota para fechar o bimestre: ${detail}.`,
    manyPendingItems: (total: number, detail: string): string =>
      `Faltam ${total} notas para fechar o bimestre: ${detail}.`,
  },
} as const;

export const VOCABULARY = {
  finalStatus: { passed: 'Aprovado', failed: 'Reprovado', in_progress: 'Em curso' },
  attendance: { present: 'Presente', excusedAbsence: 'Falta justificada', absence: 'Falta' },
  closing: { closed: 'Fechado', open: 'Aberto' },
} as const;

export const TERM_LABEL = (term: number): string => `${term}º bimestre`;
