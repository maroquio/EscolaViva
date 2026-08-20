import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { ClassGroupSubject } from '../domain/classGroup';

export type ClassGroupSubjectRow = {
  id: string;
  network_id: string;
  class_group_id: string;
  subject_id: string;
  subject_name: string;
  teacher_user_id: string;
};

export const toClassGroupSubject = (row: ClassGroupSubjectRow): ClassGroupSubject => ({
  id: row.id,
  networkId: row.network_id,
  classGroupId: row.class_group_id,
  subjectId: row.subject_id,
  subjectName: row.subject_name,
  teacherUserId: row.teacher_user_id,
});

const classGroupSubjectsWithName = (sql: Connection) => sql`
    SELECT cgs.id, cgs.network_id, cgs.class_group_id, cgs.subject_id, sub.name AS subject_name,
           cgs.teacher_user_id
      FROM class_group_subject cgs
      JOIN subject sub ON sub.id = cgs.subject_id AND sub.network_id = cgs.network_id`;

export async function insertSubject(
  sql: Connection,
  assignment: ClassGroupSubject,
): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO class_group_subject (id, network_id, class_group_id, subject_id, teacher_user_id)
    VALUES (${assignment.id}, ${assignment.networkId}, ${assignment.classGroupId},
            ${assignment.subjectId}, ${assignment.teacherUserId})
    ON CONFLICT ON CONSTRAINT subject_unique_in_class_group DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function subjectById(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<ClassGroupSubject | null> {
  const rows: ClassGroupSubjectRow[] = await sql`${classGroupSubjectsWithName(sql)}
     WHERE cgs.network_id = ${networkId} AND cgs.id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toClassGroupSubject(row);
}

export async function listSubjects(
  sql: Connection,
  networkId: string,
  classGroupId: string,
  range?: Range,
): Promise<ClassGroupSubject[]> {
  const { limit, offset } = rangeParams(range);
  const rows: ClassGroupSubjectRow[] = await sql`${classGroupSubjectsWithName(sql)}
     WHERE cgs.network_id = ${networkId} AND cgs.class_group_id = ${classGroupId}
     ORDER BY sub.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toClassGroupSubject);
}

export async function countSubjects(
  sql: Connection,
  networkId: string,
  classGroupId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM class_group_subject
     WHERE network_id = ${networkId} AND class_group_id = ${classGroupId}`;
  return rows[0]?.total ?? 0;
}
