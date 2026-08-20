import type { Shift } from './shared';

export type SchoolOption = {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
};

export type AcademicYearOption = {
  readonly id: string;
  readonly year: number;
};

export type ClassGroupOption = {
  readonly id: string;
  readonly name: string;
  readonly gradeLevel: string;
  readonly shift: Shift;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly academicYearId: string;
  readonly year: number | null;
};
