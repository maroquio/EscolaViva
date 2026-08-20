import { z } from 'zod';
import { academics } from '../../academics';
import { BATCH_PROBLEMS, batchProblem, type BatchProblem } from '../../shared/batch';
import { reader, unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import { isDateWithinAcademicYear, isValidRollCallDate } from '../domain/attendance';
import { allTermsClosed, closingStates } from '../domain/termClosing';
import * as attendanceRepository from '../infra/attendanceRepository';
import * as closingRepository from '../infra/closingRepository';

type RollCallRecord = {
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

  const academicYear = await academics.academicYearById(networkId, classGroup.academicYearId);
  if (academicYear === null) {
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

  const closings = await closingRepository.byClassGroup(reader(), networkId, classGroupId);
  if (allTermsClosed(closingStates(closings))) {
    return fieldFailure(FIELDS.date, CODES.rollCall.yearAlreadyClosed, MESSAGES.rollCall.yearAlreadyClosed);
  }

  const enrollments = await academics.activeEnrollmentsOfClassGroup(networkId, classGroupId);
  const problem = batchProblem(
    new Set(enrollments.map((enrollment) => enrollment.id)),
    rows.map((row) => row.enrollmentId),
  );
  if (problem !== null) return refusalFor(problem);

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

function refusalFor(problem: BatchProblem): Result<number> {
  if (problem === BATCH_PROBLEMS.outsideTheSet) {
    return fieldFailure(
      FIELDS.rows,
      CODES.rollCall.enrollmentOutsideClassGroup,
      MESSAGES.rollCall.enrollmentOutsideClassGroup,
    );
  }
  return fieldFailure(
    FIELDS.rows,
    CODES.rollCall.duplicateEnrollment,
    MESSAGES.rollCall.duplicateEnrollment,
  );
}
