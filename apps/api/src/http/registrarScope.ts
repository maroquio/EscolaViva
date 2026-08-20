import type { Context } from 'hono';
import { academics, type ClassGroup } from '../academics';
import { ROLE } from '../identity';
import { LOCALE } from '../shared/constants';
import { currentNetwork, currentUser, isUuid, type Variables } from '../shared/http';

export const RECORD_OUT_OF_SCOPE = 'record beyond the registrar scope';

export type RegistrarContext = Context<{ Variables: Variables }>;

export type SchoolInScope = {
  readonly id: string;
  readonly name: string;
};

const byName = (a: SchoolInScope, b: SchoolInScope): number =>
  a.name.localeCompare(b.name, LOCALE);

export const registrarSchools = (c: RegistrarContext): SchoolInScope[] => {
  const nameById = new Map<string, string>();
  for (const assignment of currentUser(c).roles) {
    if (assignment.role === ROLE.registrar) {
      nameById.set(assignment.schoolId, assignment.schoolName);
    }
  }
  return [...nameById].map(([id, name]) => ({ id, name })).sort(byName);
};

export const idsOf = (schools: readonly SchoolInScope[]): string[] =>
  schools.map(({ id }) => id);

export const namesOf = (schools: readonly SchoolInScope[]): ReadonlyMap<string, string> =>
  new Map(schools.map(({ id, name }) => [id, name]));

export const classGroupInScope = async (
  c: RegistrarContext,
  classGroupId: string,
): Promise<ClassGroup | null> => {
  if (!isUuid(classGroupId)) return null;
  const classGroup = await academics.classGroupById(currentNetwork(c), classGroupId);
  if (classGroup === null) return null;
  return registrarSchools(c).some(({ id }) => id === classGroup.schoolId) ? classGroup : null;
};
