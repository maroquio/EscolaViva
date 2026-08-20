import { z } from 'zod';
import { isGradeInsideTheScale, type GradeAsPosted, type GradeAsTyped } from './grade';

const OUTSIDE_THE_SCALE = 'Nota entre 0 e 10.';

export const gradeRowSchema = z.object({
  enrollmentId: z.string(),
  studentName: z.string(),
  value: z
    .custom<GradeAsTyped>()
    .refine((grade) => grade !== undefined, OUTSIDE_THE_SCALE)
    .refine((grade) => grade === null || isGradeInsideTheScale(grade), OUTSIDE_THE_SCALE)
    .transform((grade) => grade as GradeAsPosted),
});

export const gradesSchema = z.object({
  grades: z.array(gradeRowSchema),
});

export type GradesAsTyped = z.input<typeof gradesSchema>;

export type GradesToPost = z.output<typeof gradesSchema>;

export const rollCallRowSchema = z.object({
  enrollmentId: z.string(),
  studentName: z.string(),
  present: z.boolean(),
  excuse: z.string(),
});

export const rollCallSchema = z.object({
  rows: z.array(rollCallRowSchema),
});

export type RollCallValues = z.infer<typeof rollCallSchema>;
