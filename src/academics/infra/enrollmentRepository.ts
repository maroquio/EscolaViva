import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { INTERNAL_ERRORS } from '../constants';
import {
  isValidEnrollmentStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../domain/enrollment';

type EnrollmentRow = {
  id: string;
  network_id: string;
  student_id: string;
  student_name: string;
  class_group_id: string;
  class_group_name: string;
  school_id: string;
  academic_year_id: string;
  year: number;
  enrollment_date: string;
  status: string;
};

function toEnrollmentStatus(value: string): EnrollmentStatus {
  if (!isValidEnrollmentStatus(value)) {
    throw new Error(INTERNAL_ERRORS.unknownEnrollmentStatus(value));
  }
  return value;
}

const toEnrollment = (row: EnrollmentRow): Enrollment => ({
  id: row.id,
  networkId: row.network_id,
  studentId: row.student_id,
  studentName: row.student_name,
  classGroupId: row.class_group_id,
  classGroupName: row.class_group_name,
  schoolId: row.school_id,
  academicYearId: row.academic_year_id,
  year: row.year,
  enrollmentDate: row.enrollment_date,
  status: toEnrollmentStatus(row.status),
});

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
  const rows: EnrollmentRow[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${networkId} AND m.id = ${id}`;
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
  const rows: EnrollmentRow[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${networkId} AND m.class_group_id = ${classGroupId}
       AND m.status = 'active'
     ORDER BY a.name
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
  const rows: EnrollmentRow[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${networkId}
       AND m.student_id = ${studentId}
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     ORDER BY al.year DESC, m.enrollment_date DESC
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
      FROM enrollment m
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
     WHERE m.network_id = ${networkId}
       AND m.student_id = ${studentId}
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])`;
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
    SELECT t.school_id, count(*)::int AS total
      FROM enrollment m
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
     WHERE m.network_id = ${networkId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     GROUP BY t.school_id`;
  return new Map(rows.map((row): [string, number] => [row.school_id, row.total]));
}

export async function activeOfStudents(
  sql: Connection,
  networkId: string,
  studentIds: readonly string[],
  schoolIds: readonly string[],
): Promise<Enrollment[]> {
  if (studentIds.length === 0 || schoolIds.length === 0) return [];
  const rows: EnrollmentRow[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${networkId}
       AND m.status = 'active'
       AND m.student_id = ANY(${sql.array([...studentIds], 'TEXT')}::uuid[])
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     ORDER BY al.year DESC`;
  return rows.map(toEnrollment);
}

export async function ofGuardian(
  sql: Connection,
  networkId: string,
  guardianId: string,
  range?: Range,
): Promise<Enrollment[]> {
  const { limit, offset } = rangeParams(range);
  const rows: EnrollmentRow[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
      JOIN student_guardian av ON av.student_id = m.student_id AND av.network_id = m.network_id
     WHERE m.network_id = ${networkId} AND av.guardian_id = ${guardianId}
     ORDER BY al.year DESC, a.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toEnrollment);
}

export async function countOfGuardian(
  sql: Connection,
  networkId: string,
  guardianId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment m
      JOIN student_guardian av ON av.student_id = m.student_id AND av.network_id = m.network_id
     WHERE m.network_id = ${networkId} AND av.guardian_id = ${guardianId}`;
  return rows[0]?.total ?? 0;
}
