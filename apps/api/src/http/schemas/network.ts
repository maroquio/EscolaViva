import { z } from 'zod';

export const schoolSchema = z.object({
  name: z.string().trim(),
  inepCode: z.string().trim().nullish(),
});

export const roleAssignmentSchema = z.object({
  schoolId: z.string().trim(),
  role: z.string().trim(),
});

export const userSchema = z.object({
  name: z.string().trim(),
  email: z.string().trim(),
  cpf: z.string().trim(),
  phone: z.string().trim().nullish(),
  roleAssignments: z.array(roleAssignmentSchema),
});

export const academicYearSchema = z.object({
  year: z.number().int(),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
});
