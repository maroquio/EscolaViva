import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { ReadCount } from '../domain/recipient';
import { toTextOrNull } from './instantText';

type CountRow = {
  announcement_id: string;
  title: string;
  published_at: Date | null;
  recipients: number;
  reads: number;
};

export async function countReads(
  sql: Connection,
  networkId: string,
  schoolId: string | null,
  range?: Range,
): Promise<ReadCount[]> {
  const { limit, offset } = rangeParams(range);
  const rows = await sql<CountRow[]>`
    SELECT ann.id AS announcement_id,
           ann.title,
           ann.published_at,
           count(rec.user_id)::int AS recipients,
           count(rec.read_at)::int     AS reads
    FROM announcement ann
    LEFT JOIN announcement_recipient rec ON rec.network_id = ann.network_id AND rec.announcement_id = ann.id
    WHERE ann.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR ann.school_id = ${schoolId})
    GROUP BY ann.id, ann.title, ann.published_at
    ORDER BY ann.published_at DESC NULLS LAST
    LIMIT ${limit}::int OFFSET ${offset}::int
  `;
  return rows.map((row) => ({
    announcementId: row.announcement_id,
    title: row.title,
    publishedAt: toTextOrNull(row.published_at),
    recipients: row.recipients,
    reads: row.reads,
  }));
}

export async function countAnnouncements(
  sql: Connection,
  networkId: string,
  schoolId: string | null,
): Promise<number> {
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM announcement ann
    WHERE ann.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR ann.school_id = ${schoolId})
  `;
  return rows[0]?.total ?? 0;
}

export async function sumReads(
  sql: Connection,
  networkId: string,
  schoolId: string | null,
): Promise<{ recipients: number; reads: number }> {
  const rows = await sql<{ recipients: number; reads: number }[]>`
    SELECT count(rec.user_id)::int AS recipients,
           count(rec.read_at)::int     AS reads
    FROM announcement ann
    LEFT JOIN announcement_recipient rec ON rec.network_id = ann.network_id AND rec.announcement_id = ann.id
    WHERE ann.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR ann.school_id = ${schoolId})
  `;
  const summed = rows[0];
  if (summed === undefined) return { recipients: 0, reads: 0 };
  return { recipients: summed.recipients, reads: summed.reads };
}
