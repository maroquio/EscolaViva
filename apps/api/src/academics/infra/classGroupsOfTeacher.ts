import type { Connection } from '../../shared/db';
import type { ClassGroup, TeacherClassGroupSubject } from '../domain/classGroup';
import { toClassGroup, toShift, type ClassGroupRow } from './classGroupRow';
import { toClassGroupSubject, type ClassGroupSubjectRow } from './classGroupSubjects';

type TeacherClassGroupSubjectRow = ClassGroupSubjectRow & {
  class_group_name: string;
  grade_level: string;
  shift: string;
  school_id: string;
};

const toTeacherClassGroupSubject = (
  row: TeacherClassGroupSubjectRow,
): TeacherClassGroupSubject => ({
  ...toClassGroupSubject(row),
  classGroupName: row.class_group_name,
  gradeLevel: row.grade_level,
  shift: toShift(row.shift),
  schoolId: row.school_id,
});

export async function teacherSubjects(
  sql: Connection,
  networkId: string,
  teacherUserId: string,
): Promise<TeacherClassGroupSubject[]> {
  const rows: TeacherClassGroupSubjectRow[] = await sql`
    SELECT cgs.id, cgs.network_id, cgs.class_group_id, cgs.subject_id, sub.name AS subject_name,
           cgs.teacher_user_id, cg.name AS class_group_name, cg.grade_level, cg.shift, cg.school_id
      FROM class_group_subject cgs
      JOIN subject sub ON sub.id = cgs.subject_id AND sub.network_id = cgs.network_id
      JOIN class_group cg ON cg.id = cgs.class_group_id AND cg.network_id = cgs.network_id
     WHERE cgs.network_id = ${networkId} AND cgs.teacher_user_id = ${teacherUserId}
     ORDER BY cg.grade_level, cg.name, sub.name`;
  return rows.map(toTeacherClassGroupSubject);
}

export async function ofTeacher(
  sql: Connection,
  networkId: string,
  teacherUserId: string,
): Promise<ClassGroup[]> {
  const rows: ClassGroupRow[] = await sql`
    SELECT DISTINCT cg.id, cg.network_id, cg.school_id, cg.academic_year_id, cg.name, cg.grade_level,
           cg.shift
      FROM class_group cg
      JOIN class_group_subject cgs ON cgs.class_group_id = cg.id AND cgs.network_id = cg.network_id
     WHERE cg.network_id = ${networkId} AND cgs.teacher_user_id = ${teacherUserId}
     ORDER BY cg.grade_level, cg.name`;
  return rows.map(toClassGroup);
}
