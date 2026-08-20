import { ACADEMIC_FIELDS } from '../../academics';
import { ASSESSMENT_FIELDS } from '../../assessment';
import { COMMUNICATION_FIELDS } from '../../communication';
import { IDENTITY_FIELDS } from '../../identity';

export const FIELDS = {
  login: {
    networkSlug: IDENTITY_FIELDS.login.networkSlug,
    cpf: IDENTITY_FIELDS.login.cpf,
    password: IDENTITY_FIELDS.login.password,
  },
  password: {
    currentPassword: IDENTITY_FIELDS.password.currentPassword,
    newPassword: IDENTITY_FIELDS.password.newPassword,
    passwordConfirmation: IDENTITY_FIELDS.password.passwordConfirmation,
  },
  student: {
    name: ACADEMIC_FIELDS.student.name,
    birthDate: ACADEMIC_FIELDS.student.birthDate,
  },
  guardian: {
    name: IDENTITY_FIELDS.user.name,
    email: IDENTITY_FIELDS.user.email,
    phone: IDENTITY_FIELDS.user.phone,
    cpf: IDENTITY_FIELDS.user.cpf,
    schoolId: 'schoolId',
  },
  guardianLink: {
    studentId: ACADEMIC_FIELDS.guardianLink.studentId,
    userId: ACADEMIC_FIELDS.guardianLink.userId,
    relationship: ACADEMIC_FIELDS.guardianLink.relationship,
    financiallyResponsible: ACADEMIC_FIELDS.guardianLink.financiallyResponsible,
  },
  enrollment: {
    studentId: ACADEMIC_FIELDS.enrollment.studentId,
    classGroupId: ACADEMIC_FIELDS.enrollment.classGroupId,
    academicYearId: ACADEMIC_FIELDS.enrollment.academicYearId,
    enrollmentDate: ACADEMIC_FIELDS.enrollment.enrollmentDate,
  },
  transfer: {
    enrollmentId: ACADEMIC_FIELDS.transfer.enrollmentId,
    targetClassGroupId: ACADEMIC_FIELDS.transfer.targetClassGroupId,
    date: ACADEMIC_FIELDS.transfer.date,
  },
  classGroup: {
    name: ACADEMIC_FIELDS.classGroup.name,
    gradeLevel: ACADEMIC_FIELDS.classGroup.gradeLevel,
    shift: ACADEMIC_FIELDS.classGroup.shift,
    schoolId: ACADEMIC_FIELDS.classGroup.schoolId,
    academicYearId: ACADEMIC_FIELDS.classGroup.academicYearId,
  },
  subject: { name: ACADEMIC_FIELDS.subject.name },
  teachingAssignment: {
    classGroupId: ACADEMIC_FIELDS.teachingAssignment.classGroupId,
    subjectId: ACADEMIC_FIELDS.teachingAssignment.subjectId,
    teacherUserId: ACADEMIC_FIELDS.teachingAssignment.teacherUserId,
  },
  school: { name: IDENTITY_FIELDS.school.name, inepCode: IDENTITY_FIELDS.school.inepCode },
  user: {
    name: IDENTITY_FIELDS.user.name,
    email: IDENTITY_FIELDS.user.email,
    cpf: IDENTITY_FIELDS.user.cpf,
    roleAssignments: IDENTITY_FIELDS.user.roleAssignments,
    schools: 'schools[]',
    roles: 'roles[]',
  },
  academicYear: {
    year: ACADEMIC_FIELDS.academicYear.year,
    startDate: ACADEMIC_FIELDS.academicYear.startDate,
    endDate: ACADEMIC_FIELDS.academicYear.endDate,
  },
  announcement: {
    title: COMMUNICATION_FIELDS.title,
    body: COMMUNICATION_FIELDS.body,
    schoolId: COMMUNICATION_FIELDS.schoolId,
    authorUserId: COMMUNICATION_FIELDS.authorUserId,
    recipients: COMMUNICATION_FIELDS.recipients,
    audience: COMMUNICATION_FIELDS.audience,
    guardians: 'guardians[]',
  },
  journal: { grade: 'grade_', present: 'present_', excuse: 'excuse_' },
  term: ASSESSMENT_FIELDS.term,
  date: ASSESSMENT_FIELDS.date,
  grades: ASSESSMENT_FIELDS.grades,
} as const;

export const FORM_ERRORS = {
  confirmationMismatch: {
    field: FIELDS.password.passwordConfirmation,
    code: 'confirmation_mismatch',
    message: 'A confirmação não confere com a senha nova.',
  },
  invalidYear: {
    field: FIELDS.academicYear.year,
    code: 'invalid_year',
    message: 'Informe o ano com quatro dígitos.',
  },
  incompleteRoleAssignment: {
    field: FIELDS.user.roleAssignments,
    code: 'incomplete_role_assignment',
    message: 'Cada atribuição precisa de uma unidade e de um papel.',
  },
  guardianSchoolRequired: {
    field: FIELDS.guardian.schoolId,
    code: 'guardian_school_required',
    message: 'Selecione a unidade em que o responsável entra no portal.',
  },
  invalidGrade: {
    field: FIELDS.grades,
    code: 'invalid_grade',
  },
  noSelection: {
    field: FIELDS.announcement.recipients,
    code: 'nothing_selected',
  },
  recipientOutsideSchool: {
    field: FIELDS.announcement.recipients,
    code: 'recipient_outside_school',
    message: 'Um dos responsáveis marcados não pertence à unidade escolhida.',
  },
  missingSchool: {
    field: FIELDS.announcement.schoolId,
    code: 'school_missing',
    message: 'Escolha a unidade que vai enviar o comunicado.',
  },
} as const;

export const DIAGNOSTICS = {
  termOnPosting: 'term outside the set on posting',
  termOnClosing: 'term outside the set on closing',
  malformedRollCallDate: 'malformed roll call date',
  subjectOutsideSchedule: 'subject outside the teacher schedule',
  classGroupOutsideSchedule: 'class group outside the teacher schedule',
  enrollmentOutsideResponsibility: 'enrollment outside the responsibility',
  enrollmentWithoutReportCard: 'enrollment with no report card',
  enrollmentWithoutAttendance: 'enrollment with no attendance tally',
  announcementOutsideBoard: 'announcement outside the guardian board',
  schoolOutOfScope: 'school outside the user scope',
} as const;

export const NO_SELECTION_ON_SEND =
  'Marque ao menos um responsável ou escolha enviar para toda a unidade.';

export const GRADE_OUT_OF_RANGE = (minimum: number, maximum: number): string =>
  `Use um número de ${minimum} a ${maximum}.`;

export const LOG_EVENTS = {
  signInAttempt: 'sign-in attempt',
  rejected: 'rejected',
  success: 'success',
  passwordChanged: 'password changed by the user',
  schoolCreated: 'school created',
  userInvited: 'user invited',
  academicYearDefined: 'academic year defined',
} as const;
