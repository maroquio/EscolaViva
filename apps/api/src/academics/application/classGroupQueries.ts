import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { ClassGroup, ClassGroupSubject } from '../domain/classGroup';
import * as classGroups from '../infra/classGroupRepository';
import type { ClassGroupFilter } from '../infra/classGroupRepository';

export type { ClassGroupFilter } from '../infra/classGroupRepository';

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

export function countClassGroups(networkId: string, filter?: ClassGroupFilter): Promise<number> {
  return classGroups.count(reader(), networkId, filter);
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
