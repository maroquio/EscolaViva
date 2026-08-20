import type { Context } from 'hono';
import { academics } from '../../academics';
import { ROLE, identity, type School } from '../../identity';
import { LOCALE, MISSING_VALUE } from '../../shared/constants';
import { NotFound, hasRole, schoolsForRole, type SessionUser } from '../../shared/http';
import { PARAMS } from '../constants';
import { DIAGNOSTICS } from './constants';
import type { Recipient } from '../presenters/announcements';

type SendContext = {
  school: School | null;
  guardians: Recipient[];
};

export const requestedSchool = (c: Context): string => c.req.query(PARAMS.schoolId) ?? '';

export const userSchools = async (
  networkId: string,
  user: SessionUser,
  seesWholeNetwork: boolean,
): Promise<School[]> => {
  const schools = await identity.listSchools(networkId);
  if (seesWholeNetwork) return schools;
  const allowed = new Set(schoolsForRole(user, ROLE.registrar));
  return schools.filter((school) => allowed.has(school.id));
};

export const listScope = (
  schools: readonly School[],
  requested: string,
  seesWholeNetwork: boolean,
): string | null => {
  if (requested !== '') {
    if (!schools.some((school) => school.id === requested)) {
      throw new NotFound(DIAGNOSTICS.schoolOutOfScope);
    }
    return requested;
  }
  if (seesWholeNetwork) return null;
  return schools[0]?.id ?? null;
};

const schoolGuardians = async (
  networkId: string,
  school: School | null,
): Promise<Recipient[]> => {
  if (school === null) return [];
  const ids = await academics.schoolGuardians(networkId, school.id);
  const names = await identity.userNames(networkId, ids);
  return ids
    .map((id) => ({ id, name: names.get(id) ?? MISSING_VALUE }))
    .sort((a, b) => a.name.localeCompare(b.name, LOCALE));
};

export const sendContext = async (
  networkId: string,
  user: SessionUser,
  requestedSchoolId: string,
): Promise<SendContext> => {
  const all = await userSchools(networkId, user, hasRole(user, ROLE.networkAdmin));
  const schools = all.filter((school) => school.active);
  const school = schools.find((item) => item.id === requestedSchoolId) ?? null;
  if (requestedSchoolId !== '' && school === null) {
    throw new NotFound(DIAGNOSTICS.schoolOutOfScope);
  }
  return { school, guardians: await schoolGuardians(networkId, school) };
};
