import {
  announcementForGuardian,
  announcementsPage,
  announcementsSummary,
  boardCounts,
  boardPage,
  guardianBoard,
  listAnnouncements,
} from './application/queries';
import { markAsRead } from './application/markAsRead';
import { publishAnnouncement } from './application/publishAnnouncement';

export type { Announcement } from './domain/announcement';
export type { BoardItem, ReadStatistic } from './domain/recipient';

export const communication = {
  publishAnnouncement,
  guardianBoard,
  boardPage,
  boardCounts,
  announcementForGuardian,
  markAsRead,
  listAnnouncements,
  announcementsPage,
  announcementsSummary,
};

export {
  AUDIENCE,
  FIELDS as COMMUNICATION_FIELDS,
} from './constants';
export type { Audience } from './constants';

export { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from './domain/announcement';
