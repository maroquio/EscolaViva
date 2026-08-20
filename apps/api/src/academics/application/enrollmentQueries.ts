import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Enrollment } from '../domain/enrollment';
import * as enrollments from '../infra/enrollmentRepository';

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

export function activeEnrollmentsOfStudents(
  networkId: string,
  studentIds: readonly string[],
  schoolIds: readonly string[],
): Promise<Enrollment[]> {
  return enrollments.activeOfStudents(reader(), networkId, studentIds, schoolIds);
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

export function countStudentEnrollmentsInSchools(
  networkId: string,
  studentId: string,
  schoolIds: readonly string[],
): Promise<number> {
  return enrollments.countOfStudentInSchools(reader(), networkId, studentId, schoolIds);
}

export function countActiveEnrollmentsOfYear(
  networkId: string,
  academicYearId: string,
): Promise<number> {
  return enrollments.countActiveByAcademicYear(reader(), networkId, academicYearId);
}

export function studentHasEnrollment(networkId: string, studentId: string): Promise<boolean> {
  return enrollments.hasAnyEnrollment(reader(), networkId, studentId);
}
