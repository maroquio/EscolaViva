import { z } from 'zod';
import { academics } from '../../academics';
import { BATCH_PROBLEMS, batchProblem, type BatchProblem } from '../../shared/batch';
import { lockTermForWriting, unitOfWork, type UnitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES } from '../constants';
import { isValidGradeValue, isValidTerm } from '../domain/grade';
import * as closingRepository from '../infra/closingRepository';
import * as gradeRepository from '../infra/gradeRepository';

export type GradePosting = {
  networkId: string;
  classGroupSubjectId: string;
  term: number;
  postedBy: string;
  grades: { enrollmentId: string; value: number | null }[];
};

type SubmittedGrade = { enrollmentId: string; value: number | null };

const schema = z.object({
  networkId: z.string().uuid(),
  classGroupSubjectId: z.string().uuid(),
  term: z.number().refine(isValidTerm, MESSAGES.invalidTerm),
  postedBy: z.string().uuid(),
  grades: z
    .array(
      z.object({
        enrollmentId: z.string().uuid(),
        value: z
          .number()
          .nullable()
          .refine((value) => value === null || isValidGradeValue(value), MESSAGES.gradeOutOfScale),
      }),
    )
    .min(1, MESSAGES.emptyGradeBatch),
});

export async function postGrades(input: GradePosting): Promise<Result<number>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }
  const { networkId, classGroupSubjectId, term, postedBy, grades } = parsed.data;

  const classGroupSubject = await academics.classGroupSubjectById(networkId, classGroupSubjectId);
  if (classGroupSubject === null) {
    return fieldFailure(
      FIELDS.classGroupSubjectId,
      CODES.classGroupSubjectNotFound,
      MESSAGES.classGroupSubjectNotFound,
    );
  }

  const enrollments = await academics.activeEnrollmentsOfClassGroup(
    networkId,
    classGroupSubject.classGroupId,
  );
  const problem = batchProblem(
    new Set(enrollments.map((enrollment) => enrollment.id)),
    grades.map((grade) => grade.enrollmentId),
  );
  if (problem !== null) return refusalFor(problem);

  return await unitOfWork<Result<number>>(async (uow) => {
    await lockTermForWriting(uow.sql, classGroupSubject.classGroupId, term);
    const closed = await closingRepository.isClosed(
      uow.sql,
      networkId,
      classGroupSubject.classGroupId,
      term,
    );
    if (closed) {
      return fieldFailure(FIELDS.term, CODES.termClosed, MESSAGES.termClosedForPosting);
    }
    return success(
      await saveBatch(uow, { networkId, classGroupSubjectId, term, postedBy, grades }),
    );
  });
}

function refusalFor(problem: BatchProblem): Result<number> {
  if (problem === BATCH_PROBLEMS.outsideTheSet) {
    return fieldFailure(
      FIELDS.grades,
      CODES.grades.enrollmentOutsideClassGroup,
      MESSAGES.grades.enrollmentOutsideClassGroup,
    );
  }
  return fieldFailure(
    FIELDS.grades,
    CODES.grades.duplicateEnrollment,
    MESSAGES.grades.duplicateEnrollment,
  );
}

async function saveBatch(
  { sql }: UnitOfWork,
  posting: {
    networkId: string;
    classGroupSubjectId: string;
    term: number;
    postedBy: string;
    grades: readonly SubmittedGrade[];
  },
): Promise<number> {
  const { networkId, classGroupSubjectId, term, postedBy, grades } = posting;
  const toDelete = grades
    .filter((grade) => grade.value === null)
    .map((grade) => grade.enrollmentId);
  if (toDelete.length > 0) {
    await gradeRepository.deleteBatch(sql, networkId, classGroupSubjectId, term, toDelete);
  }

  const toSave = grades.filter(
    (grade): grade is { enrollmentId: string; value: number } => grade.value !== null,
  );
  if (toSave.length === 0) return 0;
  return await gradeRepository.saveBatch(sql, {
    networkId,
    classGroupSubjectId,
    term,
    postedBy,
    grades: toSave,
  });
}
