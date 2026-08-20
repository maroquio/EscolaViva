import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Enrollment } from '../domain/enrollment';
import { enrollmentsWithContext, toEnrollment, type EnrollmentRow } from './enrollmentRow';

export async function ofGuardian(
  sql: Connection,
  networkId: string,
  userId: string,
  range?: Range,
): Promise<Enrollment[]> {
  const { limit, offset } = rangeParams(range);
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
      JOIN student_guardian sg ON sg.student_id = enr.student_id AND sg.network_id = enr.network_id
     WHERE enr.network_id = ${networkId} AND sg.user_id = ${userId}
     ORDER BY ay.year DESC, stu.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toEnrollment);
}

export async function ofGuardianById(
  sql: Connection,
  networkId: string,
  userId: string,
  id: string,
): Promise<Enrollment | null> {
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
      JOIN student_guardian sg ON sg.student_id = enr.student_id AND sg.network_id = enr.network_id
     WHERE enr.network_id = ${networkId} AND sg.user_id = ${userId} AND enr.id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toEnrollment(row);
}

export async function countOfGuardian(
  sql: Connection,
  networkId: string,
  userId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment enr
      JOIN student_guardian sg ON sg.student_id = enr.student_id AND sg.network_id = enr.network_id
     WHERE enr.network_id = ${networkId} AND sg.user_id = ${userId}`;
  return rows[0]?.total ?? 0;
}
