import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Guardian, GuardianLink } from '../domain/guardian';

type GuardianRow = {
  id: string;
  network_id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
};

type GuardianLinkRow = {
  guardian_id: string;
  name: string;
  email: string;
  relationship: string;
  financially_responsible: boolean;
};

const toGuardian = (row: GuardianRow): Guardian => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
  email: row.email,
  cpf: row.cpf,
  phone: row.phone,
});

const toGuardianLink = (row: GuardianLinkRow): GuardianLink => ({
  guardianId: row.guardian_id,
  name: row.name,
  email: row.email,
  relationship: row.relationship,
  financiallyResponsible: row.financially_responsible,
});

export async function insert(sql: Connection, guardian: Guardian): Promise<boolean> {
  const created: { id: string }[] = await sql`
    INSERT INTO guardian (id, network_id, name, email, cpf, phone)
    VALUES (${guardian.id}, ${guardian.networkId}, ${guardian.name},
            ${guardian.email}, ${guardian.cpf}, ${guardian.phone})
    ON CONFLICT ON CONSTRAINT guardian_email_unique_in_network DO NOTHING
    RETURNING id`;
  return created.length === 1;
}

export async function byId(
  sql: Connection,
  networkId: string,
  id: string,
): Promise<Guardian | null> {
  const rows: GuardianRow[] = await sql`
    SELECT id, network_id, name, email, cpf, phone
      FROM guardian
     WHERE network_id = ${networkId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toGuardian(row);
}

export async function list(sql: Connection, networkId: string, range?: Range): Promise<Guardian[]> {
  const { limit, offset } = rangeParams(range);
  const rows: GuardianRow[] = await sql`
    SELECT id, network_id, name, email, cpf, phone
      FROM guardian
     WHERE network_id = ${networkId}
     ORDER BY name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toGuardian);
}

export async function count(sql: Connection, networkId: string): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM guardian WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}

export async function link(
  sql: Connection,
  guardianLink: {
    networkId: string;
    studentId: string;
    guardianId: string;
    relationship: string;
    financiallyResponsible: boolean;
  },
): Promise<boolean> {
  const created: { guardian_id: string }[] = await sql`
    INSERT INTO student_guardian (network_id, student_id, guardian_id, relationship,
                                  financially_responsible)
    VALUES (${guardianLink.networkId}, ${guardianLink.studentId}, ${guardianLink.guardianId},
            ${guardianLink.relationship}, ${guardianLink.financiallyResponsible})
    ON CONFLICT (student_id, guardian_id) DO NOTHING
    RETURNING guardian_id`;
  return created.length === 1;
}

export async function ofStudent(
  sql: Connection,
  networkId: string,
  studentId: string,
  range?: Range,
): Promise<GuardianLink[]> {
  const { limit, offset } = rangeParams(range);
  const rows: GuardianLinkRow[] = await sql`
    SELECT av.guardian_id, r.name, r.email, av.relationship, av.financially_responsible
      FROM student_guardian av
      JOIN guardian r ON r.id = av.guardian_id AND r.network_id = av.network_id
     WHERE av.network_id = ${networkId} AND av.student_id = ${studentId}
     ORDER BY r.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return rows.map(toGuardianLink);
}

export async function countOfStudent(
  sql: Connection,
  networkId: string,
  studentId: string,
): Promise<number> {
  const rows: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM student_guardian
     WHERE network_id = ${networkId} AND student_id = ${studentId}`;
  return rows[0]?.total ?? 0;
}

export async function countInSchools(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<number> {
  if (schoolIds.length === 0) return 0;
  const rows: { total: number }[] = await sql`
    SELECT count(DISTINCT r.id)::int AS total
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${networkId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])`;
  return rows[0]?.total ?? 0;
}

export async function countBySchool(
  sql: Connection,
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, number>> {
  if (schoolIds.length === 0) return new Map<string, number>();
  const rows: { school_id: string; total: number }[] = await sql`
    SELECT t.school_id, count(DISTINCT r.id)::int AS total
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${networkId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...schoolIds], 'TEXT')}::uuid[])
     GROUP BY t.school_id`;
  return new Map(rows.map((row): [string, number] => [row.school_id, row.total]));
}

export async function ofSchool(
  sql: Connection,
  networkId: string,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  const rows: { id: string; name: string }[] = await sql`
    SELECT DISTINCT r.id, r.name
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${networkId} AND t.school_id = ${schoolId} AND m.status = 'active'
     ORDER BY r.name`;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
