import {
  attendancePage,
  classGroupSubjectGrades,
  closingState,
  enrollmentAttendance,
  reportCard,
  rollCallForDate,
} from './application/queries';
import { closeTerm } from './application/closeTerm';
import { postGrades } from './application/postGrades';
import { recordRollCall } from './application/recordRollCall';

export type { ReportCard, ReportCardRow } from './domain/reportCard';
export type { TermClosingState } from './domain/termClosing';
export type { AttendanceEntry, RollCallRow } from './domain/attendance';
export type { Grade } from './domain/grade';

export const assessment = {
  postGrades,
  classGroupSubjectGrades,
  recordRollCall,
  rollCallForDate,
  closeTerm,
  closingState,
  reportCard,
  enrollmentAttendance,
  attendancePage,
};

export {
  ARITHMETIC,
  FIELDS as ASSESSMENT_FIELDS,
  LIMITS as ASSESSMENT_LIMITS,
  MIDNIGHT_UTC,
  NOON_UTC,
  PASSING,
  TERM_LABEL,
  VOCABULARY as ASSESSMENT_VOCABULARY,
} from './constants';

export { TERMS } from './domain/grade';
