import {
  announcementForGuardian,
  announcementReadAt,
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
export { BOARD_SCOPE } from './application/queries';
export type { BoardScope } from './application/queries';

export const communication = {
  publishAnnouncement,
  guardianBoard,
  boardPage,
  boardCounts,
  announcementForGuardian,
  announcementReadAt,
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
