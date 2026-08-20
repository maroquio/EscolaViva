import type { Connection } from '../../shared/db';
import type { Range } from '../../shared/pagination';
import { LIMITS } from '../constants';
import type { Student } from '../domain/student';

type StudentRow = {
  id: string;
  network_id: string;
  name: string;
  birth_date: string;
};

const toStudent = (row: StudentRow): Student => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
  birthDate: row.birth_date,
});

const escapeWildcards = (term: string): string =>
  term.replace(/[\\%_]/g, (character) => `\\${character}`);

export async function insert(sql: Connection, student: Student): Promise<void> {
  await sql`
    INSERT INTO student (id, network_id, name, birth_date)
    VALUES (${student.id}, ${student.networkId}, ${student.name}, ${student.birthDate})`;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<Student | null> {
  const rows: StudentRow[] = await sql`
    SELECT id, network_id, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
      FROM student
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toStudent(row);
}

export async function search(
  sql: Connection,
  networkId: string,
  term: string,
  range?: Range,
): Promise<Student[]> {
  const pattern = `%${escapeWildcards(term.trim())}%`;
  const rows: StudentRow[] = await sql`
    SELECT id, network_id, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
      FROM student
     WHERE network_id = ${networkId} AND name ILIKE ${pattern}
     ORDER BY name
     LIMIT ${range?.limit ?? LIMITS.student.searchRows} OFFSET ${range?.offset ?? 0}`;
  return rows.map(toStudent);
}

export async function countSearch(
  sql: Connection,
  networkId: string,
  term: string,
): Promise<number> {
  const pattern = `%${escapeWildcards(term.trim())}%`;
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM student
     WHERE network_id = ${networkId} AND name ILIKE ${pattern}`;
  return rows[0]?.total ?? 0;
}
