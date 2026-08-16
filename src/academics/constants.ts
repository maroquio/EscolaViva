import type { EnrollmentStatus } from './domain/enrollment';
import type { Shift } from './domain/classGroup';

export const LIMITS = {
  student: {
    name: 120,
    searchRows: 50,
  },
  subject: { name: 120 },
  classGroup: { name: 60, gradeLevel: 60 },
  relationship: { description: 40 },
  academicYear: { minYear: 2000, maxYear: 2100 },
} as const;

export const FIELDS = {
  student: { name: 'name', birthDate: 'birthDate' },
  subject: { name: 'name' },
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
    userId: 'userId',
    relationship: 'relationship',
    financiallyResponsible: 'financiallyResponsible',
  },
} as const;

export const CODES = {
  studentNotFound: 'student_not_found',
  classGroupNotFound: 'class_group_not_found',
  academicYearNotFound: 'academic_year_not_found',
  subjectNotFound: 'subject_not_found',
  guardianNotFound: 'guardian_not_found',

  student: { dateInFuture: 'date_in_future' },
  subject: { duplicate: 'duplicate_subject' },
  classGroup: { schoolNotFound: 'school_not_found', duplicate: 'duplicate_class_group' },
  academicYear: { incoherentPeriod: 'inconsistent_period', duplicate: 'duplicate_year' },
  teachingAssignment: {
    withoutTeacherRole: 'without_teacher_role',
    subjectAlreadyAssigned: 'subject_already_assigned',
  },
  enrollment: {
    duplicateActive: 'duplicate_active_enrollment',
    classGroupFromAnotherYear: 'class_group_from_another_year',
  },
  transfer: {
    enrollmentNotFound: 'enrollment_not_found',
    onlyActiveTransfers: 'enrollment_not_active',
    lostTheRace: 'enrollment_not_active',
    sameClassGroup: 'same_class_group',
    targetClassGroupNotFound: 'class_group_not_found',
    classGroupFromAnotherYear: 'class_group_from_another_year',
  },
  guardianLink: { duplicate: 'duplicate_link' },
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
