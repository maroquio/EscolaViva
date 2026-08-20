import { z } from 'zod';
import { readerFresh, unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES } from '../constants';
import { MINIMUM_PASSWORD_LENGTH } from '../domain/user';
import * as userCredentials from '../infra/userCredentials';

const schema = z.object({
  networkId: z.string().uuid(),
  userId: z.string().uuid(MESSAGES.password.invalidUser),
  currentPassword: z.string().min(1, MESSAGES.password.currentRequired),
  newPassword: z
    .string()
    .min(MINIMUM_PASSWORD_LENGTH, MESSAGES.password.newTooShort(MINIMUM_PASSWORD_LENGTH)),
});

export async function changePassword(input: {
  networkId: string;
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));
  const data = parsed.data;

  const credentials = await userCredentials.credentialsById(readerFresh(), data.networkId, data.userId);
  if (credentials === null) {
    return failure({
      code: CODES.userNotFound,
      message: MESSAGES.password.userNotFound,
    });
  }

  const matches = await Bun.password.verify(data.currentPassword, credentials.passwordHash);
  if (!matches) {
    return fieldFailure(
      FIELDS.password.currentPassword,
      CODES.wrongPassword,
      MESSAGES.password.currentDoesNotMatch,
    );
  }

  const passwordHash = await Bun.password.hash(data.newPassword);
  await unitOfWork(async ({ sql }) => {
    await userCredentials.updatePassword(
      sql,
      credentials.user.networkId,
      credentials.user.id,
      passwordHash,
    );
  });
  return success<void>(undefined);
}
