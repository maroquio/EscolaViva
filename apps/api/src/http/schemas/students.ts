import { z } from 'zod';

export const studentSchema = z.object({
  name: z.string().trim(),
  birthDate: z.string().trim(),
});

export const guardianLinkSchema = z.object({
  userId: z.string().trim(),
  relationship: z.string().trim(),
  financiallyResponsible: z.boolean(),
});

export const guardianSchema = z.object({
  name: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim().optional(),
  cpf: z.string().trim(),
  schoolId: z.string().trim().optional(),
});

export const enrollmentSchema = z.object({
  studentId: z.string().trim(),
  classGroupId: z.string().trim(),
  academicYearId: z.string().trim(),
  enrollmentDate: z.string().trim(),
});

export const transferSchema = z.object({
  targetClassGroupId: z.string().trim(),
  date: z.string().trim(),
});
