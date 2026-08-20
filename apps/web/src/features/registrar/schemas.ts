import { z } from 'zod';
import {
  ENROLLMENT_FIELD,
  GUARDIAN_FIELD,
  GUARDIAN_LINK_FIELD,
  REGISTRAR_MESSAGES,
  STUDENT_FIELD,
  TRANSFER_FIELD,
} from './constants';

export const studentSchema = z.object({
  name: z.string().trim().min(1, REGISTRAR_MESSAGES.studentName),
  birthDate: z.string().trim().min(1, REGISTRAR_MESSAGES.birthDate),
});

export type StudentValues = z.infer<typeof studentSchema>;

export const STUDENT_FIELDS = Object.values(STUDENT_FIELD);

export const guardianLinkSchema = z.object({
  userId: z.string().min(1, REGISTRAR_MESSAGES.guardianChoice),
  relationship: z.string().trim().min(1, REGISTRAR_MESSAGES.relationship),
  financiallyResponsible: z.boolean(),
});

export type GuardianLinkValues = z.infer<typeof guardianLinkSchema>;

export const GUARDIAN_LINK_FIELDS = Object.values(GUARDIAN_LINK_FIELD);

export const guardianSchema = z.object({
  name: z.string().trim().min(1, REGISTRAR_MESSAGES.name),
  cpf: z.string().trim().min(1, REGISTRAR_MESSAGES.cpf),
  email: z.string().trim().min(1, REGISTRAR_MESSAGES.email),
  phone: z.string().trim(),
  schoolId: z.string(),
});

export type GuardianValues = z.infer<typeof guardianSchema>;

export const GUARDIAN_FIELDS = Object.values(GUARDIAN_FIELD);

export const enrollmentSchema = z.object({
  classGroupId: z.string().min(1, REGISTRAR_MESSAGES.classGroupChoice),
  academicYearId: z.string().min(1, REGISTRAR_MESSAGES.academicYearChoice),
  enrollmentDate: z.string().trim().min(1, REGISTRAR_MESSAGES.enrollmentDate),
});

export type EnrollmentValues = z.infer<typeof enrollmentSchema>;

export const ENROLLMENT_FIELDS = Object.values(ENROLLMENT_FIELD);

export const transferSchema = z.object({
  targetClassGroupId: z.string().min(1, REGISTRAR_MESSAGES.targetClassGroupChoice),
  date: z.string().trim().min(1, REGISTRAR_MESSAGES.transferDate),
});

export type TransferValues = z.infer<typeof transferSchema>;

export const TRANSFER_FIELDS = Object.values(TRANSFER_FIELD);
