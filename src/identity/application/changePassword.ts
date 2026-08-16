import { z } from 'zod';
import { reader, unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES, SCHEMA_FIELD_NAMES } from '../constants';
import { MINIMUM_PASSWORD_LENGTH } from '../domain/user';
import * as userRepository from '../infra/userRepository';

const schema = z.object({
  userId: z.string().uuid(MESSAGES.password.invalidUser),
  currentPassword: z.string().min(1, MESSAGES.password.currentRequired),
  newPassword: z
    .string()
    .min(MINIMUM_PASSWORD_LENGTH, MESSAGES.password.newTooShort(MINIMUM_PASSWORD_LENGTH)),
});

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.password));
  const data = parsed.data;

  const credentials = await userRepository.credentialsById(reader(), data.userId);
  if (credentials === null) {
    return failure({
      codigo: CODES.userNotFound,
      mensagem: MESSAGES.password.userNotFound,
    });
  }

  const matches = await Bun.password.verify(data.currentPassword, credentials.passwordHash);
  if (!matches) {
    return fieldFailure(
      FIELDS.password.current,
      CODES.wrongPassword,
      MESSAGES.password.currentDoesNotMatch,
    );
  }

  const passwordHash = await Bun.password.hash(data.newPassword);
  await unitOfWork(async ({ sql }) => {
    await userRepository.updatePassword(
      sql,
      credentials.user.networkId,
      credentials.user.id,
      passwordHash,
    );
  });
  return success<void>(undefined);
}
