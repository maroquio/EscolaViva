import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { School } from '../domain/school';

type SchoolRow = {
  id: string;
  network_id: string;
  name: string;
  inep_code: string | null;
  active: boolean;
};

const toSchool = (row: SchoolRow): School => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
  inepCode: row.inep_code,
  active: row.active,
});

export async function listByNetwork(
  sql: Connection,
  networkId: string,
  range?: Range,
): Promise<School[]> {
  const { limit, offset } = rangeParams(range);
  const rows = await sql<SchoolRow[]>`
    SELECT id, network_id, name, inep_code, active
    FROM school
    WHERE network_id = ${networkId}
    ORDER BY name
    LIMIT ${limit}::int OFFSET ${offset}::int
  `;
  return rows.map(toSchool);
}

export async function countByNetwork(sql: Connection, networkId: string): Promise<number> {
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM school
    WHERE network_id = ${networkId}
  `;
  return rows[0]?.total ?? 0;
}

export async function byId(
  sql: Connection,
  networkId: string,
  schoolId: string,
): Promise<School | null> {
  const rows = await sql<SchoolRow[]>`
    SELECT id, network_id, name, inep_code, active
    FROM school
    WHERE network_id = ${networkId} AND id = ${schoolId}
  `;
  const row = rows[0];
  return row === undefined ? null : toSchool(row);
}

export async function nameExists(
  sql: Connection,
  networkId: string,
  name: string,
): Promise<boolean> {
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM school
    WHERE network_id = ${networkId} AND name = ${name}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function idsInNetwork(
  sql: Connection,
  networkId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set<string>();
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM school
    WHERE network_id = ${networkId} AND id IN ${sql(ids)}
  `;
  return new Set(rows.map((row) => row.id));
}

export async function insert(sql: Connection, school: School): Promise<void> {
  await sql`
    INSERT INTO school (id, network_id, name, inep_code, active)
    VALUES (${school.id}, ${school.networkId}, ${school.name}, ${school.inepCode}, ${school.active})
  `;
}
