import { z } from 'zod';
import { ROLE, identity } from '../../identity';
import { unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import * as students from '../infra/studentRepository';
import * as guardians from '../infra/guardianRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  studentId: z.string().uuid(MESSAGES.studentRequired),
  userId: z.string().uuid(MESSAGES.guardianLink.guardianRequired),
  relationship: z
    .string()
    .trim()
    .min(1, MESSAGES.guardianLink.relationshipRequired)
    .max(LIMITS.relationship.description, MESSAGES.guardianLink.relationshipTooLong),
  financiallyResponsible: z.boolean(),
});

export async function linkGuardian(input: {
  networkId: string;
  studentId: string;
  userId: string;
  relationship: string;
  financiallyResponsible: boolean;
}): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  const { networkId, studentId, userId } = parsed.data;

  const known = await identity.userNames(networkId, [userId]);
  if (!known.has(userId)) {
    return fieldFailure(
      FIELDS.guardianLink.userId,
      CODES.guardianNotFound,
      MESSAGES.guardianNotFound,
    );
  }

  if (!(await identity.hasRoleInNetwork(networkId, userId, ROLE.guardian))) {
    return fieldFailure(FIELDS.guardianLink.userId, CODES.notAGuardian, MESSAGES.notAGuardian);
  }

  return unitOfWork(async ({ sql }): Promise<Result<void>> => {
    const student = await students.byId(sql, networkId, studentId);
    if (student === null) {
      return fieldFailure(
        FIELDS.guardianLink.studentId,
        CODES.studentNotFound,
        MESSAGES.studentNotFound,
      );
    }

    const linked = await guardians.link(sql, { ...parsed.data });
    if (!linked) {
      return fieldFailure(
        FIELDS.guardianLink.userId,
        CODES.guardianLink.duplicate,
        MESSAGES.guardianLink.duplicate,
      );
    }
    return success<void>(undefined);
  });
}
