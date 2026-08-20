import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Student } from '../domain/student';
import * as students from '../infra/studentRepository';

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

export function studentById(networkId: string, studentId: string): Promise<Student | null> {
  return students.byId(reader(), networkId, studentId);
}
