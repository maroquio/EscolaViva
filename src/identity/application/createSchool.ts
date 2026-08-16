import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import type { School } from '../domain/school';
import * as schoolRepository from '../infra/schoolRepository';

const schema = z.object({
  networkId: z.string().uuid(MESSAGES.school.invalidNetwork),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.school.nameRequired)
    .max(LIMITS.school.name, MESSAGES.school.nameTooLong),
  inepCode: z
    .string()
    .trim()
    .max(LIMITS.school.inepCode, MESSAGES.school.inepTooLong)
    .nullable()
    .optional(),
});

export async function createSchool(input: {
  networkId: string;
  name: string;
  inepCode?: string | null | undefined;
}): Promise<Result<School>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));
  const data = parsed.data;

  const inepCode = data.inepCode === '' ? null : (data.inepCode ?? null);
  const school: School = {
    id: uuidIdGenerator.next(),
    networkId: data.networkId,
    name: data.name,
    inepCode,
    active: true,
  };

  return await unitOfWork(async ({ sql }) => {
    if (await schoolRepository.nameExists(sql, school.networkId, school.name)) {
      return fieldFailure(FIELDS.school.name, CODES.nameInUse, MESSAGES.school.nameInUse);
    }
    await schoolRepository.insert(sql, school);
    return success(school);
  });
}
