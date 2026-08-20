import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { uuidIdGenerator } from '../../shared/ports';
import type { AttendanceEntry, AttendanceTally, DayPresence } from '../domain/attendance';

type RowToSave = {
  enrollmentId: string;
  present: boolean;
  excuse: string | null;
};

export async function byEnrollmentsAndDate(
  sql: Connection,
  networkId: string,
  enrollmentIds: string[],
  date: string,
): Promise<Map<string, DayPresence>> {
  const rows: { enrollment_id: string; present: boolean; excuse: string | null }[] = await sql`
      SELECT enrollment_id, present, excuse
        FROM attendance
       WHERE network_id = ${networkId}
         AND enrollment_id = ANY(${sql.array(enrollmentIds, 'TEXT')}::uuid[])
         AND attendance_date = ${date}`;
  return new Map(
    rows.map((row): [string, DayPresence] => [
      row.enrollment_id,
      { present: row.present, excuse: row.excuse },
    ]),
  );
}

export async function byEnrollment(
  sql: Connection,
  networkId: string,
  enrollmentId: string,
  range?: Range,
): Promise<AttendanceEntry[]> {
  const { limit, offset } = rangeParams(range);
  const rows: { attendance_date: string; present: boolean; excuse: string | null }[] = await sql`
    SELECT to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date, present, excuse
      FROM attendance
     WHERE network_id = ${networkId}
       AND enrollment_id = ${enrollmentId}
     ORDER BY attendance_date DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map((row) => ({
    date: row.attendance_date,
    present: row.present,
    excuse: row.excuse,
  }));
}

export async function countByEnrollment(
  sql: Connection,
  networkId: string,
  enrollmentId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM attendance
     WHERE network_id = ${networkId} AND enrollment_id = ${enrollmentId}`;
  return rows[0]?.total ?? 0;
}

export async function tallyByEnrollment(
  sql: Connection,
  networkId: string,
  enrollmentId: string,
): Promise<AttendanceTally> {
  const rows: { total_days: number; present_days: number }[] = await sql`
    SELECT count(*)::int AS total_days,
           (count(*) FILTER (WHERE present))::int AS present_days
      FROM attendance
     WHERE network_id = ${networkId}
       AND enrollment_id = ${enrollmentId}`;
  const tallied = rows[0];
  if (tallied === undefined) return { totalDays: 0, presentDays: 0 };
  return { totalDays: tallied.total_days, presentDays: tallied.present_days };
}

export async function saveBatch(
  sql: Connection,
  rollCall: { networkId: string; date: string; rows: RowToSave[] },
): Promise<number> {
  const records = rollCall.rows.map((row) => ({
    id: uuidIdGenerator.next(),
    network_id: rollCall.networkId,
    enrollment_id: row.enrollmentId,
    attendance_date: rollCall.date,
    present: row.present,
    excuse: row.excuse,
  }));
  const saved: { id: string }[] = await sql`
    INSERT INTO attendance ${sql(records)}
    ON CONFLICT (enrollment_id, attendance_date)
    DO UPDATE SET present = EXCLUDED.present,
                  excuse = EXCLUDED.excuse
    RETURNING id`;
  return saved.length;
}
