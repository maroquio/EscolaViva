import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { ROLE } from '../constants';
import { toRole, type Role, type RoleInSchool } from '../domain/role';
import type { User, UserSummary } from '../domain/user';

export type Credentials = { user: User; passwordHash: string };

type UserRow = {
  id: string;
  network_id: string;
  name: string;
  email: string;
  cpf: string;
  active: boolean;
  guardian_id: string | null;
};

type CredentialsRow = UserRow & { password_hash: string };

type RoleRow = { school_id: string; school_name: string; role: string };

const toUser = (row: UserRow): User => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
  email: row.email,
  cpf: row.cpf,
  active: row.active,
  guardianId: row.guardian_id,
});

const toRoleInSchool = (row: RoleRow): RoleInSchool => ({
  schoolId: row.school_id,
  schoolName: row.school_name,
  role: toRole(row.role),
});

export async function credentialsByCpf(
  sql: Connection,
  networkId: string,
  cpf: string,
): Promise<Credentials | null> {
  const rows = await sql<CredentialsRow[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id, password_hash
    FROM app_user
    WHERE network_id = ${networkId} AND cpf = ${cpf} AND active
  `;
  const row = rows[0];
  return row === undefined ? null : { user: toUser(row), passwordHash: row.password_hash };
}

export async function credentialsById(
  sql: Connection,
  userId: string,
): Promise<Credentials | null> {
  const rows = await sql<CredentialsRow[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id, password_hash
    FROM app_user
    WHERE id = ${userId} AND active
  `;
  const row = rows[0];
  return row === undefined ? null : { user: toUser(row), passwordHash: row.password_hash };
}

export async function userRoles(
  sql: Connection,
  networkId: string,
  userId: string,
): Promise<RoleInSchool[]> {
  const rows = await sql<RoleRow[]>`
    SELECT ur.school_id, s.name AS school_name, ur.role
    FROM user_role ur
    JOIN school s ON s.id = ur.school_id AND s.network_id = ur.network_id
    WHERE ur.network_id = ${networkId} AND ur.user_id = ${userId}
    ORDER BY s.name, ur.role
  `;
  return rows.map(toRoleInSchool);
}

export async function listSummaries(
  sql: Connection,
  networkId: string,
  range?: Range,
): Promise<UserSummary[]> {
  const { limit, offset } = rangeParams(range);
  const users = await sql<UserRow[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id
    FROM app_user
    WHERE network_id = ${networkId}
    ORDER BY name
    LIMIT ${limit}::int OFFSET ${offset}::int
  `;
  if (users.length === 0) return [];

  const ids = users.map((row) => row.id);
  const roles = await sql<(RoleRow & { user_id: string })[]>`
    SELECT ur.user_id, ur.school_id, s.name AS school_name, ur.role
    FROM user_role ur
    JOIN school s ON s.id = ur.school_id AND s.network_id = ur.network_id
    WHERE ur.network_id = ${networkId} AND ur.user_id IN ${sql(ids)}
    ORDER BY s.name, ur.role
  `;

  const byUser = new Map<string, RoleInSchool[]>();
  for (const row of roles) {
    const accumulated = byUser.get(row.user_id) ?? [];
    byUser.set(row.user_id, [...accumulated, toRoleInSchool(row)]);
  }

  return users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    active: row.active,
    roles: byUser.get(row.id) ?? [],
  }));
}

export async function countByNetwork(sql: Connection, networkId: string): Promise<number> {
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM app_user
    WHERE network_id = ${networkId}
  `;
  return rows[0]?.total ?? 0;
}

export async function emailExists(
  sql: Connection,
  networkId: string,
  email: string,
): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM app_user
    WHERE network_id = ${networkId} AND email = ${email}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function cpfExists(sql: Connection, networkId: string, cpf: string): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM app_user
    WHERE network_id = ${networkId} AND cpf = ${cpf}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function isTeacherAtSchool(
  sql: Connection,
  networkId: string,
  userId: string,
  schoolId: string,
): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM user_role
    WHERE network_id = ${networkId}
      AND user_id = ${userId}
      AND school_id = ${schoolId}
      AND role = ${ROLE.teacher}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function schoolTeachers(
  sql: Connection,
  networkId: string,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT u.id, u.name
    FROM app_user u
    JOIN user_role ur ON ur.user_id = u.id AND ur.network_id = u.network_id
    WHERE u.network_id = ${networkId}
      AND ur.school_id = ${schoolId}
      AND ur.role = ${ROLE.teacher}
      AND u.active
    ORDER BY u.name
  `;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function namesByIds(
  sql: Connection,
  networkId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM app_user
    WHERE network_id = ${networkId} AND id IN ${sql(ids)}
  `;
  return new Map(rows.map((row): [string, string] => [row.id, row.name]));
}

export async function insert(sql: Connection, user: User, passwordHash: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, network_id, email, cpf, password_hash, name, active, guardian_id)
    VALUES (
      ${user.id}, ${user.networkId}, ${user.email}, ${user.cpf}, ${passwordHash},
      ${user.name}, ${user.active}, ${user.guardianId}
    )
  `;
}

export async function insertRoles(
  sql: Connection,
  networkId: string,
  userId: string,
  roleAssignments: { schoolId: string; role: Role }[],
): Promise<void> {
  for (const roleAssignment of roleAssignments) {
    await sql`
      INSERT INTO user_role (network_id, user_id, school_id, role)
      VALUES (${networkId}, ${userId}, ${roleAssignment.schoolId}, ${roleAssignment.role})
    `;
  }
}

export async function updatePassword(
  sql: Connection,
  networkId: string,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await sql`
    UPDATE app_user
    SET password_hash = ${passwordHash}
    WHERE network_id = ${networkId} AND id = ${userId}
  `;
}
