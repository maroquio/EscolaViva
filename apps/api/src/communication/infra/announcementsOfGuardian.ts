import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { StoredAnnouncement } from '../domain/announcement';
import type { BoardItem } from '../domain/recipient';
import { toText, toTextOrNull } from './instantText';

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

type RecipientKey = {
  networkId: string;
  announcementId: string;
  userId: string;
};

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

type BoardFilter = { read?: boolean };

export async function listForGuardian(
  sql: Connection,
  networkId: string,
  userId: string,
  filter?: BoardFilter,
  range?: Range,
): Promise<BoardItem[]> {
  const read = filter?.read ?? null;
  const { limit, offset } = rangeParams(range);
  const rows = await sql<BoardRow[]>`
    SELECT ann.id AS announcement_id, ann.title, ann.published_at, rec.read_at
    FROM announcement_recipient rec
    JOIN announcement ann ON ann.network_id = rec.network_id AND ann.id = rec.announcement_id
    WHERE rec.network_id = ${networkId}
      AND rec.user_id = ${userId}
      AND ann.published_at IS NOT NULL
      AND (${read}::boolean IS NULL OR (rec.read_at IS NOT NULL) = ${read}::boolean)
    ORDER BY ann.published_at DESC
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
  userId: string,
  filter?: BoardFilter,
): Promise<number> {
  const read = filter?.read ?? null;
  const rows = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM announcement_recipient rec
    JOIN announcement ann ON ann.network_id = rec.network_id AND ann.id = rec.announcement_id
    WHERE rec.network_id = ${networkId}
      AND rec.user_id = ${userId}
      AND ann.published_at IS NOT NULL
      AND (${read}::boolean IS NULL OR (rec.read_at IS NOT NULL) = ${read}::boolean)
  `;
  return rows[0]?.total ?? 0;
}

export async function findForGuardian(
  sql: Connection,
  networkId: string,
  userId: string,
  announcementId: string,
): Promise<StoredAnnouncement | null> {
  const rows = await sql<AnnouncementRow[]>`
    SELECT ann.id, ann.network_id, ann.school_id, ann.title, ann.body, ann.author_user_id, ann.published_at
    FROM announcement ann
    JOIN announcement_recipient rec ON rec.network_id = ann.network_id AND rec.announcement_id = ann.id
    WHERE ann.network_id = ${networkId}
      AND ann.id = ${announcementId}
      AND rec.user_id = ${userId}
  `;
  const row = rows[0];
  return row === undefined ? null : toAnnouncement(row);
}

export async function readAtForGuardian(
  sql: Connection,
  networkId: string,
  userId: string,
  announcementId: string,
): Promise<string | null> {
  const rows = await sql<{ read_at: Date | null }[]>`
    SELECT rec.read_at
    FROM announcement_recipient rec
    WHERE rec.network_id = ${networkId}
      AND rec.announcement_id = ${announcementId}
      AND rec.user_id = ${userId}
  `;
  const row = rows[0];
  return row === undefined ? null : toTextOrNull(row.read_at);
}

export async function markRead(sql: Connection, key: RecipientKey): Promise<void> {
  await sql`
    UPDATE announcement_recipient
    SET read_at = now()
    WHERE network_id = ${key.networkId}
      AND announcement_id = ${key.announcementId}
      AND user_id = ${key.userId}
      AND read_at IS NULL
  `;
}
