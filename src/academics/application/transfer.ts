import { z } from 'zod';
import type { Connection } from '../../shared/db';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, INTERNAL_ERRORS, MESSAGES } from '../constants';
import { ACTIVE_ENROLLMENT_STATUS, canTransfer, type Enrollment } from '../domain/enrollment';
import type { ClassGroup } from '../domain/classGroup';
import * as enrollments from '../infra/enrollmentRepository';
import * as classGroups from '../infra/classGroupRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  enrollmentId: z.string().uuid(MESSAGES.transfer.enrollmentRequired),
  targetClassGroupId: z.string().uuid(MESSAGES.transfer.targetClassGroupRequired),
  date: z.string().date(MESSAGES.transfer.dateFormat),
});

async function moveToClassGroup(
  sql: Connection,
  origin: Enrollment,
  target: ClassGroup,
  date: string,
): Promise<Result<Enrollment>> {
  const closed = await enrollments.markAsTransferred(sql, origin.networkId, origin.id);
  if (!closed) {
    return fieldFailure(
      FIELDS.transfer.enrollmentId,
      CODES.transfer.lostTheRace,
      MESSAGES.transfer.lostTheRace,
    );
  }

  const created: Enrollment = {
    id: uuidIdGenerator.next(),
    networkId: origin.networkId,
    studentId: origin.studentId,
    studentName: origin.studentName,
    classGroupId: target.id,
    classGroupName: target.name,
    schoolId: target.schoolId,
    academicYearId: origin.academicYearId,
    year: origin.year,
    enrollmentDate: date,
    status: ACTIVE_ENROLLMENT_STATUS,
  };
  const inserted = await enrollments.insert(sql, created);
  if (!inserted) throw new Error(INTERNAL_ERRORS.enrollmentConflictOnTransfer);
  return success(created);
}

export async function transfer(input: {
  networkId: string;
  enrollmentId: string;
  targetClassGroupId: string;
  date: string;
}): Promise<Result<Enrollment>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  const { networkId, enrollmentId, targetClassGroupId, date } = parsed.data;
  return unitOfWork(async ({ sql }): Promise<Result<Enrollment>> => {
    const origin = await enrollments.byId(sql, networkId, enrollmentId);
    if (origin === null) {
      return fieldFailure(
        FIELDS.transfer.enrollmentId,
        CODES.transfer.enrollmentNotFound,
        MESSAGES.transfer.enrollmentNotFound,
      );
    }
    if (!canTransfer(origin)) {
      return fieldFailure(
        FIELDS.transfer.enrollmentId,
        CODES.transfer.onlyActiveTransfers,
        MESSAGES.transfer.onlyActiveTransfers,
      );
    }
    if (origin.classGroupId === targetClassGroupId) {
      return fieldFailure(
        FIELDS.transfer.targetClassGroupId,
        CODES.transfer.sameClassGroup,
        MESSAGES.transfer.sameClassGroup,
      );
    }

    const target = await classGroups.byId(sql, networkId, targetClassGroupId);
    if (target === null) {
      return fieldFailure(
        FIELDS.transfer.targetClassGroupId,
        CODES.transfer.targetClassGroupNotFound,
        MESSAGES.transfer.targetClassGroupNotFound,
      );
    }
    if (target.academicYearId !== origin.academicYearId) {
      return fieldFailure(
        FIELDS.transfer.targetClassGroupId,
        CODES.transfer.classGroupFromAnotherYear,
        MESSAGES.transfer.classGroupFromAnotherYear,
      );
    }

    return moveToClassGroup(sql, origin, target, date);
  });
}
