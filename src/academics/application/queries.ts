import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Student } from '../domain/student';
import type { AcademicYear } from '../domain/academicYear';
import type { Subject } from '../domain/subject';
import type { Enrollment } from '../domain/enrollment';
import type { Guardian, GuardianLink } from '../domain/guardian';
import type {
  ClassGroup,
  ClassGroupSubject,
  TeacherClassGroupSubject,
} from '../domain/classGroup';
import type { ClassGroupFilter } from '../infra/classGroupRepository';
import * as students from '../infra/studentRepository';
import * as academicYears from '../infra/academicYearRepository';
import * as subjects from '../infra/subjectRepository';
import * as enrollments from '../infra/enrollmentRepository';
import * as guardians from '../infra/guardianRepository';
import * as classGroups from '../infra/classGroupRepository';

export type { ClassGroupFilter } from '../infra/classGroupRepository';

export type SchoolCounts = {
  readonly classGroups: number;
  readonly enrollments: number;
  readonly guardians: number;
};

export function listAcademicYears(networkId: string): Promise<AcademicYear[]> {
  return academicYears.list(reader(), networkId);
}

export function academicYearsPage(
  networkId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<AcademicYear>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => academicYears.count(sql, networkId),
    (range) => academicYears.list(sql, networkId, range),
  );
}

export function listSubjects(networkId: string): Promise<Subject[]> {
  return subjects.list(reader(), networkId);
}

export function subjectsPage(
  networkId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Subject>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => subjects.count(sql, networkId),
    (range) => subjects.list(sql, networkId, range),
  );
}

export function listClassGroups(
  networkId: string,
  filter?: ClassGroupFilter,
): Promise<ClassGroup[]> {
  return classGroups.list(reader(), networkId, filter);
}

export function classGroupsPage(
  networkId: string,
  filter: ClassGroupFilter,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<ClassGroup>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => classGroups.count(sql, networkId, filter),
    (range) => classGroups.list(sql, networkId, filter, range),
  );
}

export async function scopeTotals(
  networkId: string,
  schoolIds: readonly string[],
): Promise<{ classGroups: number; enrollments: number; guardians: number; subjects: number }> {
  const sql = reader();
  const [byClassGroup, byEnrollment, howManyGuardians, howManySubjects] = await Promise.all([
    classGroups.countBySchool(sql, networkId, schoolIds),
    enrollments.countActiveBySchool(sql, networkId, schoolIds),
    guardians.countInSchools(sql, networkId, schoolIds),
    subjects.count(sql, networkId),
  ]);
  const sum = (counts: ReadonlyMap<string, number>): number =>
    schoolIds.reduce((total, id) => total + (counts.get(id) ?? 0), 0);
  return {
    classGroups: sum(byClassGroup),
    enrollments: sum(byEnrollment),
    guardians: howManyGuardians,
    subjects: howManySubjects,
  };
}

export async function countsBySchool(
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, SchoolCounts>> {
  const sql = reader();
  const [byClassGroup, byEnrollment, byGuardian] = await Promise.all([
    classGroups.countBySchool(sql, networkId, schoolIds),
    enrollments.countActiveBySchool(sql, networkId, schoolIds),
    guardians.countBySchool(sql, networkId, schoolIds),
  ]);
  return new Map(
    schoolIds.map((schoolId): [string, SchoolCounts] => [
      schoolId,
      {
        classGroups: byClassGroup.get(schoolId) ?? 0,
        enrollments: byEnrollment.get(schoolId) ?? 0,
        guardians: byGuardian.get(schoolId) ?? 0,
      },
    ]),
  );
}

export function classGroupById(
  networkId: string,
  classGroupId: string,
): Promise<ClassGroup | null> {
  return classGroups.byId(reader(), networkId, classGroupId);
}

export function listClassGroupSubjects(
  networkId: string,
  classGroupId: string,
): Promise<ClassGroupSubject[]> {
  return classGroups.listSubjects(reader(), networkId, classGroupId);
}

export function classGroupSubjectsPage(
  networkId: string,
  classGroupId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<ClassGroupSubject>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => classGroups.countSubjects(sql, networkId, classGroupId),
    (range) => classGroups.listSubjects(sql, networkId, classGroupId, range),
  );
}

