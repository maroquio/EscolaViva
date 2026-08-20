import { z } from 'zod';
import { SHIFTS } from '@escolaviva/contracts/enumerations';
import {
  ASSIGNMENT_FIELD,
  CLASS_GROUP_FIELD,
  CLASS_GROUP_MESSAGES,
  SUBJECT_FIELD,
} from './constants';

export const classGroupSchema = z.object({
  name: z.string().trim().min(1, CLASS_GROUP_MESSAGES.name),
  gradeLevel: z.string().trim().min(1, CLASS_GROUP_MESSAGES.gradeLevel),
  shift: z.enum(SHIFTS, { error: CLASS_GROUP_MESSAGES.shiftChoice }),
  schoolId: z.string().min(1, CLASS_GROUP_MESSAGES.schoolChoice),
  academicYearId: z.string().min(1, CLASS_GROUP_MESSAGES.academicYearChoice),
});

export type ClassGroupValues = z.infer<typeof classGroupSchema>;

export const CLASS_GROUP_FIELDS = Object.values(CLASS_GROUP_FIELD);

export const assignmentSchema = z.object({
  subjectId: z.string().min(1, CLASS_GROUP_MESSAGES.subjectChoice),
  teacherUserId: z.string().min(1, CLASS_GROUP_MESSAGES.teacherChoice),
});

export type AssignmentValues = z.infer<typeof assignmentSchema>;

export const ASSIGNMENT_FIELDS = Object.values(ASSIGNMENT_FIELD);

export const subjectSchema = z.object({
  name: z.string().trim().min(1, CLASS_GROUP_MESSAGES.subjectName),
});

export type SubjectValues = z.infer<typeof subjectSchema>;

export const SUBJECT_FIELDS = Object.values(SUBJECT_FIELD);
