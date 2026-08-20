import { z } from 'zod';
import { academics } from '../../academics';
import { lockTermForWriting, unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES } from '../constants';
import { closingPendingItems, pendingItemsMessage } from '../domain/termClosing';
import { isValidTerm } from '../domain/grade';
import * as closingRepository from '../infra/closingRepository';
import * as gradeRepository from '../infra/gradeRepository';

type TermClosingInput = {
  networkId: string;
  classGroupId: string;
  term: number;
  closedBy: string;
};

const schema = z.object({
  networkId: z.string().uuid(),
  classGroupId: z.string().uuid(),
  term: z.number().refine(isValidTerm, MESSAGES.invalidTerm),
  closedBy: z.string().uuid(),
});

export async function closeTerm(input: TermClosingInput): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }
  const { networkId, classGroupId, term, closedBy } = parsed.data;

  const classGroup = await academics.classGroupById(networkId, classGroupId);
  if (classGroup === null) {
    return fieldFailure(FIELDS.classGroupId, CODES.notFound, MESSAGES.classGroupNotFound);
  }

  const subjects = await academics.listClassGroupSubjects(networkId, classGroupId);
  if (subjects.length === 0) {
    return fieldFailure(FIELDS.classGroupId, CODES.noSubject, MESSAGES.closing.noSubject);
  }

  const enrollments = await academics.activeEnrollmentsOfClassGroup(networkId, classGroupId);
  if (enrollments.length === 0) {
    return fieldFailure(
      FIELDS.classGroupId,
      CODES.noActiveEnrollment,
      MESSAGES.closing.noActiveEnrollment,
    );
  }

  return await unitOfWork<Result<void>>(async ({ sql }) => {
    await lockTermForWriting(sql, classGroupId, term);
    if (await closingRepository.isClosed(sql, networkId, classGroupId, term)) {
      return fieldFailure(FIELDS.term, CODES.alreadyClosed, MESSAGES.closing.alreadyClosed);
    }

    const posted = await gradeRepository.countBySubject(
      sql,
      networkId,
      subjects.map((subject) => subject.id),
      term,
      enrollments.map((enrollment) => enrollment.id),
    );
    const pendingItems = closingPendingItems(subjects, enrollments.length, posted);
    if (pendingItems.length > 0) {
      return fieldFailure(
        FIELDS.term,
        CODES.incompleteClosing,
        pendingItemsMessage(pendingItems),
      );
    }

    await closingRepository.record(sql, { networkId, classGroupId, term, closedBy });
    return success<void>(undefined);
  });
}
