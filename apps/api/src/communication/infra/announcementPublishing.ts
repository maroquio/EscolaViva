import type { Connection } from '../../shared/db';
import { INTERNAL_ERRORS } from '../constants';
import type { StoredAnnouncement } from '../domain/announcement';
import { toText } from './instantText';

type NewAnnouncement = {
  id: string;
  networkId: string;
  schoolId: string;
  title: string;
  body: string;
  authorUserId: string;
};

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
  input: { networkId: string; announcementId: string; userIds: readonly string[] },
): Promise<void> {
  const rows = input.userIds.map((userId) => ({
    network_id: input.networkId,
    announcement_id: input.announcementId,
    user_id: userId,
  }));
  await sql`INSERT INTO announcement_recipient ${sql(rows)}`;
}
