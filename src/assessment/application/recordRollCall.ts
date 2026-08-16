import { z } from 'zod';
import { academics } from '../../academics';
import { unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import { isDateWithinAcademicYear, isValidRollCallDate } from '../domain/attendance';
import * as attendanceRepository from '../infra/attendanceRepository';

export type RollCallRecord = {
  networkId: string;
  classGroupId: string;
  date: string;
  rows: { enrollmentId: string; present: boolean; excuse?: string | null }[];
};

const schema = z.object({
  networkId: z.string().uuid(),
  classGroupId: z.string().uuid(),
  date: z.string().refine(isValidRollCallDate, MESSAGES.rollCall.invalidDate),
  rows: z
    .array(
      z.object({
        enrollmentId: z.string().uuid(),
        present: z.boolean(),
        excuse: z
          .string()
          .max(LIMITS.excuseCharacters, MESSAGES.rollCall.excuseTooLong)
          .nullable()
          .optional(),
      }),
    )
    .min(1, MESSAGES.rollCall.emptyBatch),
});

export async function recordRollCall(input: RollCallRecord): Promise<Result<number>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }
  const { networkId, classGroupId, date, rows } = parsed.data;

  const classGroup = await academics.classGroupById(networkId, classGroupId);
  if (classGroup === null) {
    return fieldFailure(FIELDS.classGroupId, CODES.notFound, MESSAGES.classGroupNotFound);
  }

  const academicYear = (await academics.listAcademicYears(networkId)).find(
    (year) => year.id === classGroup.academicYearId,
  );
  if (academicYear === undefined) {
    return fieldFailure(
      FIELDS.classGroupId,
      CODES.academicYearMissing,
      MESSAGES.rollCall.academicYearMissing,
    );
  }
  if (!isDateWithinAcademicYear(date, academicYear.startDate, academicYear.endDate)) {
    return fieldFailure(
      FIELDS.date,
      CODES.dateOutsideAcademicYear,
      MESSAGES.rollCall.dateOutsideAcademicYear(academicYear.startDate, academicYear.endDate),
    );
  }

  const rejection = await checkEnrollments(networkId, classGroupId, rows);
  if (rejection !== null) return rejection;

  return await unitOfWork<Result<number>>(async ({ sql }) => {
    const saved = await attendanceRepository.saveBatch(sql, {
      networkId,
      date,
      rows: rows.map((row) => ({
        enrollmentId: row.enrollmentId,
        present: row.present,
        excuse: row.excuse ?? null,
      })),
    });
    return success(saved);
  });
}

async function checkEnrollments(
  networkId: string,
  classGroupId: string,
  rows: { enrollmentId: string }[],
): Promise<Result<number> | null> {
  const enrollments = await academics.activeEnrollmentsOfClassGroup(networkId, classGroupId);
  const inClassGroup = new Set(enrollments.map((enrollment) => enrollment.id));
  const submitted = rows.map((row) => row.enrollmentId);
  if (submitted.some((enrollmentId) => !inClassGroup.has(enrollmentId))) {
    return fieldFailure(
      FIELDS.rows,
      CODES.rollCall.enrollmentOutsideClassGroup,
      MESSAGES.rollCall.enrollmentOutsideClassGroup,
    );
  }
  if (new Set(submitted).size !== submitted.length) {
    return fieldFailure(
      FIELDS.rows,
      CODES.rollCall.duplicateEnrollment,
      MESSAGES.rollCall.duplicateEnrollment,
    );
  }
  return null;
}
