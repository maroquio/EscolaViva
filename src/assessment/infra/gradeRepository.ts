import type { Connection } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';

export type EnrollmentGrade = { classGroupSubjectId: string; term: number; value: number };

export type GradeToSave = { enrollmentId: string; value: number };

export async function byClassGroupSubjectAndTerm(
  sql: Connection,
  networkId: string,
  classGroupSubjectId: string,
  term: number,
): Promise<Map<string, number>> {
  const rows: { enrollment_id: string; value: number }[] = await sql`
    SELECT enrollment_id, value::float8 AS value
      FROM grade
     WHERE network_id = ${networkId}
       AND class_group_subject_id = ${classGroupSubjectId}
       AND term = ${term}`;
  return new Map(rows.map((row): [string, number] => [row.enrollment_id, row.value]));
}

export async function byEnrollment(
  sql: Connection,
  networkId: string,
  enrollmentId: string,
): Promise<EnrollmentGrade[]> {
  const rows: { class_group_subject_id: string; term: number; value: number }[] = await sql`
    SELECT class_group_subject_id, term, value::float8 AS value
      FROM grade
     WHERE network_id = ${networkId}
       AND enrollment_id = ${enrollmentId}`;
  return rows.map((row) => ({
    classGroupSubjectId: row.class_group_subject_id,
    term: row.term,
    value: row.value,
  }));
}

export async function countBySubject(
  sql: Connection,
  networkId: string,
  classGroupSubjectIds: string[],
  term: number,
  enrollmentIds: string[],
): Promise<Map<string, number>> {
  const rows: { class_group_subject_id: string; total: number }[] = await sql`
    SELECT class_group_subject_id, count(*)::int AS total
      FROM grade
     WHERE network_id = ${networkId}
       AND class_group_subject_id = ANY(${sql.array(classGroupSubjectIds, 'TEXT')}::uuid[])
       AND term = ${term}
       AND enrollment_id = ANY(${sql.array(enrollmentIds, 'TEXT')}::uuid[])
     GROUP BY class_group_subject_id`;
  return new Map(rows.map((row): [string, number] => [row.class_group_subject_id, row.total]));
}

export async function saveBatch(
  sql: Connection,
  posting: {
    networkId: string;
    classGroupSubjectId: string;
    term: number;
    postedBy: string;
    grades: GradeToSave[];
  },
): Promise<number> {
  const rows = posting.grades.map((grade) => ({
    id: uuidIdGenerator.next(),
    network_id: posting.networkId,
    enrollment_id: grade.enrollmentId,
    class_group_subject_id: posting.classGroupSubjectId,
    term: posting.term,
    value: grade.value,
    posted_by: posting.postedBy,
  }));
  const saved: { id: string }[] = await sql`
    INSERT INTO grade ${sql(rows)}
    ON CONFLICT (enrollment_id, class_group_subject_id, term)
    DO UPDATE SET value = EXCLUDED.value,
                  posted_by = EXCLUDED.posted_by,
                  posted_at = now()
    RETURNING id`;
  return saved.length;
}

export async function deleteBatch(
  sql: Connection,
  networkId: string,
  classGroupSubjectId: string,
  term: number,
  enrollmentIds: string[],
): Promise<number> {
  const deleted: { id: string }[] = await sql`
    DELETE FROM grade
     WHERE network_id = ${networkId}
       AND class_group_subject_id = ${classGroupSubjectId}
       AND term = ${term}
       AND enrollment_id = ANY(${sql.array(enrollmentIds, 'TEXT')}::uuid[])
    RETURNING id`;
  return deleted.length;
}
