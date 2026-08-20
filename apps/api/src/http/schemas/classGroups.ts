import { z } from 'zod';
import { SHIFTS } from '../../academics';

export const classGroupSchema = z.object({
  name: z.string(),
  gradeLevel: z.string(),
  shift: z.enum(SHIFTS),
  schoolId: z.string(),
  academicYearId: z.string(),
});

export const assignmentSchema = z.object({
  subjectId: z.string(),
  teacherUserId: z.string(),
});

export const subjectSchema = z.object({
  name: z.string(),
});
