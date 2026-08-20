import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Subject } from '../domain/subject';
import * as subjects from '../infra/subjectRepository';

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
