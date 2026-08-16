import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { INTERNAL_ERRORS } from '../constants';
import type { StoredAnnouncement } from '../domain/announcement';
import type { BoardItem, ReadCount } from '../domain/recipient';

type AnnouncementRow = {
  id: string;
  network_id: string;
  school_id: string;
  title: string;
  body: string;
  author_user_id: string;
  published_at: Date | null;
};

type BoardRow = {
  announcement_id: string;
  title: string;
  published_at: Date;
  read_at: Date | null;
};

type CountRow = {
  announcement_id: string;
  title: string;
  published_at: Date | null;
  recipients: number;
  reads: number;
};

export type NewAnnouncement = {
  id: string;
  networkId: string;
  schoolId: string;
  title: string;
  body: string;
  authorUserId: string;
};

export type RecipientKey = {
  networkId: string;
  announcementId: string;
  guardianId: string;
};

function toText(instant: Date): string {
  return instant.toISOString();
}

function toTextOrNull(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}

function toAnnouncement(row: AnnouncementRow): StoredAnnouncement {
  return {
    id: row.id,
    networkId: row.network_id,
    schoolId: row.school_id,
    title: row.title,
    body: row.body,
    authorUserId: row.author_user_id,
    publishedAt: toTextOrNull(row.published_at),
  };
}

export async function insertPublished(
  sql: Connection,
  announcement: NewAnnouncement,
): Promise<StoredAnnouncement> {
  const rows = await sql<{ published_at: Date }[]>`
    INSERT INTO announcement (id, network_id, school_id, title, body, author_user_id, published_at)
    VALUES (${announcement.id}, ${announcement.networkId}, ${announcement.schoolId},
            ${announcement.title}, ${announcement.body}, ${announcement.authorUserId}, now())
    RETURNING published_at
  `;
  const row = rows[0];
  if (row === undefined) throw new Error(INTERNAL_ERRORS.insertWithoutPublishedAt);
  return {
    id: announcement.id,
    networkId: announcement.networkId,
    schoolId: announcement.schoolId,
    title: announcement.title,
    body: announcement.body,
    authorUserId: announcement.authorUserId,
    publishedAt: toText(row.published_at),
  };
}

export async function insertRecipients(
  sql: Connection,
  input: { networkId: string; announcementId: string; guardianIds: readonly string[] },
): Promise<void> {
  const rows = input.guardianIds.map((guardianId) => ({
    network_id: input.networkId,
    announcement_id: input.announcementId,
    guardian_id: guardianId,
  }));
  await sql`INSERT INTO announcement_recipient ${sql(rows)}`;
}

export type BoardFilter = { read?: boolean };

export async function listForGuardian(
  sql: Connection,
  networkId: string,
  guardianId: string,
  filter?: BoardFilter,
  range?: Range,
): Promise<BoardItem[]> {
  const read = filter?.read ?? null;
  const { limit, offset } = rangeParams(range);
  const rows = await sql<BoardRow[]>`
    SELECT c.id AS announcement_id, c.title, c.published_at, d.read_at
    FROM announcement_recipient d
    JOIN announcement c ON c.network_id = d.network_id AND c.id = d.announcement_id
    WHERE d.network_id = ${networkId}
      AND d.guardian_id = ${guardianId}
      AND c.published_at IS NOT NULL
      AND (${read}::boolean IS NULL OR (d.read_at IS NOT NULL) = ${read}::boolean)
    ORDER BY c.published_at DESC
    LIMIT ${limit}::int OFFSET ${offset}::int
  `;
  return rows.map((row) => ({
    announcementId: row.announcement_id,
    title: row.title,
    publishedAt: toText(row.published_at),
    readAt: toTextOrNull(row.read_at),
  }));
}

export async function countForGuardian(
  sql: Connection,
  networkId: string,
  guardianId: string,
  filter?: BoardFilter,
): Promise<number> {
  const read = filter?.read ?? null;
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM announcement_recipient d
    JOIN announcement c ON c.network_id = d.network_id AND c.id = d.announcement_id
    WHERE d.network_id = ${networkId}
      AND d.guardian_id = ${guardianId}
      AND c.published_at IS NOT NULL
      AND (${read}::boolean IS NULL OR (d.read_at IS NOT NULL) = ${read}::boolean)
  `;
  return rows[0]?.total ?? 0;
}

export async function findForGuardian(
  sql: Connection,
  networkId: string,
  guardianId: string,
  announcementId: string,
): Promise<StoredAnnouncement | null> {
  const rows = await sql<AnnouncementRow[]>`
    SELECT c.id, c.network_id, c.school_id, c.title, c.body, c.author_user_id, c.published_at
    FROM announcement c
    JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${networkId}
      AND c.id = ${announcementId}
      AND d.guardian_id = ${guardianId}
  `;
  const row = rows[0];
  return row === undefined ? null : toAnnouncement(row);
}

export async function markRead(sql: Connection, key: RecipientKey): Promise<void> {
  await sql`
    UPDATE announcement_recipient
    SET read_at = now()
    WHERE network_id = ${key.networkId}
      AND announcement_id = ${key.announcementId}
      AND guardian_id = ${key.guardianId}
      AND read_at IS NULL
  `;
}

export async function countReads(
  sql: Connection,
  networkId: string,
  schoolId: string | null,
  range?: Range,
): Promise<ReadCount[]> {
  const { limit, offset } = rangeParams(range);
  const rows = await sql<CountRow[]>`
    SELECT c.id AS announcement_id,
           c.title,
           c.published_at,
           count(d.guardian_id)::int AS recipients,
           count(d.read_at)::int     AS reads
    FROM announcement c
    LEFT JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR c.school_id = ${schoolId})
    GROUP BY c.id, c.title, c.published_at
    ORDER BY c.published_at DESC NULLS LAST
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
    FROM announcement c
    WHERE c.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR c.school_id = ${schoolId})
  `;
  return rows[0]?.total ?? 0;
}

export async function sumReads(
  sql: Connection,
  networkId: string,
  schoolId: string | null,
): Promise<{ recipients: number; reads: number }> {
  const rows = await sql<{ recipients: number; reads: number }[]>`
    SELECT count(d.guardian_id)::int AS recipients,
           count(d.read_at)::int     AS reads
    FROM announcement c
    LEFT JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${networkId}
      AND (${schoolId}::uuid IS NULL OR c.school_id = ${schoolId})
  `;
  const summed = rows[0];
  if (summed === undefined) return { recipients: 0, reads: 0 };
  return { recipients: summed.recipients, reads: summed.reads };
}
