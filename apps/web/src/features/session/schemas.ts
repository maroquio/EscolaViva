import { z } from 'zod';
import { SIGN_IN_FIELD, SIGN_IN_MESSAGES } from './constants';

export const signInSchema = z.object({
  networkSlug: z.string().trim().min(1, SIGN_IN_MESSAGES.networkSlug),
  cpf: z.string().trim().min(1, SIGN_IN_MESSAGES.cpf),
  password: z.string().min(1, SIGN_IN_MESSAGES.password),
});

export type SignInValues = z.infer<typeof signInSchema>;

export const SIGN_IN_FIELDS = Object.values(SIGN_IN_FIELD);
