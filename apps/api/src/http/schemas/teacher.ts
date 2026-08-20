import { z } from 'zod';

export const gradesSchema = z.object({
  term: z.number(),
  grades: z.array(
    z.object({
      enrollmentId: z.string(),
      value: z.number().nullable(),
    }),
  ),
});

export const rollCallSchema = z.object({
  date: z.string(),
  rows: z.array(
    z.object({
      enrollmentId: z.string(),
      present: z.boolean(),
      excuse: z.string().nullable(),
    }),
  ),
});

export const termClosingSchema = z.object({
  term: z.number(),
});
