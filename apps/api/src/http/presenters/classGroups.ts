import type { ClassGroup, ClassGroupSubject, Enrollment, Subject } from '../../academics';
import { MISSING_VALUE } from '../../shared/constants';
import type { AssignmentInList, ClassGroupInList, SubjectInList } from '@escolaviva/contracts/classGroups';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';

type NameById = ReadonlyMap<string, string>;
type YearById = ReadonlyMap<string, number>;

export const classGroupAsJson = (
  classGroup: ClassGroup,
  schoolNames: NameById,
  years: YearById,
): ClassGroupInList => ({
  id: classGroup.id,
  name: classGroup.name,
  gradeLevel: classGroup.gradeLevel,
  shift: classGroup.shift,
  schoolId: classGroup.schoolId,
  schoolName: schoolNames.get(classGroup.schoolId) ?? MISSING_VALUE,
  academicYearId: classGroup.academicYearId,
  year: years.get(classGroup.academicYearId) ?? null,
});

export const assignmentAsJson = (
  assignment: ClassGroupSubject,
  teacherNames: NameById,
): AssignmentInList => ({
  id: assignment.id,
  subjectName: assignment.subjectName,
  teacherName: teacherNames.get(assignment.teacherUserId) ?? MISSING_VALUE,
});

export const subjectAsJson = (subject: Subject): SubjectInList => ({
  id: subject.id,
  name: subject.name,
});

export const classGroupEnrollmentAsJson = (enrollment: Enrollment): EnrollmentInList => ({
  id: enrollment.id,
  studentId: enrollment.studentId,
  studentName: enrollment.studentName,
  classGroupId: enrollment.classGroupId,
  classGroupName: enrollment.classGroupName,
  year: enrollment.year,
  status: enrollment.status,
});
