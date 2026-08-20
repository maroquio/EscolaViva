import { z } from 'zod';
import { AUDIENCE } from '../../communication';
import type { Audience } from '@escolaviva/contracts/announcements';

const AUDIENCE_VALUES = [AUDIENCE.school, AUDIENCE.selected] as const satisfies readonly Audience[];

export const announcementSchema = z.object({
  schoolId: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(AUDIENCE_VALUES),
  recipients: z.array(z.string()),
});

export type AnnouncementBody = z.infer<typeof announcementSchema>;
