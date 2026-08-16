import { z } from 'zod';

import { unitOfWork } from '../../shared/db';
import { failure, schemaErrors, success, type Result } from '../../shared/result';
import { markRead } from '../infra/announcementRepository';

export type ReadInput = {
  networkId: string;
  announcementId: string;
  guardianId: string;
};

const schema = z.object({
  networkId: z.string().uuid(),
  announcementId: z.string().uuid(),
  guardianId: z.string().uuid(),
});

export async function markAsRead(input: ReadInput): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));

  await unitOfWork(({ sql }) => markRead(sql, parsed.data));
  return success<void>(undefined);
}
