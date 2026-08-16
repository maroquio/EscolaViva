import { academics } from '../../academics';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import {
  attendanceRate,
  finalStatus,
  overallAverage,
  subjectAverage,
  termAverages,
  type ReportCard,
  type ReportCardRow,
} from '../domain/reportCard';
import {
  allTermsClosed,
  closingStates,
  type TermClosingState,
} from '../domain/termClosing';
import type { AttendanceEntry, DayPresence } from '../domain/attendance';
import { TERMS } from '../domain/grade';
import * as attendanceRepository from '../infra/attendanceRepository';
import * as closingRepository from '../infra/closingRepository';
import * as gradeRepository from '../infra/gradeRepository';

export async function classGroupSubjectGrades(
  networkId: string,
  classGroupSubjectId: string,
  term: number,
): Promise<Map<string, number>> {
  return await gradeRepository.byClassGroupSubjectAndTerm(
    reader(),
    networkId,
    classGroupSubjectId,
    term,
  );
}

export async function rollCallForDate(
  networkId: string,
  classGroupId: string,
  date: string,
): Promise<Map<string, DayPresence>> {
  const enrollments = await academics.activeEnrollmentsOfClassGroup(networkId, classGroupId);
  if (enrollments.length === 0) return new Map();
  return await attendanceRepository.byEnrollmentsAndDate(
    reader(),
    networkId,
    enrollments.map((enrollment) => enrollment.id),
    date,
  );
}

export async function closingState(
  networkId: string,
  classGroupId: string,
): Promise<TermClosingState[]> {
  return closingStates(await closingRepository.byClassGroup(reader(), networkId, classGroupId));
}

export async function enrollmentAttendance(
  networkId: string,
  enrollmentId: string,
): Promise<AttendanceEntry[]> {
  return await attendanceRepository.byEnrollment(reader(), networkId, enrollmentId);
}

export async function attendancePage(
  networkId: string,
  enrollmentId: string,
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Promise<Page<AttendanceEntry>> {
  const sql = reader();
  return await queryPage(
    page,
    size,
    () => attendanceRepository.countByEnrollment(sql, networkId, enrollmentId),
    (range) => attendanceRepository.byEnrollment(sql, networkId, enrollmentId, range),
  );
}

export async function reportCard(
  networkId: string,
  enrollmentId: string,
): Promise<ReportCard | null> {
  const enrollment = await academics.enrollmentById(networkId, enrollmentId);
  if (enrollment === null) return null;

  const sql = reader();
  const [subjects, grades, tally, closings] = await Promise.all([
    academics.listClassGroupSubjects(networkId, enrollment.classGroupId),
    gradeRepository.byEnrollment(sql, networkId, enrollmentId),
    attendanceRepository.tallyByEnrollment(sql, networkId, enrollmentId),
    closingRepository.byClassGroup(sql, networkId, enrollment.classGroupId),
  ]);

  const rows = subjects.map((subject) => buildRow(subject.id, subject.subjectName, grades));
  const average = overallAverage(rows.map((row) => row.average));
  const attendance = attendanceRate(tally.presentDays, tally.totalDays);

  return {
    enrollmentId,
    studentName: enrollment.studentName,
    classGroupName: enrollment.classGroupName,
    year: enrollment.year,
    rows,
    termAverages: termAverages(rows),
    overallAverage: average,
    attendanceRate: attendance,
    totalDays: tally.totalDays,
    presentDays: tally.presentDays,
    status: finalStatus(average, attendance, allTermsClosed(closingStates(closings))),
  };
}

function buildRow(
  classGroupSubjectId: string,
  subjectName: string,
  grades: readonly gradeRepository.EnrollmentGrade[],
): ReportCardRow {
  const ofSubject = grades.filter((grade) => grade.classGroupSubjectId === classGroupSubjectId);
  const byTerm = TERMS.map(
    (term) => ofSubject.find((grade) => grade.term === term)?.value ?? null,
  );
  return { subjectName, grades: byTerm, average: subjectAverage(byTerm) };
}
