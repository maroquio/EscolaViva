import { z } from 'zod';
import { PASSWORD_CHANGE_FIELD, PASSWORD_CHANGE_MESSAGES } from './constants';

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, PASSWORD_CHANGE_MESSAGES.currentPassword),
    newPassword: z.string().min(1, PASSWORD_CHANGE_MESSAGES.newPassword),
    passwordConfirmation: z.string().min(1, PASSWORD_CHANGE_MESSAGES.passwordConfirmation),
  })
  .refine((values) => values.newPassword === values.passwordConfirmation, {
    path: [PASSWORD_CHANGE_FIELD.passwordConfirmation],
    error: PASSWORD_CHANGE_MESSAGES.mismatch,
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

export const PASSWORD_CHANGE_FIELDS = Object.values(PASSWORD_CHANGE_FIELD);
