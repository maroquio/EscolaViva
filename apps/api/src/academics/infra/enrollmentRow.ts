import type { Connection } from '../../shared/db';
import { INTERNAL_ERRORS } from '../constants';
import {
  isValidEnrollmentStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../domain/enrollment';

export type EnrollmentRow = {
  id: string;
  network_id: string;
  student_id: string;
  student_name: string;
  class_group_id: string;
  class_group_name: string;
  school_id: string;
  academic_year_id: string;
  year: number;
  enrollment_date: string;
  status: string;
};

function toEnrollmentStatus(value: string): EnrollmentStatus {
  if (!isValidEnrollmentStatus(value)) {
    throw new Error(INTERNAL_ERRORS.unknownEnrollmentStatus(value));
  }
  return value;
}

export const toEnrollment = (row: EnrollmentRow): Enrollment => ({
  id: row.id,
  networkId: row.network_id,
  studentId: row.student_id,
  studentName: row.student_name,
  classGroupId: row.class_group_id,
  classGroupName: row.class_group_name,
  schoolId: row.school_id,
  academicYearId: row.academic_year_id,
  year: row.year,
  enrollmentDate: row.enrollment_date,
  status: toEnrollmentStatus(row.status),
});

export const enrollmentsWithContext = (sql: Connection) => sql`
    SELECT enr.id, enr.network_id, enr.student_id, stu.name AS student_name, enr.class_group_id,
           cg.name AS class_group_name, cg.school_id, enr.academic_year_id, ay.year,
           to_char(enr.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, enr.status
      FROM enrollment enr
      JOIN student stu ON stu.id = enr.student_id AND stu.network_id = enr.network_id
      JOIN class_group cg ON cg.id = enr.class_group_id AND cg.network_id = enr.network_id
      JOIN academic_year ay ON ay.id = enr.academic_year_id AND ay.network_id = enr.network_id`;
