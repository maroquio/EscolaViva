import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES, SCHEMA_FIELD_NAMES } from '../constants';
import type { Subject } from '../domain/subject';
import * as subjects from '../infra/subjectRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.subject.nameRequired)
    .max(LIMITS.subject.name, MESSAGES.subject.nameTooLong),
});

export async function registerSubject(input: {
  networkId: string;
  name: string;
}): Promise<Result<Subject>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.subject));
  }

  const subject: Subject = { id: uuidIdGenerator.next(), ...parsed.data };
  const created = await unitOfWork(({ sql }) => subjects.insert(sql, subject));
  if (!created) {
    return fieldFailure(FIELDS.subject.name, CODES.subject.duplicate, MESSAGES.subject.duplicate);
  }
  return success(subject);
}
