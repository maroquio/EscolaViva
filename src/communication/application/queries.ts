import { identity } from '../../identity';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import { INTERNAL_ERRORS } from '../constants';
import { isPublished, withAuthor, type Announcement } from '../domain/announcement';
import {
  readRate,
  type BoardItem,
  type ReadStatistic,
} from '../domain/recipient';
import {
  countAnnouncements,
  countForGuardian,
  countReads,
  findForGuardian,
  listForGuardian,
  sumReads,
} from '../infra/announcementRepository';

export async function guardianBoard(
  networkId: string,
  userId: string,
): Promise<BoardItem[]> {
  return await listForGuardian(reader(), networkId, userId);
}

export async function boardPage(
  networkId: string,
  userId: string,
  read: boolean | undefined,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<BoardItem>> {
  const sql = reader();
  const filter = read === undefined ? undefined : { read };
  return await queryPage(
    page,
    size,
    () => countForGuardian(sql, networkId, userId, filter),
    (range) => listForGuardian(sql, networkId, userId, filter, range),
  );
}

export async function boardCounts(
  networkId: string,
  userId: string,
): Promise<{ unread: number; total: number }> {
  const sql = reader();
  const [unread, total] = await Promise.all([
    countForGuardian(sql, networkId, userId, { read: false }),
    countForGuardian(sql, networkId, userId),
  ]);
  return { unread, total };
}

export async function announcementForGuardian(
  networkId: string,
  userId: string,
  announcementId: string,
): Promise<Announcement | null> {
  const stored = await findForGuardian(reader(), networkId, userId, announcementId);
  if (stored === null || !isPublished(stored)) return null;

  const names = await identity.userNames(networkId, [stored.authorUserId]);
  const authorName = names.get(stored.authorUserId);
  if (authorName === undefined) throw new Error(INTERNAL_ERRORS.authorOutsideNetwork);
  return withAuthor(stored, authorName);
}

export async function listAnnouncements(
  networkId: string,
  schoolId?: string,
): Promise<ReadStatistic[]> {
  const counts = await countReads(reader(), networkId, schoolId ?? null);
  return counts.map((count) => ({
    ...count,
    rate: readRate(count.recipients, count.reads),
  }));
}

export async function announcementsPage(
  networkId: string,
  schoolId: string | undefined,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<ReadStatistic>> {
  const sql = reader();
  const school = schoolId ?? null;
  const paged = await queryPage(
    page,
    size,
    () => countAnnouncements(sql, networkId, school),
    (range) => countReads(sql, networkId, school, range),
  );
  return {
    ...paged,
    items: paged.items.map((count) => ({
      ...count,
      rate: readRate(count.recipients, count.reads),
    })),
  };
}

export async function announcementsSummary(
  networkId: string,
  schoolId?: string,
): Promise<{ recipients: number; reads: number; rate: number }> {
  const summed = await sumReads(reader(), networkId, schoolId ?? null);
  return { ...summed, rate: readRate(summed.recipients, summed.reads) };
}
