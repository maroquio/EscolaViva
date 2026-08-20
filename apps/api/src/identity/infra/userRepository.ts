import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Role, RoleInSchool } from '../domain/role';
import type { User, UserContact, UserSummary } from '../domain/user';
import { toRoleInSchool, type RoleRow } from './userRoleAssignments';

export type UserRow = {
  id: string;
  network_id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  active: boolean;
};

export async function listSummaries(
  sql: Connection,
  networkId: string,
  role?: Role,
  range?: Range,
): Promise<UserSummary[]> {
  const { limit, offset } = rangeParams(range);
  const wanted = role ?? null;
  const users = await sql<UserRow[]>`
    SELECT id, network_id, name, email, cpf, phone, active
    FROM app_user u
    WHERE u.network_id = ${networkId}
      AND (${wanted}::text IS NULL OR EXISTS (
            SELECT 1 FROM user_role ur
            WHERE ur.network_id = u.network_id AND ur.user_id = u.id AND ur.role = ${wanted}))
    ORDER BY u.name
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
    phone: row.phone,
    active: row.active,
    roles: byUser.get(row.id) ?? [],
  }));
}

export async function countByNetwork(
  sql: Connection,
  networkId: string,
  role?: Role,
): Promise<number> {
  const wanted = role ?? null;
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM app_user u
    WHERE u.network_id = ${networkId}
      AND (${wanted}::text IS NULL OR EXISTS (
            SELECT 1 FROM user_role ur
            WHERE ur.network_id = u.network_id AND ur.user_id = u.id AND ur.role = ${wanted}))
  `;
  return rows[0]?.total ?? 0;
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

export async function contactsByIds(
  sql: Connection,
  networkId: string,
  ids: string[],
): Promise<Map<string, UserContact>> {
  if (ids.length === 0) return new Map<string, UserContact>();
  const rows = await sql<{ id: string; name: string; email: string; phone: string | null }[]>`
    SELECT id, name, email, phone
    FROM app_user
    WHERE network_id = ${networkId} AND id IN ${sql(ids)}
  `;
  return new Map(rows.map((row): [string, UserContact] => [row.id, row]));
}

export async function insertUnlessCpfTaken(
  sql: Connection,
  user: User,
  passwordHash: string,
): Promise<boolean> {
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO app_user (id, network_id, email, cpf, phone, password_hash, name, active)
    VALUES (
      ${user.id}, ${user.networkId}, ${user.email}, ${user.cpf}, ${user.phone}, ${passwordHash},
      ${user.name}, ${user.active}
    )
    ON CONFLICT ON CONSTRAINT user_cpf_unique_in_network DO NOTHING
    RETURNING id
  `;
  return inserted.length > 0;
}
