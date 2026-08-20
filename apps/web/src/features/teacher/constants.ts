export const TEACHER_ENDPOINTS = {
  classGroups: '/teacher/class-groups',
  grades: (classGroupSubjectId: string): string =>
    `/teacher/subjects/${classGroupSubjectId}/grades`,
  rollCall: (classGroupId: string): string => `/teacher/class-groups/${classGroupId}/roll-call`,
  closing: (classGroupId: string): string => `/teacher/class-groups/${classGroupId}/closing`,
} as const;

export const TERM_PARAM = 'term';

export const DAY_PARAM = 'date';

export const NO_DAY_IN_THE_ADDRESS = '';

export type IsoDay = string;

const EVERY_GRADE_GRID = ['teacher', 'grades'] as const;

export const TEACHER_QUERY_KEYS = {
  classGroups: ['teacher', 'class-groups'] as const,
  everyGradeGrid: EVERY_GRADE_GRID,
  grades: (classGroupSubjectId: string, term: number) =>
    [...EVERY_GRADE_GRID, classGroupSubjectId, term] as const,
  rollCall: (classGroupId: string, day: IsoDay) =>
    ['teacher', 'roll-call', classGroupId, day] as const,
  closing: (classGroupId: string) => ['teacher', 'closing', classGroupId] as const,
};

export const TEACHER_OVERLINE = 'Docência';

export const BACK_TO_MY_CLASS_GROUPS = 'Voltar para minhas turmas';

export const GRADES_FIELD = {
  grades: 'grades',
  cell: (row: number): `grades.${number}.value` => `grades.${row}.value`,
} as const;

export const ROLL_CALL_FIELD = {
  rows: 'rows',
  present: (row: number): `rows.${number}.present` => `rows.${row}.present`,
  excuse: (row: number): `rows.${number}.excuse` => `rows.${row}.excuse`,
} as const;

export const TERM_CLOSING_LABELS = { closed: 'Fechado', open: 'Aberto' } as const;

export const CHOSEN_TERM = 'true';

export const CHOSEN_TERM_BUTTON = 'filled';

export const gradesSaved = (howMany: number): string => `${howMany} nota(s) lançada(s).`;

export const termInWords = (term: number): string => `${term}º bimestre`;

export const termClosed = (term: number): string => `${termInWords(term)} fechado.`;

export const ATTENDANCE_RECORDED = 'Frequência registrada.';
