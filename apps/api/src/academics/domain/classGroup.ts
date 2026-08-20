export const SHIFTS = ['morning', 'afternoon', 'evening', 'full_time'] as const;

export type Shift = (typeof SHIFTS)[number];

export type ClassGroup = {
  id: string;
  networkId: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  gradeLevel: string;
  shift: Shift;
};

export type ClassGroupSubject = {
  id: string;
  networkId: string;
  classGroupId: string;
  subjectId: string;
  subjectName: string;
  teacherUserId: string;
};

export type TeacherClassGroupSubject = ClassGroupSubject & {
  classGroupName: string;
  gradeLevel: string;
  shift: Shift;
  schoolId: string;
};

export function isValidShift(value: string): value is Shift {
  return SHIFTS.some((shift) => shift === value);
}
