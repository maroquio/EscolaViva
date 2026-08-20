import type { Connection } from '../../shared/db';
import type { GuardianLink } from '../domain/guardian';

type GuardianLinkRow = {
  user_id: string;
  relationship: string;
  financially_responsible: boolean;
};

const toGuardianLink = (row: GuardianLinkRow): GuardianLink => ({
  userId: row.user_id,
  relationship: row.relationship,
  financiallyResponsible: row.financially_responsible,
});

export async function link(
  sql: Connection,
  guardianLink: {
    networkId: string;
    studentId: string;
    userId: string;
    relationship: string;
    financiallyResponsible: boolean;
  },
): Promise<boolean> {
  const created: { user_id: string }[] = await sql`
    INSERT INTO student_guardian (network_id, student_id, user_id, relationship,
                                  financially_responsible)
    VALUES (${guardianLink.networkId}, ${guardianLink.studentId}, ${guardianLink.userId},
            ${guardianLink.relationship}, ${guardianLink.financiallyResponsible})
    ON CONFLICT (student_id, user_id) DO NOTHING
    RETURNING user_id`;
  return created.length === 1;
}

export async function ofStudent(
  sql: Connection,
  networkId: string,
  studentId: string,
): Promise<GuardianLink[]> {
  const rows: GuardianLinkRow[] = await sql`
    SELECT sg.user_id, sg.relationship, sg.financially_responsible
      FROM student_guardian sg
     WHERE sg.network_id = ${networkId} AND sg.student_id = ${studentId}`;
  return rows.map(toGuardianLink);
}

export async function countInSchools(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<number> {
  if (schoolIds.length === 0) return 0;
  const rows: { total: number }[] = await sql`
    SELECT count(DISTINCT sg.user_id)::int AS total
      FROM student_guardian sg
      JOIN enrollment enr ON enr.student_id = sg.student_id AND enr.network_id = sg.network_id
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = sg.network_id
     WHERE sg.network_id = ${networkId}
       AND enr.status = 'active'
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])`;
  return rows[0]?.total ?? 0;
}

export async function countBySchool(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, number>> {
  if (schoolIds.length === 0) return new Map<string, number>();
  const rows: { school_id: string; total: number }[] = await sql`
    SELECT cg.school_id, count(DISTINCT sg.user_id)::int AS total
      FROM student_guardian sg
      JOIN enrollment enr ON enr.student_id = sg.student_id AND enr.network_id = sg.network_id
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = sg.network_id
     WHERE sg.network_id = ${networkId}
       AND enr.status = 'active'
       AND cg.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     GROUP BY cg.school_id`;
  return new Map(rows.map((row): [string, number] => [row.school_id, row.total]));
}

export async function ofSchool(
  sql: Connection,
  networkId: string,
  schoolId: string,
): Promise<string[]> {
  const rows: { user_id: string }[] = await sql`
    SELECT DISTINCT sg.user_id
      FROM student_guardian sg
      JOIN enrollment enr ON enr.student_id = sg.student_id AND enr.network_id = sg.network_id
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = sg.network_id
     WHERE sg.network_id = ${networkId} AND cg.school_id = ${schoolId} AND enr.status = 'active'`;
  return rows.map((row) => row.user_id);
}
