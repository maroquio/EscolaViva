import { SHIFTS, type Shift } from '@escolaviva/contracts/enumerations';
import { CHOOSE } from '../../../shared/labels/constants';
import { REGISTRAR_MESSAGES } from '../constants';

export const CLASS_GROUPS_ENDPOINT = '/registrar/class-groups';
export const SUBJECTS_ENDPOINT = '/registrar/subjects';
export const classGroupSubjectsEndpoint = (classGroupId: string): string =>
  `${CLASS_GROUPS_ENDPOINT}/${classGroupId}/subjects`;
export const SUBJECT_OPTIONS_ENDPOINT = '/options/subjects';
export const TEACHER_OPTIONS_ENDPOINT = '/options/teachers';

export const CLASS_GROUP_FILTER_PARAMS = { school: 'school', year: 'year' } as const;
export const SCHOOL_ID_PARAM = 'schoolId';
export const NO_FILTER = '';
export const UNKNOWN_SCHOOL = '';

const SHIFT_OFFERED_FIRST = 0;

export const DEFAULT_SHIFT: Shift = SHIFTS[SHIFT_OFFERED_FIRST];

export const CLASS_GROUP_OVERLINE = 'Secretaria · Turmas';
export const CREATE_CLASS_GROUP_LABEL = 'Criar turma';
export const ASSIGN_SUBJECT_LABEL = 'Atribuir disciplina';
export const BACK_TO_CLASS_GROUPS_LABEL = 'Voltar para as turmas';

export const CLASS_GROUP_FIELD = {
  name: 'name',
  gradeLevel: 'gradeLevel',
  shift: 'shift',
  schoolId: 'schoolId',
  academicYearId: 'academicYearId',
} as const;

export const ASSIGNMENT_FIELD = { subjectId: 'subjectId', teacherUserId: 'teacherUserId' } as const;

export const SUBJECT_FIELD = { name: 'name' } as const;

export const CLASS_GROUP_MESSAGES = {
  name: 'Informe o nome da turma.',
  gradeLevel: 'Informe a série.',
  shiftChoice: 'Escolha o turno.',
  schoolChoice: 'Escolha a escola.',
  academicYearChoice: REGISTRAR_MESSAGES.academicYearChoice,
  subjectChoice: 'Escolha a disciplina.',
  teacherChoice: 'Escolha o professor.',
  subjectName: 'Informe o nome da disciplina.',
} as const;

export const CLASS_GROUP_CHOICES = {
  school: CHOOSE.school,
  academicYear: CHOOSE.academicYear,
  subject: CHOOSE.subject,
  teacher: CHOOSE.teacher,
} as const;

export const EVERY_SCHOOL = 'Todas as escolas';
export const EVERY_YEAR = 'Todos os anos';

export const BACK_TO_CLASS_GROUP_LABEL = 'Voltar para a turma';
export const SEARCH_STUDENT_LABEL = 'Buscar aluno';
