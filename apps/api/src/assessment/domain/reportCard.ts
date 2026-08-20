import { ARITHMETIC, PASSING } from '../constants';
import { TERM_COUNT } from './grade';

export const FINAL_STATUSES = {
  inProgress: 'in_progress',
  passed: 'passed',
  failed: 'failed',
} as const;

export type FinalStatus = (typeof FINAL_STATUSES)[keyof typeof FINAL_STATUSES];

export type ReportCardRow = {
  subjectName: string;
  grades: (number | null)[];
  average: number | null;
};

export type ReportCard = {
  enrollmentId: string;
  studentName: string;
  classGroupName: string;
  year: number;
  rows: ReportCardRow[];
  termAverages: (number | null)[];
  overallAverage: number | null;
  attendanceRate: number;
  totalDays: number;
  presentDays: number;
  status: FinalStatus;
};

const inHundredths = (value: number): number => {
  const raw = value * ARITHMETIC.hundredths;
  const rounded = Math.round(raw);
  return Math.abs(raw - rounded) <= ARITHMETIC.representationTolerance
    ? rounded
    : Math.floor(raw);
};

const truncateHundredths = (hundredths: number): number =>
  Math.floor(hundredths) / ARITHMETIC.hundredths;

export function subjectAverage(grades: (number | null)[]): number | null {
  if (grades.length !== TERM_COUNT) return null;
  let sum = 0;
  for (const grade of grades) {
    if (grade === null) return null;
    sum += inHundredths(grade);
  }
  return truncateHundredths(sum / TERM_COUNT);
}

export function overallAverage(values: readonly (number | null)[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += inHundredths(value);
  }
  return truncateHundredths(sum / values.length);
}

export function termAverages(rows: readonly ReportCardRow[]): (number | null)[] {
  return Array.from({ length: TERM_COUNT }, (_, index) =>
    overallAverage(rows.map((row) => row.grades[index] ?? null)),
  );
}

export function attendanceRate(presentDays: number, total: number): number {
  if (total <= 0) return 0;
  return truncateHundredths((presentDays * ARITHMETIC.percent * ARITHMETIC.hundredths) / total);
}

export function finalStatus(
  average: number | null,
  attendance: number,
  allClosed: boolean,
): FinalStatus {
  if (!allClosed || average === null) return FINAL_STATUSES.inProgress;
  const passed =
    inHundredths(average) >= PASSING.minimumAverageInHundredths &&
    inHundredths(attendance) >= PASSING.minimumAttendanceInHundredths;
  return passed ? FINAL_STATUSES.passed : FINAL_STATUSES.failed;
}
