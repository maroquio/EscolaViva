import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessionRepository';

const schema = z.string().uuid();

export async function encerrarSessao(sessaoId: string): Promise<void> {
  if (!schema.safeParse(sessaoId).success) return;
  await unitOfWork(async ({ sql }) => {
    await sessaoRepositorio.remover(sql, sessaoId);
  });
}
