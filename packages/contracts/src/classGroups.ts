import type { Shift } from './enumerations';
import type { Page } from './page';
import type { EnrollmentInList } from './shared';

export type ClassGroupInList = {
  readonly id: string;
  readonly name: string;
  readonly gradeLevel: string;
  readonly shift: Shift;
  readonly schoolId: string;
  readonly schoolName: string;
  readonly academicYearId: string;
  readonly year: number | null;
};

export type AssignmentInList = {
  readonly id: string;
  readonly subjectName: string;
  readonly teacherName: string;
};

export type SubjectInList = {
  readonly id: string;
  readonly name: string;
};

export type ClassGroupRecord = {
  readonly classGroup: ClassGroupInList;
  readonly assignments: Page<AssignmentInList>;
  readonly enrollments: Page<EnrollmentInList>;
};