export function classGroupSubjectById(
  networkId: string,
  id: string,
): Promise<ClassGroupSubject | null> {
  return classGroups.subjectById(reader(), networkId, id);
}

export function teacherClassGroupSubjects(
  networkId: string,
  teacherUserId: string,
): Promise<TeacherClassGroupSubject[]> {
  return classGroups.teacherSubjects(reader(), networkId, teacherUserId);
}

export function teacherClassGroups(
  networkId: string,
  teacherUserId: string,
): Promise<ClassGroup[]> {
  return classGroups.ofTeacher(reader(), networkId, teacherUserId);
}

export function searchStudents(networkId: string, term: string): Promise<Student[]> {
  return students.search(reader(), networkId, term);
}

export function studentsPage(
  networkId: string,
  term: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Student>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => students.countSearch(sql, networkId, term),
    (range) => students.search(sql, networkId, term, range),
  );
}

export function activeEnrollmentsOfStudents(
  networkId: string,
  studentIds: readonly string[],
  schoolIds: readonly string[],
): Promise<Enrollment[]> {
  return enrollments.activeOfStudents(reader(), networkId, studentIds, schoolIds);
}

export function studentById(networkId: string, studentId: string): Promise<Student | null> {
  return students.byId(reader(), networkId, studentId);
}

export function listGuardians(networkId: string): Promise<Guardian[]> {
  return guardians.list(reader(), networkId);
}

export function guardiansPage(
  networkId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Guardian>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => guardians.count(sql, networkId),
    (range) => guardians.list(sql, networkId, range),
  );
}

export function guardianById(networkId: string, guardianId: string): Promise<Guardian | null> {
  return guardians.byId(reader(), networkId, guardianId);
}

export function studentGuardians(
  networkId: string,
  studentId: string,
): Promise<GuardianLink[]> {
  return guardians.ofStudent(reader(), networkId, studentId);
}

export function studentGuardiansPage(
  networkId: string,
  studentId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<GuardianLink>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => guardians.countOfStudent(sql, networkId, studentId),
    (range) => guardians.ofStudent(sql, networkId, studentId, range),
  );
}

export function schoolGuardians(
  networkId: string,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  return guardians.ofSchool(reader(), networkId, schoolId);
}

export function enrollmentById(
  networkId: string,
  enrollmentId: string,
): Promise<Enrollment | null> {
  return enrollments.byId(reader(), networkId, enrollmentId);
}

export function activeEnrollmentsOfClassGroup(
  networkId: string,
  classGroupId: string,
): Promise<Enrollment[]> {
  return enrollments.activeOfClassGroup(reader(), networkId, classGroupId);
}

export function activeEnrollmentsOfClassGroupPage(
  networkId: string,
  classGroupId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Enrollment>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => enrollments.countActiveOfClassGroup(sql, networkId, classGroupId),
    (range) => enrollments.activeOfClassGroup(sql, networkId, classGroupId, range),
  );
}

export function guardianEnrollments(
  networkId: string,
  guardianId: string,
): Promise<Enrollment[]> {
  return enrollments.ofGuardian(reader(), networkId, guardianId);
}

export function guardianEnrollmentsPage(
  networkId: string,
  guardianId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Enrollment>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => enrollments.countOfGuardian(sql, networkId, guardianId),
    (range) => enrollments.ofGuardian(sql, networkId, guardianId, range),
  );
}

export function studentEnrollmentsPage(
  networkId: string,
  studentId: string,
  schoolIds: readonly string[],
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Enrollment>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => enrollments.countOfStudentInSchools(sql, networkId, studentId, schoolIds),
    (range) => enrollments.ofStudentInSchools(sql, networkId, studentId, schoolIds, range),
  );
}

export function studentHasEnrollment(networkId: string, studentId: string): Promise<boolean> {
  return enrollments.hasAnyEnrollment(reader(), networkId, studentId);
}
