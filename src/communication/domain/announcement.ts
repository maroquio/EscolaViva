export const MAX_TITLE_LENGTH = 160;
export const MAX_BODY_LENGTH = 8000;

export type Announcement = {
  id: string;
  networkId: string;
  schoolId: string;
  title: string;
  body: string;
  authorName: string;
  publishedAt: string | null;
};

export type StoredAnnouncement = {
  id: string;
  networkId: string;
  schoolId: string;
  title: string;
  body: string;
  authorUserId: string;
  publishedAt: string | null;
};

export function isValidTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TITLE_LENGTH;
}

export function isValidBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_BODY_LENGTH;
}

export function isPublished(announcement: { publishedAt: string | null }): boolean {
  return announcement.publishedAt !== null;
}

export function withAuthor(
  announcement: StoredAnnouncement,
  authorName: string,
): Announcement {
  return {
    id: announcement.id,
    networkId: announcement.networkId,
    schoolId: announcement.schoolId,
    title: announcement.title,
    body: announcement.body,
    authorName,
    publishedAt: announcement.publishedAt,
  };
}
