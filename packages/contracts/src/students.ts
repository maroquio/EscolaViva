import type { EnrollmentStatus, Shift } from './enumerations';
import type { Page } from './page';
import type { EnrollmentInList, SchoolCounts } from './shared';

export type StudentAsJson = {
  readonly id: string;
  readonly name: string;
  readonly birthDate: string;
};

export type StudentInList = {
  readonly id: string;
  readonly name: string;
  readonly birthDate: string;
  readonly classGroupName: string | null;
  readonly year: number | null;
  readonly status: EnrollmentStatus | null;
};

export type GuardianLinkInList = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly relationship: string;
  readonly financiallyResponsible: boolean;
};

export type GuardianInList = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly cpf: string | null;
};

export type StudentRecord = {
  readonly student: StudentAsJson;
  readonly guardians: Page<GuardianLinkInList>;
  readonly enrollments: Page<EnrollmentInList>;
  readonly active: EnrollmentInList | null;
};

export type ClassGroupInTransfer = {
  readonly id: string;
  readonly name: string;
  readonly gradeLevel: string;
  readonly shift: Shift;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly year: number | null;
};

export type TransferView = {
  readonly enrollment: EnrollmentInList;
  readonly student: StudentAsJson;
  readonly classGroups: readonly ClassGroupInTransfer[];
};

export type SchoolInDashboard = SchoolCounts & {
  readonly guardians: number;
};

export type AcademicYearAsJson = {
  readonly id: string;
  readonly year: number;
  readonly startDate: string;
  readonly endDate: string;
};

export type RegistrarTotals = {
  readonly classGroups: number;
  readonly enrollments: number;
  readonly guardians: number;
  readonly subjects: number;
};

export type RegistrarDashboard = {
  readonly schools: Page<SchoolInDashboard>;
  readonly currentYear: AcademicYearAsJson | null;
  readonly totals: RegistrarTotals;
};

export type CreatedRecord = {
  readonly id: string;
};

export type InvitedGuardian = {
  readonly id: string;
  readonly temporaryPassword: string;
};

export type LinkedGuardian = {
  readonly studentId: string;
  readonly userId: string;
};
