import type { EnrollmentStatus, Shift } from './enumerations';

export type { Shift };

export type SimpleOption = {
  readonly id: string;
  readonly name: string;
};

export type EnrollmentInList = {
  readonly id: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly classGroupId: string;
  readonly classGroupName: string;
  readonly year: number;
  readonly status: EnrollmentStatus;
};

export type SchoolCounts = {
  readonly schoolId: string;
  readonly schoolName: string;
  readonly enrollments: number;
  readonly classGroups: number;
};
