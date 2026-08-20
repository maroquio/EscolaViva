import type { Connection } from '../../shared/db';
import { ROLE } from '../constants';
import { toRole, type Role, type RoleInSchool } from '../domain/role';

export type RoleRow = { school_id: string; school_name: string; role: string };

export const toRoleInSchool = (row: RoleRow): RoleInSchool => ({
  schoolId: row.school_id,
  schoolName: row.school_name,
  role: toRole(row.role),
});

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

export async function hasRoleInNetwork(
  sql: Connection,
  networkId: string,
  userId: string,
  role: Role,
): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM user_role
    WHERE network_id = ${networkId} AND user_id = ${userId} AND role = ${role}
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

export async function insertRoles(
  sql: Connection,
  networkId: string,
  userId: string,
  roleAssignments: { schoolId: string; role: Role }[],
): Promise<void> {
  if (roleAssignments.length === 0) return;
  const rows = roleAssignments.map((roleAssignment) => ({
    network_id: networkId,
    user_id: userId,
    school_id: roleAssignment.schoolId,
    role: roleAssignment.role,
  }));
  await sql`INSERT INTO user_role ${sql(rows)}`;
}
