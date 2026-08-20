import type {
  AcademicYear,
  ClassGroup,
  Enrollment,
  GuardianLink,
  SchoolCounts,
  Student,
} from '../../academics';
import type { UserSummary } from '../../identity';
import type {
  AcademicYearAsJson,
  ClassGroupInTransfer,
  GuardianInList,
  GuardianLinkInList,
  SchoolInDashboard,
  StudentAsJson,
  StudentInList,
} from '@escolaviva/contracts/students';
import type { EnrollmentInList, SimpleOption } from '@escolaviva/contracts/shared';
import type { SchoolInScope } from '../registrarScope';

export type GuardianLinkRow = GuardianLink & {
  readonly name: string;
  readonly email: string;
};

export const studentAsJson = (student: Student): StudentAsJson => ({
  id: student.id,
  name: student.name,
  birthDate: student.birthDate,
});

export const studentInListAsJson = (
  student: Student,
  active: Enrollment | null,
): StudentInList => ({
  id: student.id,
  name: student.name,
  birthDate: student.birthDate,
  classGroupName: active === null ? null : active.classGroupName,
  year: active === null ? null : active.year,
  status: active === null ? null : active.status,
});

export const enrollmentAsJson = (enrollment: Enrollment): EnrollmentInList => ({
  id: enrollment.id,
  studentId: enrollment.studentId,
  studentName: enrollment.studentName,
  classGroupId: enrollment.classGroupId,
  classGroupName: enrollment.classGroupName,
  year: enrollment.year,
  status: enrollment.status,
});

export const guardianLinkAsJson = (link: GuardianLinkRow): GuardianLinkInList => ({
  userId: link.userId,
  name: link.name,
  email: link.email,
  relationship: link.relationship,
  financiallyResponsible: link.financiallyResponsible,
});

export const guardianAsJson = (guardian: UserSummary): GuardianInList => ({
  id: guardian.id,
  name: guardian.name,
  email: guardian.email,
  phone: guardian.phone,
  cpf: guardian.cpf,
});

export const guardianOptionAsJson = (guardian: UserSummary): SimpleOption => ({
  id: guardian.id,
  name: guardian.name,
});

export const academicYearAsJson = (academicYear: AcademicYear): AcademicYearAsJson => ({
  id: academicYear.id,
  year: academicYear.year,
  startDate: academicYear.startDate,
  endDate: academicYear.endDate,
});

export const schoolInDashboardAsJson = (
  school: SchoolInScope,
  counts: SchoolCounts | undefined,
): SchoolInDashboard => ({
  schoolId: school.id,
  schoolName: school.name,
  enrollments: counts?.enrollments ?? 0,
  classGroups: counts?.classGroups ?? 0,
  guardians: counts?.guardians ?? 0,
});

export const classGroupInTransferAsJson = (
  classGroup: ClassGroup,
  schoolName: string,
  year: number | null,
): ClassGroupInTransfer => ({
  id: classGroup.id,
  name: classGroup.name,
  gradeLevel: classGroup.gradeLevel,
  shift: classGroup.shift,
  schoolId: classGroup.schoolId,
  schoolName,
  year,
});
