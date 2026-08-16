import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import * as sessionRepository from '../infra/sessionRepository';

const schema = z.string().uuid();

export async function endSession(sessionId: string): Promise<void> {
  if (!schema.safeParse(sessionId).success) return;
  await unitOfWork(async ({ sql }) => {
    await sessionRepository.remove(sql, sessionId);
  });
}
