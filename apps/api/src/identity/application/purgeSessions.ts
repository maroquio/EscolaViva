import { unitOfWork } from '../../shared/db';
import * as sessionRepository from '../infra/sessionRepository';

export async function purgeExpiredSessions(): Promise<number> {
  return await unitOfWork(async ({ sql }) => sessionRepository.purgeExpired(sql));
}
