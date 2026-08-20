import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { AcademicYear } from '../domain/academicYear';
import * as academicYears from '../infra/academicYearRepository';

export function listAcademicYears(networkId: string): Promise<AcademicYear[]> {
  return academicYears.list(reader(), networkId);
}

export function academicYearById(
  networkId: string,
  academicYearId: string,
): Promise<AcademicYear | null> {
  return academicYears.byId(reader(), networkId, academicYearId);
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
