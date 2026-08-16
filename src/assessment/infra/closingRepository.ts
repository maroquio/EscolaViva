import type { Connection } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import type { TermClosing } from '../domain/termClosing';

export async function byClassGroup(
  sql: Connection,
  networkId: string,
  classGroupId: string,
): Promise<TermClosing[]> {
  const rows: { term: number; closed_at: string }[] = await sql`
    SELECT term,
           to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at
      FROM term_closing
     WHERE network_id = ${networkId}
       AND class_group_id = ${classGroupId}
     ORDER BY term`;
  return rows.map((row) => ({ term: row.term, closedAt: row.closed_at }));
}

export async function isClosed(
  sql: Connection,
  networkId: string,
  classGroupId: string,
  term: number,
): Promise<boolean> {
  const rows: { closed: number }[] = await sql`
    SELECT 1 AS closed
      FROM term_closing
     WHERE network_id = ${networkId}
       AND class_group_id = ${classGroupId}
       AND term = ${term}`;
  return rows.length > 0;
}

export async function record(
  sql: Connection,
  closing: { networkId: string; classGroupId: string; term: number; closedBy: string },
): Promise<void> {
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
    VALUES (${uuidIdGenerator.next()}, ${closing.networkId}, ${closing.classGroupId},
            ${closing.term}, ${closing.closedBy})`;
}
