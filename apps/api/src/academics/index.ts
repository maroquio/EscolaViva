import { assignTeacher } from './application/assignTeacher';
import { registerStudent } from './application/registerStudent';
import { registerSubject } from './application/registerSubject';
import { registerClassGroup } from './application/registerClassGroup';
import {
  academicYearById,
  academicYearsPage,
  activeEnrollmentsOfClassGroup,
  activeEnrollmentsOfClassGroupPage,
  activeEnrollmentsOfStudents,
  classGroupById,
  classGroupSubjectById,
  classGroupSubjectsPage,
  classGroupsPage,
  countActiveEnrollmentsOfYear,
  countClassGroups,
  countStudentEnrollmentsInSchools,
  countsBySchool,
  enrollmentById,
  guardianEnrollmentById,
  guardianEnrollments,
  guardianEnrollmentsPage,
  listAcademicYears,
  listClassGroupSubjects,
  listClassGroups,
  listSubjects,
  schoolGuardians,
  scopeTotals,
  searchStudents,
  studentById,
  studentEnrollmentsPage,
  studentGuardians,
  studentHasEnrollment,
  studentsPage,
  subjectsPage,
  teacherClassGroupSubjects,
  teacherClassGroups,
} from './application/queries';
import { defineAcademicYear } from './application/defineAcademicYear';
import { enroll } from './application/enroll';
import { transfer } from './application/transfer';
import { linkGuardian } from './application/linkGuardian';

export type { Student } from './domain/student';
export type { AcademicYear } from './domain/academicYear';
export type { Subject } from './domain/subject';
export type { Enrollment, EnrollmentStatus } from './domain/enrollment';
export type { GuardianLink } from './domain/guardian';
export type { ClassGroup, ClassGroupSubject } from './domain/classGroup';
export type { SchoolCounts, ClassGroupFilter } from './application/queries';

export const academics = {
  defineAcademicYear,
  listAcademicYears,
  academicYearById,
  academicYearsPage,
  registerSubject,
  listSubjects,
  subjectsPage,
  registerClassGroup,
  listClassGroups,
  classGroupsPage,
  countClassGroups,
  countsBySchool,
  scopeTotals,
  classGroupById,
  assignTeacher,
  listClassGroupSubjects,
  classGroupSubjectsPage,
  classGroupSubjectById,
  teacherClassGroupSubjects,
  teacherClassGroups,
  registerStudent,
  searchStudents,
  studentsPage,
  studentById,
  studentHasEnrollment,
  linkGuardian,
  studentGuardians,
  enroll,
  transfer,
  enrollmentById,
  activeEnrollmentsOfClassGroup,
  activeEnrollmentsOfClassGroupPage,
  activeEnrollmentsOfStudents,
  countActiveEnrollmentsOfYear,
  countStudentEnrollmentsInSchools,
  guardianEnrollmentById,
  guardianEnrollments,
  guardianEnrollmentsPage,
  studentEnrollmentsPage,
  schoolGuardians,
};

export {
  FIELDS as ACADEMIC_FIELDS,
  LIMITS as ACADEMIC_LIMITS,
  VOCABULARY as ACADEMIC_VOCABULARY,
} from './constants';

export { ACTIVE_ENROLLMENT_STATUS, ENROLLMENT_STATUSES } from './domain/enrollment';
export { SHIFTS } from './domain/classGroup';
