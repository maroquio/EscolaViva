import { FORMATS, ISO_DATE_LENGTH } from '../../shared/constants';
import { MIDNIGHT_UTC } from '../constants';

export type RollCallRow = {
  enrollmentId: string;
  studentName: string;
  present: boolean;
  excuse: string | null;
};

export type DayPresence = { present: boolean; excuse: string | null };

export type AttendanceEntry = { date: string; present: boolean; excuse: string | null };

export type AttendanceTally = { totalDays: number; presentDays: number };

export function isValidRollCallDate(date: string): boolean {
  if (!FORMATS.isoDate.test(date)) return false;
  const parsed = new Date(`${date}${MIDNIGHT_UTC}`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, ISO_DATE_LENGTH) === date;
}

export function isDateWithinAcademicYear(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}
