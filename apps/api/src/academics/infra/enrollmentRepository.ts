import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Enrollment } from '../domain/enrollment';
import { enrollmentsWithContext, toEnrollment, type EnrollmentRow } from './enrollmentRow';

export { countOfGuardian, ofGuardian, ofGuardianById } from './enrollmentsOfGuardian';

export async function insert(sql: Connection, enrollment: Enrollment): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO enrollment (id, network_id, student_id, class_group_id, academic_year_id,
                            enrollment_date, status)
    VALUES (${enrollment.id}, ${enrollment.networkId}, ${enrollment.studentId},
            ${enrollment.classGroupId},
            ${enrollment.academicYearId}, ${enrollment.enrollmentDate}, ${enrollment.status})
    ON CONFLICT (student_id, academic_year_id) WHERE status = 'active' DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function markAsTransferred(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<boolean> {
  const updated: { id: string }[] = await sql`
    UPDATE enrollment
       SET status = 'transferred'
     WHERE network_id = ${networkId} AND id = ${id} AND status = 'active'
     RETURNING id`;
  return updated.length === 1;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<Enrollment | null> {
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
     WHERE enr.network_id = ${networkId} AND enr.id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toEnrollment(row);
}

export async function activeOfClassGroup(
  sql: Connection,
  networkId: string,
  classGroupId: string,
  range?: Range,
): Promise<Enrollment[]> {
  const { limit, offset } = rangeParams(range);
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
     WHERE enr.network_id = ${networkId} AND enr.class_group_id = ${classGroupId}
       AND enr.status = 'active'
     ORDER BY stu.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toEnrollment);
}

export async function countActiveOfClassGroup(
  sql: Connection,
  networkId: string,
  classGroupId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment
     WHERE network_id = ${networkId} AND class_group_id = ${classGroupId} AND status = 'active'`;
  return rows[0]?.total ?? 0;
}

export async function ofStudentInSchools(
  sql: Connection,
  networkId: string,
  studentId: string,
  schoolIds: readonly string[],
  range?: Range,
): Promise<Enrollment[]> {
  if (schoolIds.length === 0) return [];
  const { limit, offset } = rangeParams(range);
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
     WHERE enr.network_id = ${networkId}
       AND enr.student_id = ${studentId}
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     ORDER BY ay.year DESC, enr.enrollment_date DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toEnrollment);
}

export async function countOfStudentInSchools(
  sql: Connection,
  networkId: string,
  studentId: string,
  schoolIds: readonly string[],
): Promise<number> {
  if (schoolIds.length === 0) return 0;
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment enr
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = enr.network_id
     WHERE enr.network_id = ${networkId}
       AND enr.student_id = ${studentId}
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])`;
  return rows[0]?.total ?? 0;
}

export async function hasAnyEnrollment(
  sql: Connection,
  networkId: string,
  studentId: string,
): Promise<boolean> {
  const rows: { found: number }[] = await sql`
    SELECT 1 AS found
      FROM enrollment
     WHERE network_id = ${networkId} AND student_id = ${studentId}
     LIMIT 1`;
  return rows.length > 0;
}

export async function countActiveBySchool(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, number>> {
  if (schoolIds.length === 0) return new Map<string, number>();
  const rows: { school_id: string; total: number }[] = await sql`
    SELECT cg.school_id, count(*)::int AS total
      FROM enrollment enr
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = enr.network_id
     WHERE enr.network_id = ${networkId}
       AND enr.status = 'active'
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     GROUP BY cg.school_id`;
  return new Map(rows.map((row): [string, number] => [row.school_id, row.total]));
}

export async function activeOfStudents(
  sql: Connection,
  networkId: string,
  studentIds: readonly string[],
  schoolIds: readonly string[],
): Promise<Enrollment[]> {
  if (studentIds.length === 0 || schoolIds.length === 0) return [];
  const rows: EnrollmentRow[] = await sql`${enrollmentsWithContext(sql)}
     WHERE enr.network_id = ${networkId}
       AND enr.status = 'active'
       AND enr.student_id = ANY(${sql.array([...studentIds], 'TEXT')}::uuid[])
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     ORDER BY ay.year DESC`;
  return rows.map(toEnrollment);
}

export async function countActiveByAcademicYear(
  sql: Connection,
  networkId: string,
  academicYearId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment
     WHERE network_id = ${networkId}
       AND academic_year_id = ${academicYearId}
       AND status = 'active'`;
  return rows[0]?.total ?? 0;
}
