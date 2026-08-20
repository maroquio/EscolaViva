import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Enrollment } from '../domain/enrollment';
import * as enrollments from '../infra/enrollmentRepository';

export function guardianEnrollments(networkId: string, userId: string): Promise<Enrollment[]> {
  return enrollments.ofGuardian(reader(), networkId, userId);
}

export function guardianEnrollmentById(
  networkId: string,
  userId: string,
  enrollmentId: string,
): Promise<Enrollment | null> {
  return enrollments.ofGuardianById(reader(), networkId, userId, enrollmentId);
}

export function guardianEnrollmentsPage(
  networkId: string,
  userId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Enrollment>> {
  const sql = reader();
  return queryPage(
    page,
    size,
    () => enrollments.countOfGuardian(sql, networkId, userId),
    (range) => enrollments.ofGuardian(sql, networkId, userId, range),
  );
}
