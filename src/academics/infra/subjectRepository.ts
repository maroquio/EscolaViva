import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Subject } from '../domain/subject';

type SubjectRow = {
  id: string;
  network_id: string;
  name: string;
};

const toSubject = (row: SubjectRow): Subject => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
});

export async function insert(sql: Connection, subject: Subject): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO subject (id, network_id, name)
    VALUES (${subject.id}, ${subject.networkId}, ${subject.name})
    ON CONFLICT ON CONSTRAINT subject_unique_in_network DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<Subject | null> {
  const rows: SubjectRow[] = await sql`
    SELECT id, network_id, name
      FROM subject
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toSubject(row);
}

export async function list(sql: Connection, networkId: string, range?: Range): Promise<Subject[]> {
  const { limit, offset } = rangeParams(range);
  const rows: SubjectRow[] = await sql`
    SELECT id, network_id, name
      FROM subject
     WHERE network_id = ${networkId}
     ORDER BY name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toSubject);
}

export async function count(sql: Connection, networkId: string): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM subject WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}
