import { z } from 'zod';
import { unitOfWork, type Connection } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES } from '../constants';
import { ACTIVE_ENROLLMENT_STATUS, type Enrollment } from '../domain/enrollment';
import type { ClassGroup } from '../domain/classGroup';
import * as students from '../infra/studentRepository';
import * as academicYears from '../infra/academicYearRepository';
import * as enrollments from '../infra/enrollmentRepository';
import * as classGroups from '../infra/classGroupRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  studentId: z.string().uuid(MESSAGES.studentRequired),
  classGroupId: z.string().uuid(MESSAGES.enrollment.classGroupRequired),
  academicYearId: z.string().uuid(MESSAGES.academicYearRequired),
  enrollmentDate: z.string().date(MESSAGES.enrollment.dateFormat),
});

type Target = {
  networkId: string;
  studentId: string;
  classGroupId: string;
  academicYearId: string;
};
type EnrollmentContext = { studentName: string; classGroup: ClassGroup; year: number };

async function context(sql: Connection, target: Target): Promise<Result<EnrollmentContext>> {
  const student = await students.byId(sql, target.networkId, target.studentId);
  if (student === null) {
    return fieldFailure(
      FIELDS.enrollment.studentId,
      CODES.studentNotFound,
      MESSAGES.studentNotFound,
    );
  }
  const classGroup = await classGroups.byId(sql, target.networkId, target.classGroupId);
  if (classGroup === null) {
    return fieldFailure(
      FIELDS.enrollment.classGroupId,
      CODES.classGroupNotFound,
      MESSAGES.classGroupNotFound,
    );
  }
  const academicYear = await academicYears.byId(sql, target.networkId, target.academicYearId);
  if (academicYear === null) {
    return fieldFailure(
      FIELDS.enrollment.academicYearId,
      CODES.academicYearNotFound,
      MESSAGES.academicYearNotFound,
    );
  }
  if (classGroup.academicYearId !== target.academicYearId) {
    return fieldFailure(
      FIELDS.enrollment.classGroupId,
      CODES.enrollment.classGroupFromAnotherYear,
      MESSAGES.enrollment.classGroupFromAnotherYear,
    );
  }
  return success({ studentName: student.name, classGroup, year: academicYear.year });
}

export async function enroll(input: {
  networkId: string;
  studentId: string;
  classGroupId: string;
  academicYearId: string;
  enrollmentDate: string;
}): Promise<Result<Enrollment>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  const { networkId, studentId, classGroupId, academicYearId, enrollmentDate } = parsed.data;
  return unitOfWork(async ({ sql }): Promise<Result<Enrollment>> => {
    const found = await context(sql, { networkId, studentId, classGroupId, academicYearId });
    if (!found.ok) return found;

    const { studentName, classGroup, year } = found.value;
    const enrollment: Enrollment = {
      id: uuidIdGenerator.next(),
      networkId,
      studentId,
      studentName,
      classGroupId,
      classGroupName: classGroup.name,
      schoolId: classGroup.schoolId,
      academicYearId,
      year,
      enrollmentDate,
      status: ACTIVE_ENROLLMENT_STATUS,
    };
    const created = await enrollments.insert(sql, enrollment);
    if (!created) {
      return fieldFailure(
        FIELDS.enrollment.studentId,
        CODES.enrollment.duplicateActive,
        MESSAGES.enrollment.duplicateActive,
      );
    }
    return success(enrollment);
  });
}
