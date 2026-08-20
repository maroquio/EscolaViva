import type { Enrollment } from '../../academics';
import type { AttendanceEntry, ReportCard, ReportCardRow } from '../../assessment';
import type { Announcement, BoardItem as GuardianBoardItem } from '../../communication';
import type { Page as DomainPage } from '../../shared/pagination';
import type {
  AttendanceDay,
  BoardItem,
  GuardianAnnouncement,
  GuardianAttendance,
  GuardianBoard,
  GuardianDashboard,
  GuardianReportCard,
  OpenAnnouncement,
  ReportCardAsJson,
  ReportCardRowAsJson,
} from '@escolaviva/contracts/guardian';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import { pageAsJson } from './page';

export const enrollmentAsJson = (enrollment: Enrollment): EnrollmentInList => ({
  id: enrollment.id,
  studentId: enrollment.studentId,
  studentName: enrollment.studentName,
  classGroupId: enrollment.classGroupId,
  classGroupName: enrollment.classGroupName,
  year: enrollment.year,
  status: enrollment.status,
});

const boardItemAsJson = (item: GuardianBoardItem): BoardItem => ({
  announcementId: item.announcementId,
  title: item.title,
  publishedAt: item.publishedAt,
  readAt: item.readAt,
});

const attendanceDayAsJson = (day: AttendanceEntry): AttendanceDay => ({
  date: day.date,
  present: day.present,
  excuse: day.excuse,
});

const reportCardRowAsJson = (row: ReportCardRow): ReportCardRowAsJson => ({
  subjectName: row.subjectName,
  grades: row.grades,
  average: row.average,
});

const reportCardAsJson = (reportCard: ReportCard): ReportCardAsJson => ({
  enrollmentId: reportCard.enrollmentId,
  studentName: reportCard.studentName,
  classGroupName: reportCard.classGroupName,
  year: reportCard.year,
  rows: reportCard.rows.map(reportCardRowAsJson),
  termAverages: reportCard.termAverages,
  overallAverage: reportCard.overallAverage,
  attendanceRate: reportCard.attendanceRate,
  totalDays: reportCard.totalDays,
  presentDays: reportCard.presentDays,
  status: reportCard.status,
});

const termColumnsOf = (reportCard: ReportCard): number[] =>
  Array.from({ length: reportCard.rows[0]?.grades.length ?? 0 }, (_, index) => index + 1);

export const announcementAsJson = (announcement: Announcement): OpenAnnouncement => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  authorName: announcement.authorName,
  publishedAt: announcement.publishedAt,
});

export const dashboardAsJson = (
  enrollments: DomainPage<Enrollment>,
  unread: readonly GuardianBoardItem[],
  counts: { unread: number; total: number },
): GuardianDashboard => ({
  enrollments: pageAsJson(enrollments, enrollmentAsJson),
  unread: unread.map(boardItemAsJson),
  totalUnread: counts.unread,
  totalOnBoard: counts.total,
});

export const reportCardViewAsJson = (reportCard: ReportCard): GuardianReportCard => ({
  reportCard: reportCardAsJson(reportCard),
  terms: termColumnsOf(reportCard),
});

export const attendanceViewAsJson = (
  enrollment: Enrollment,
  reportCard: ReportCard,
  days: DomainPage<AttendanceEntry>,
): GuardianAttendance => ({
  enrollment: enrollmentAsJson(enrollment),
  reportCard: reportCardAsJson(reportCard),
  days: pageAsJson(days, attendanceDayAsJson),
});

export const boardAsJson = (
  unread: DomainPage<GuardianBoardItem>,
  read: DomainPage<GuardianBoardItem>,
): GuardianBoard => ({
  unread: pageAsJson(unread, boardItemAsJson),
  read: pageAsJson(read, boardItemAsJson),
});

export const announcementViewAsJson = (
  announcement: Announcement,
  readAt: string | null,
): GuardianAnnouncement => ({
  announcement: announcementAsJson(announcement),
  readAt,
});
