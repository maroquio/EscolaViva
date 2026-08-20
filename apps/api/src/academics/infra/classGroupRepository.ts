import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { ClassGroup } from '../domain/classGroup';
import { classGroups, toClassGroup, type ClassGroupRow } from './classGroupRow';

export { countSubjects, insertSubject, listSubjects, subjectById } from './classGroupSubjects';
export { ofTeacher, teacherSubjects } from './classGroupsOfTeacher';

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
  const rows: ClassGroupRow[] = await sql`${classGroups(sql)}
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toClassGroup(row);
}

export type ClassGroupFilter = {
  schoolIds?: readonly string[];
  academicYearId?: string;
};

const filterConditions = (sql: Connection, filter?: ClassGroupFilter) => ({
  schoolIds: filter?.schoolIds === undefined ? null : sql.array([...filter.schoolIds], 'TEXT'),
  academicYearId: filter?.academicYearId ?? null,
});

export async function list(
  sql: Connection,
  networkId: string,
  filter?: ClassGroupFilter,
  range?: Range,
): Promise<ClassGroup[]> {
  const { schoolIds, academicYearId } = filterConditions(sql, filter);
  const { limit, offset } = rangeParams(range);
  const rows: ClassGroupRow[] = await sql`${classGroups(sql)}
     WHERE network_id = ${networkId}
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
  const { schoolIds, academicYearId } = filterConditions(sql, filter);
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM class_group
     WHERE network_id = ${networkId}
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
