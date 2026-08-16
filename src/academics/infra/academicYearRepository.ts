import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { AcademicYear } from '../domain/academicYear';

type AcademicYearRow = {
  id: string;
  network_id: string;
  year: number;
  start_date: string;
  end_date: string;
};

const toAcademicYear = (row: AcademicYearRow): AcademicYear => ({
  id: row.id,
  networkId: row.network_id,
  year: row.year,
  startDate: row.start_date,
  endDate: row.end_date,
});

export async function insert(sql: Connection, academicYear: AcademicYear): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO academic_year (id, network_id, year, start_date, end_date)
    VALUES (${academicYear.id}, ${academicYear.networkId}, ${academicYear.year},
            ${academicYear.startDate}, ${academicYear.endDate})
    ON CONFLICT ON CONSTRAINT year_unique_in_network DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<AcademicYear | null> {
  const rows: AcademicYearRow[] = await sql`
    SELECT id, network_id, year,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM academic_year
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toAcademicYear(row);
}

export async function list(
  sql: Connection,
  networkId: string,
  range?: Range,
): Promise<AcademicYear[]> {
  const { limit, offset } = rangeParams(range);
  const rows: AcademicYearRow[] = await sql`
    SELECT id, network_id, year,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM academic_year
     WHERE network_id = ${networkId}
     ORDER BY year DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toAcademicYear);
}

export async function count(sql: Connection, networkId: string): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM academic_year WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}
