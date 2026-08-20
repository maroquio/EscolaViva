import type { Page } from './page';
import type { EnrollmentInList } from './shared';

export type FinalStatus = 'in_progress' | 'passed' | 'failed';

export type ReportCardRowAsJson = {
  readonly subjectName: string;
  readonly grades: readonly (number | null)[];
  readonly average: number | null;
};

export type ReportCardAsJson = {
  readonly enrollmentId: string;
  readonly studentName: string;
  readonly classGroupName: string;
  readonly year: number;
  readonly rows: readonly ReportCardRowAsJson[];
  readonly termAverages: readonly (number | null)[];
  readonly overallAverage: number | null;
  readonly attendanceRate: number;
  readonly totalDays: number;
  readonly presentDays: number;
  readonly status: FinalStatus;
};

export type AttendanceDay = {
  readonly date: string;
  readonly present: boolean;
  readonly excuse: string | null;
};

export type BoardItem = {
  readonly announcementId: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly readAt: string | null;
};

export type OpenAnnouncement = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly authorName: string;
  readonly publishedAt: string | null;
};

export type GuardianDashboard = {
  readonly enrollments: Page<EnrollmentInList>;
  readonly unread: readonly BoardItem[];
  readonly totalUnread: number;
  readonly totalOnBoard: number;
};

export type GuardianReportCard = {
  readonly reportCard: ReportCardAsJson;
  readonly terms: readonly number[];
};

export type GuardianAttendance = {
  readonly enrollment: EnrollmentInList;
  readonly reportCard: ReportCardAsJson;
  readonly days: Page<AttendanceDay>;
};

export type GuardianBoard = {
  readonly unread: Page<BoardItem>;
  readonly read: Page<BoardItem>;
};

export type GuardianAnnouncement = {
  readonly announcement: OpenAnnouncement;
  readonly readAt: string | null;
};
