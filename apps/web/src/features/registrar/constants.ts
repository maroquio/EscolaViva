const STUDENTS = '/registrar/students';
const GUARDIANS = '/registrar/guardians';
const ENROLLMENTS = '/registrar/enrollments';

export const REGISTRAR_API = {
  dashboard: '/registrar/dashboard',
  students: STUDENTS,
  student: (studentId: string): string => `${STUDENTS}/${studentId}`,
  studentGuardians: (studentId: string): string => `${STUDENTS}/${studentId}/guardians`,
  availableGuardians: (studentId: string): string => `${STUDENTS}/${studentId}/available-guardians`,
  guardians: GUARDIANS,
  enrollments: ENROLLMENTS,
  enrollmentTransfer: (enrollmentId: string): string => `${ENROLLMENTS}/${enrollmentId}/transfer`,
} as const;

export const OPTIONS_API = {
  classGroups: '/options/class-groups',
  academicYears: '/options/academic-years',
} as const;

export const SEARCH_TERM_PARAM = 'q';


const REGISTRAR_KEY = 'registrar';
const OPTIONS_KEY = 'options';

const ALL_STUDENT_SEARCHES = [REGISTRAR_KEY, 'students'] as const;
const ALL_STUDENT_RECORDS = [REGISTRAR_KEY, 'student'] as const;

export const REGISTRAR_QUERY_KEYS = {
  dashboard: (page: number) => [REGISTRAR_KEY, 'dashboard', page] as const,
  allStudentSearches: ALL_STUDENT_SEARCHES,
  studentSearch: (term: string, page: number) => [...ALL_STUDENT_SEARCHES, term, page] as const,
  allStudentRecords: ALL_STUDENT_RECORDS,
  studentRecords: (studentId: string) => [...ALL_STUDENT_RECORDS, studentId] as const,
  studentRecord: (studentId: string, guardiansPage: number, enrollmentsPage: number) =>
    [...ALL_STUDENT_RECORDS, studentId, guardiansPage, enrollmentsPage] as const,
  availableGuardians: (studentId: string) =>
    [...ALL_STUDENT_RECORDS, studentId, 'available-guardians'] as const,
  guardians: (page: number) => [REGISTRAR_KEY, 'guardians', page] as const,
  transfer: (enrollmentId: string) => [REGISTRAR_KEY, 'transfer', enrollmentId] as const,
  classGroupOptions: [OPTIONS_KEY, 'class-groups'] as const,
  academicYearOptions: [OPTIONS_KEY, 'academic-years'] as const,
};

export const STUDENT_FIELD = { name: 'name', birthDate: 'birthDate' } as const;

export const GUARDIAN_LINK_FIELD = {
  userId: 'userId',
  relationship: 'relationship',
  financiallyResponsible: 'financiallyResponsible',
} as const;

export const GUARDIAN_FIELD = {
  name: 'name',
  cpf: 'cpf',
  email: 'email',
  phone: 'phone',
  schoolId: 'schoolId',
} as const;

export const ENROLLMENT_FIELD = {
  classGroupId: 'classGroupId',
  academicYearId: 'academicYearId',
  enrollmentDate: 'enrollmentDate',
} as const;

export const TRANSFER_FIELD = { targetClassGroupId: 'targetClassGroupId', date: 'date' } as const;

export const REGISTRAR_MESSAGES = {
  studentName: 'Informe o nome do aluno.',
  birthDate: 'Informe a data de nascimento.',
  guardianChoice: 'Escolha o responsável.',
  relationship: 'Informe o parentesco.',
  name: 'Informe o nome.',
  cpf: 'Informe o CPF.',
  email: 'Informe o e-mail.',
  classGroupChoice: 'Escolha a turma.',
  academicYearChoice: 'Escolha o ano letivo.',
  enrollmentDate: 'Informe a data da matrícula.',
  targetClassGroupChoice: 'Escolha a turma de destino.',
  transferDate: 'Informe a data da transferência.',
} as const;

export const REGISTRAR_NOTICES = {
  studentRegistered: 'Aluno cadastrado.',
  studentEnrolled: 'Aluno matriculado.',
  guardianLinked: 'Responsável vinculado.',
  transferDone: 'Transferência concluída.',
  classGroupCreated: 'Turma criada.',
  subjectAssigned: 'Disciplina atribuída.',
  subjectRegistered: 'Disciplina cadastrada.',
} as const;

export const REGISTRAR_OVERLINE = 'Secretaria';

export const ENROLMENTS_LABEL = 'Matrículas';
export const ENROLMENT_LABEL = 'Matrícula';

export const NO_ACADEMIC_YEAR_SENTENCE = 'Nenhum ano letivo definido nesta rede.';

export const academicYearSpan = (year: number, from: string, to: string): string =>
  `Ano letivo ${year}, de ${from} a ${to}.`;
