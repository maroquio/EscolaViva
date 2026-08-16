import type { EnrollmentStatus } from './domain/enrollment';
import type { Shift } from './domain/classGroup';

export const LIMITS = {
  student: {
    name: 120,
    searchRows: 50,
  },
  subject: { name: 120 },
  guardian: { name: 120, email: 254, phone: 30 },
  classGroup: { name: 60, gradeLevel: 60 },
  relationship: { description: 40 },
  academicYear: { minYear: 2000, maxYear: 2100 },
} as const;

export const FIELDS = {
  student: { name: 'name', birthDate: 'birthDate' },
  subject: { name: 'name' },
  guardian: { name: 'name', email: 'email', phone: 'phone', cpf: 'cpf' },
  classGroup: {
    name: 'name',
    gradeLevel: 'gradeLevel',
    shift: 'shift',
    schoolId: 'schoolId',
    academicYearId: 'academicYearId',
  },
  academicYear: { year: 'year', startDate: 'startDate', endDate: 'endDate' },
  teachingAssignment: {
    classGroupId: 'classGroupId',
    subjectId: 'subjectId',
    teacherUserId: 'teacherUserId',
  },
  enrollment: {
    studentId: 'studentId',
    classGroupId: 'classGroupId',
    academicYearId: 'academicYearId',
    enrollmentDate: 'enrollmentDate',
  },
  transfer: { enrollmentId: 'enrollmentId', targetClassGroupId: 'targetClassGroupId', date: 'date' },
  guardianLink: {
    studentId: 'studentId',
    guardianId: 'guardianId',
    relationship: 'relationship',
    financiallyResponsible: 'financiallyResponsible',
  },
} as const;

export const CODES = {
  studentNotFound: 'aluno_nao_encontrado',
  classGroupNotFound: 'turma_nao_encontrada',
  academicYearNotFound: 'ano_letivo_nao_encontrado',
  subjectNotFound: 'disciplina_nao_encontrada',
  guardianNotFound: 'responsavel_nao_encontrado',

  student: { dateInFuture: 'data_no_futuro' },
  subject: { duplicate: 'disciplina_duplicada' },
  guardian: { duplicateEmail: 'email_duplicado' },
  classGroup: { schoolNotFound: 'unidade_nao_encontrada', duplicate: 'turma_duplicada' },
  academicYear: { incoherentPeriod: 'periodo_incoerente', duplicate: 'ano_duplicado' },
  teachingAssignment: {
    withoutTeacherRole: 'sem_papel_de_professor',
    subjectAlreadyAssigned: 'disciplina_ja_alocada',
  },
  enrollment: {
    duplicateActive: 'matricula_ativa_duplicada',
    classGroupFromAnotherYear: 'turma_de_outro_ano',
  },
  transfer: {
    enrollmentNotFound: 'matricula_nao_encontrada',
    onlyActiveTransfers: 'matricula_nao_ativa',
    lostTheRace: 'matricula_nao_ativa',
    sameClassGroup: 'mesma_turma',
    targetClassGroupNotFound: 'turma_nao_encontrada',
    classGroupFromAnotherYear: 'turma_de_outro_ano',
  },
  guardianLink: { duplicate: 'vinculo_duplicado' },
} as const;

