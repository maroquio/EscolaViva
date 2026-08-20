import type { RoleAssignmentAsJson } from './session';

export type NetworkCounts = {
  readonly schools: number;
  readonly users: number;
  readonly classGroups: number;
  readonly enrolled: number;
};

export type SchoolInList = {
  readonly id: string;
  readonly name: string;
  readonly inepCode: string | null;
  readonly active: boolean;
};

export type UserInList = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly cpf: string | null;
  readonly phone: string | null;
  readonly active: boolean;
  readonly roles: readonly RoleAssignmentAsJson[];
};

export type AcademicYearInList = {
  readonly id: string;
  readonly year: number;
  readonly startDate: string;
  readonly endDate: string;
};

export type NetworkDashboard = {
  readonly counts: NetworkCounts;
  readonly academicYear: AcademicYearInList | null;
  readonly definedYears: number;
};

export type CreatedResource = {
  readonly id: string;
};

export type AcceptedInvitation = {
  readonly userId: string;
  readonly temporaryPassword: string;
};
