import type { Shift } from './enumerations';

export type TeacherSubject = {
  readonly id: string;
  readonly subjectName: string;
};

export type TeacherClassGroup = {
  readonly classGroupId: string;
  readonly classGroupName: string;
  readonly gradeLevel: string;
  readonly shift: Shift;
  readonly subjects: readonly TeacherSubject[];
};

export type GradedAssignment = {
  readonly id: string;
  readonly subjectName: string;
  readonly classGroupId: string;
  readonly classGroupName: string;
};

export type GradeRow = {
  readonly enrollmentId: string;
  readonly studentName: string;
  readonly value: number | null;
};

export type GradesScreen = {
  readonly assignment: GradedAssignment;
  readonly term: number;
  readonly closed: boolean;
  readonly rows: readonly GradeRow[];
};

export type GradesSaved = {
  readonly saved: number;
};

export type RollCallRow = {
  readonly enrollmentId: string;
  readonly studentName: string;
  readonly present: boolean;
  readonly excuse: string | null;
};

export type RollCallScreen = {
  readonly date: string;
  readonly rows: readonly RollCallRow[];
};

export type ClosingState = {
  readonly term: number;
  readonly closed: boolean;
  readonly closedAt: string | null;
};

export type TermClosed = {
  readonly term: number;
};
