import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { INTERNAL_ERRORS } from '../constants';
import {
  isValidShift,
  type ClassGroup,
  type ClassGroupSubject,
  type TeacherClassGroupSubject,
  type Shift,
} from '../domain/classGroup';

type ClassGroupRow = {
  id: string;
  network_id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  grade_level: string;
  shift: string;
};

type ClassGroupSubjectRow = {
  id: string;
  network_id: string;
  class_group_id: string;
  subject_id: string;
  subject_name: string;
  teacher_user_id: string;
};

type TeacherClassGroupSubjectRow = ClassGroupSubjectRow & {
  class_group_name: string;
  grade_level: string;
  shift: string;
  school_id: string;
};

function toShift(value: string): Shift {
  if (!isValidShift(value)) throw new Error(INTERNAL_ERRORS.unknownShift(value));
  return value;
}

const toClassGroup = (row: ClassGroupRow): ClassGroup => ({
  id: row.id,
  networkId: row.network_id,
  schoolId: row.school_id,
  academicYearId: row.academic_year_id,
  name: row.name,
  gradeLevel: row.grade_level,
  shift: toShift(row.shift),
});

const toClassGroupSubject = (row: ClassGroupSubjectRow): ClassGroupSubject => ({
  id: row.id,
  networkId: row.network_id,
  classGroupId: row.class_group_id,
  subjectId: row.subject_id,
  subjectName: row.subject_name,
  teacherUserId: row.teacher_user_id,
});

const toTeacherClassGroupSubject = (
  row: TeacherClassGroupSubjectRow,
): TeacherClassGroupSubject => ({
  ...toClassGroupSubject(row),
  classGroupName: row.class_group_name,
  gradeLevel: row.grade_level,
  shift: toShift(row.shift),
  schoolId: row.school_id,
});

export async function insert(sql: Connection, classGroup: ClassGroup): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO class_group (id, network_id, school_id, academic_year_id, name, grade_level, shift)
    VALUES (${classGroup.id}, ${classGroup.networkId}, ${classGroup.schoolId},
            ${classGroup.academicYearId},
            ${classGroup.name}, ${classGroup.gradeLevel}, ${classGroup.shift})
    ON CONFLICT ON CONSTRAINT class_group_unique DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<ClassGroup | null> {
  const rows: ClassGroupRow[] = await sql`
    SELECT id, network_id, school_id, academic_year_id, name, grade_level, shift
      FROM class_group
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toClassGroup(row);
}

export type ClassGroupFilter = {
  schoolId?: string;
  schoolIds?: readonly string[];
  academicYearId?: string;
};

const filterConditions = (sql: Connection, filter?: ClassGroupFilter) => ({
  schoolId: filter?.schoolId ?? null,
  schoolIds: filter?.schoolIds === undefined ? null : sql.array([...filter.schoolIds], 'TEXT'),
  academicYearId: filter?.academicYearId ?? null,
});

export async function list(
  sql: Connection,
  networkId: string,
  filter?: ClassGroupFilter,
  range?: Range,
): Promise<ClassGroup[]> {
  const { schoolId, schoolIds, academicYearId } = filterConditions(sql, filter);
  const { limit, offset } = rangeParams(range);
  const rows: ClassGroupRow[] = await sql`
    SELECT id, network_id, school_id, academic_year_id, name, grade_level, shift
      FROM class_group
     WHERE network_id = ${networkId}
       AND (${schoolId}::uuid IS NULL OR school_id = ${schoolId}::uuid)
       AND (${schoolIds}::uuid[] IS NULL OR school_id = ANY(${schoolIds}::uuid[]))
       AND (${academicYearId}::uuid IS NULL OR academic_year_id = ${academicYearId}::uuid)
     ORDER BY grade_level, name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toClassGroup);
}

export async function count(
  sql: Connection,
  networkId: string,
  filter?: ClassGroupFilter,
): Promise<number> {
  const { schoolId, schoolIds, academicYearId } = filterConditions(sql, filter);
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM class_group
     WHERE network_id = ${networkId}
       AND (${schoolId}::uuid IS NULL OR school_id = ${schoolId}::uuid)
       AND (${schoolIds}::uuid[] IS NULL OR school_id = ANY(${schoolIds}::uuid[]))
       AND (${academicYearId}::uuid IS NULL OR academic_year_id = ${academicYearId}::uuid)`;
  return rows[0]?.total ?? 0;
}

export async function countBySchool(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, number>> {
  if (schoolIds.length === 0) return new Map<string, number>();
  const rows: { school_id: string; total: number }[] = await sql`
    SELECT school_id, count(*)::int AS total
      FROM class_group
     WHERE network_id = ${networkId}
       AND school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     GROUP BY school_id`;
  return new Map(rows.map((row): [string, number] => [row.school_id, row.total]));
}

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
  const rows: ClassGroupSubjectRow[] = await sql`
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
     WHERE td.network_id = ${networkId} AND td.id = ${id}`;
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
  const rows: ClassGroupSubjectRow[] = await sql`
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
     WHERE td.network_id = ${networkId} AND td.class_group_id = ${classGroupId}
     ORDER BY d.name
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

export async function teacherSubjects(
  sql: Connection,
  networkId: string,
  teacherUserId: string,
): Promise<TeacherClassGroupSubject[]> {
  const rows: TeacherClassGroupSubjectRow[] = await sql`
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id, t.name AS class_group_name, t.grade_level, t.shift, t.school_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
      JOIN class_group t ON t.id = td.class_group_id AND t.network_id = td.network_id
     WHERE td.network_id = ${networkId} AND td.teacher_user_id = ${teacherUserId}
     ORDER BY t.grade_level, t.name, d.name`;
  return rows.map(toTeacherClassGroupSubject);
}

export async function ofTeacher(
  sql: Connection,
  networkId: string,
  teacherUserId: string,
): Promise<ClassGroup[]> {
  const rows: ClassGroupRow[] = await sql`
    SELECT DISTINCT t.id, t.network_id, t.school_id, t.academic_year_id, t.name, t.grade_level,
           t.shift
      FROM class_group t
      JOIN class_group_subject td ON td.class_group_id = t.id AND td.network_id = t.network_id
     WHERE t.network_id = ${networkId} AND td.teacher_user_id = ${teacherUserId}
     ORDER BY t.grade_level, t.name`;
  return rows.map(toClassGroup);
}
