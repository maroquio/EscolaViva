import { z } from 'zod';
import {
  ANNOUNCEMENT_FIELD,
  ANNOUNCEMENT_MESSAGES,
  SCHOOL_AUDIENCE,
  SELECTED_AUDIENCE,
} from './constants';

export const AUDIENCES = [SCHOOL_AUDIENCE, SELECTED_AUDIENCE] as const;

export const announcementSchema = z
  .object({
    schoolId: z.string().min(1, ANNOUNCEMENT_MESSAGES.schoolId),
    title: z.string().trim().min(1, ANNOUNCEMENT_MESSAGES.title),
    body: z.string().trim().min(1, ANNOUNCEMENT_MESSAGES.body),
    audience: z.enum(AUDIENCES, { error: ANNOUNCEMENT_MESSAGES.audience }),
    recipients: z.array(z.string()),
  })
  .refine((values) => values.audience !== SELECTED_AUDIENCE || values.recipients.length > 0, {
    path: [ANNOUNCEMENT_FIELD.recipients],
    error: ANNOUNCEMENT_MESSAGES.recipients,
  });

export type AnnouncementValues = z.infer<typeof announcementSchema>;

export const ANNOUNCEMENT_FIELDS = Object.values(ANNOUNCEMENT_FIELD);