export const MESSAGES = {
  studentRequired: 'Selecione um aluno.',
  academicYearRequired: 'Selecione o ano letivo.',
  studentNotFound: 'Aluno não encontrado nesta rede.',
  classGroupNotFound: 'Turma não encontrada nesta rede.',
  academicYearNotFound: 'Ano letivo não encontrado nesta rede.',
  subjectNotFound: 'Disciplina não encontrada nesta rede.',
  guardianNotFound: 'Responsável não encontrado nesta rede.',

  student: {
    nameRequired: 'Informe o nome do aluno.',
    nameTooLong: `O nome precisa ter até ${LIMITS.student.name} caracteres.`,
    birthDateFormat: 'Informe a data de nascimento no formato AAAA-MM-DD.',
    dateInFuture: 'A data de nascimento não pode estar no futuro.',
  },
  subject: {
    nameRequired: 'Informe o nome da disciplina.',
    nameTooLong: `O nome precisa ter até ${LIMITS.subject.name} caracteres.`,
    duplicate: 'Esta rede já tem uma disciplina com este nome.',
  },
  guardian: {
    nameRequired: 'Informe o nome do responsável.',
    nameTooLong: `O nome precisa ter até ${LIMITS.guardian.name} caracteres.`,
    invalidEmail: 'Informe um e-mail válido.',
    emailTooLong: `O e-mail precisa ter até ${LIMITS.guardian.email} caracteres.`,
    phoneTooLong: `O telefone precisa ter até ${LIMITS.guardian.phone} caracteres.`,
    invalidCpf: 'Informe um CPF válido.',
    duplicateEmail: 'Esta rede já tem um responsável com este e-mail.',
  },
  classGroup: {
    schoolRequired: 'Selecione a unidade.',
    nameRequired: 'Informe o nome da turma.',
    nameTooLong: `O nome precisa ter até ${LIMITS.classGroup.name} caracteres.`,
    gradeLevelRequired: 'Informe a série.',
    gradeLevelTooLong: `A série precisa ter até ${LIMITS.classGroup.gradeLevel} caracteres.`,
    invalidShift: 'Turno inválido.',
    schoolNotFound: 'Unidade não encontrada nesta rede.',
    duplicate: 'Esta unidade já tem uma turma com este nome neste ano letivo.',
  },
  academicYear: {
    yearNotInteger: 'O ano precisa ser um número inteiro.',
    yearBelowMinimum: `O ano precisa ser a partir de ${LIMITS.academicYear.minYear}.`,
    yearAboveMaximum: `O ano precisa ser até ${LIMITS.academicYear.maxYear}.`,
    startDateFormat: 'Informe a data de início no formato AAAA-MM-DD.',
    endDateFormat: 'Informe a data de término no formato AAAA-MM-DD.',
    incoherentPeriod: 'A data de término precisa ser posterior à data de início.',
    duplicate: (year: number): string => `Esta rede já tem o ano letivo ${year} definido.`,
  },
  teachingAssignment: {
    classGroupRequired: 'Selecione a turma.',
    subjectRequired: 'Selecione a disciplina.',
    teacherRequired: 'Selecione o professor.',
    withoutTeacherRole: 'Este usuário não tem papel de professor na unidade desta turma.',
    subjectAlreadyAssigned: 'Esta disciplina já está alocada nesta turma.',
  },
  enrollment: {
    classGroupRequired: 'Selecione uma turma.',
    dateFormat: 'Informe a data da matrícula no formato AAAA-MM-DD.',
    classGroupFromAnotherYear: 'A turma não pertence ao ano letivo informado.',
    duplicateActive: 'Este aluno já tem matrícula ativa neste ano letivo.',
  },
  transfer: {
    enrollmentRequired: 'Selecione a matrícula.',
    targetClassGroupRequired: 'Selecione a turma de destino.',
    dateFormat: 'Informe a data da transferência no formato AAAA-MM-DD.',
    enrollmentNotFound: 'Matrícula não encontrada nesta rede.',
    onlyActiveTransfers: 'Apenas uma matrícula ativa pode ser transferida.',
    lostTheRace: 'Esta matrícula deixou de estar ativa antes da transferência ser concluída.',
    sameClassGroup: 'A turma de destino é a mesma turma da matrícula atual.',
    targetClassGroupNotFound: 'Turma de destino não encontrada nesta rede.',
    classGroupFromAnotherYear: 'A turma de destino pertence a outro ano letivo.',
  },
  guardianLink: {
    guardianRequired: 'Selecione um responsável.',
    relationshipRequired: 'Informe o parentesco.',
    relationshipTooLong: `O parentesco precisa ter até ${LIMITS.relationship.description} caracteres.`,
    duplicate: 'Este responsável já está vinculado a este aluno.',
  },
} as const;

export const INTERNAL_ERRORS = {
  unknownEnrollmentStatus: (value: string): string => `unknown enrollment status: ${value}`,
  unknownShift: (value: string): string => `shift outside the known set: ${value}`,
  enrollmentConflictOnTransfer: 'active enrollment conflict during the transfer',
} as const;

export const VOCABULARY = {
  shift: {
    morning: 'Matutino',
    afternoon: 'Vespertino',
    evening: 'Noturno',
    full_time: 'Integral',
  } as const satisfies Record<Shift, string>,
  enrollmentStatus: {
    active: 'Ativa',
    transferred: 'Transferida',
    cancelled: 'Cancelada',
    completed: 'Concluída',
  } as const satisfies Record<EnrollmentStatus, string>,
} as const;
