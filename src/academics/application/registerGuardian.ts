import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../../shared/document';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES, SCHEMA_FIELD_NAMES } from '../constants';
import type { Guardian } from '../domain/guardian';
import * as guardians from '../infra/guardianRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.guardian.nameRequired)
    .max(LIMITS.guardian.name, MESSAGES.guardian.nameTooLong),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(MESSAGES.guardian.invalidEmail)
    .max(LIMITS.guardian.email, MESSAGES.guardian.emailTooLong),
  phone: z
    .string()
    .trim()
    .max(LIMITS.guardian.phone, MESSAGES.guardian.phoneTooLong)
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value)),
  cpf: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? normalizeCpf(value) : null))
    .refine((value) => value === null || isValidCpf(value), MESSAGES.guardian.invalidCpf),
});

export async function registerGuardian(input: {
  networkId: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
}): Promise<Result<Guardian>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.guardian));
  }

  const guardian: Guardian = { id: uuidIdGenerator.next(), ...parsed.data };
  const created = await unitOfWork(({ sql }) => guardians.insert(sql, guardian));
  if (!created) {
    return fieldFailure(
      FIELDS.guardian.email,
      CODES.guardian.duplicateEmail,
      MESSAGES.guardian.duplicateEmail,
    );
  }
  return success(guardian);
}
