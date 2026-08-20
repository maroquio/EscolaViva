import { z } from 'zod';

export const signInSchema = z.object({
  networkSlug: z.string().trim().min(1),
  cpf: z.string().trim().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  passwordConfirmation: z.string().min(1),
});
