import { z } from 'zod';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, emptyPage, queryPage, type Page } from '../../shared/pagination';
import { systemClock } from '../../shared/ports';
import { isNetworkActive } from '../domain/network';
import { hasSessionExpired } from '../domain/session';
import type { School } from '../domain/school';
import { toAuthenticatedUser, type AuthenticatedUser, type UserSummary } from '../domain/user';
import * as networkRepository from '../infra/networkRepository';
import * as sessionRepository from '../infra/sessionRepository';
import * as schoolRepository from '../infra/schoolRepository';
import * as userRepository from '../infra/userRepository';

const uuidSchema = z.string().uuid();

const isUuid = (value: string): boolean => uuidSchema.safeParse(value).success;

export async function validSession(sessionId: string): Promise<AuthenticatedUser | null> {
  if (!isUuid(sessionId)) return null;
  const sql = reader();
  const found = await sessionRepository.byId(sql, sessionId);
  if (found === null) return null;

  const { session, network, user } = found;
  if (hasSessionExpired(session, systemClock.now())) return null;
  if (!isNetworkActive(network) || !user.active) return null;

  const roles = await userRepository.userRoles(sql, network.id, user.id);
  return toAuthenticatedUser(user, network, roles);
}

export async function listSchools(networkId: string): Promise<School[]> {
  if (!isUuid(networkId)) return [];
  return await schoolRepository.listByNetwork(reader(), networkId);
}

export async function schoolById(networkId: string, schoolId: string): Promise<School | null> {
  if (!isUuid(networkId) || !isUuid(schoolId)) return null;
  return await schoolRepository.byId(reader(), networkId, schoolId);
}

export async function schoolsPage(
  networkId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<School>> {
  if (!isUuid(networkId)) return emptyPage<School>(size);
  const sql = reader();
  return await queryPage(
    page,
    size,
    () => schoolRepository.countByNetwork(sql, networkId),
    (range) => schoolRepository.listByNetwork(sql, networkId, range),
  );
}

export async function listUsers(networkId: string): Promise<UserSummary[]> {
  if (!isUuid(networkId)) return [];
  return await userRepository.listSummaries(reader(), networkId);
}

export async function usersPage(
  networkId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<UserSummary>> {
  if (!isUuid(networkId)) return emptyPage<UserSummary>(size);
  const sql = reader();
  return await queryPage(
    page,
    size,
    () => userRepository.countByNetwork(sql, networkId),
    (range) => userRepository.listSummaries(sql, networkId, range),
  );
}

export async function countSchoolsAndUsers(
  networkId: string,
): Promise<{ schools: number; users: number }> {
  if (!isUuid(networkId)) return { schools: 0, users: 0 };
  const sql = reader();
  const [schools, users] = await Promise.all([
    schoolRepository.countByNetwork(sql, networkId),
    userRepository.countByNetwork(sql, networkId),
  ]);
  return { schools, users };
}

export async function networkBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string; status: string } | null> {
  return await networkRepository.bySlug(reader(), slug);
}

export async function isTeacherAtSchool(
  networkId: string,
  userId: string,
  schoolId: string,
): Promise<boolean> {
  if (!isUuid(networkId) || !isUuid(userId) || !isUuid(schoolId)) {
    return false;
  }
  return await userRepository.isTeacherAtSchool(reader(), networkId, userId, schoolId);
}

export async function schoolTeachers(
  networkId: string,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  if (!isUuid(networkId) || !isUuid(schoolId)) return [];
  return await userRepository.schoolTeachers(reader(), networkId, schoolId);
}

export async function userNames(
  networkId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!isUuid(networkId)) return new Map<string, string>();
  const valid = [...new Set(ids.filter(isUuid))];
  return await userRepository.namesByIds(reader(), networkId, valid);
}
