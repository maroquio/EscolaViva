import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';

const schema = z.string().uuid();

export async function encerrarSessao(sessaoId: string): Promise<void> {
  if (!schema.safeParse(sessaoId).success) return;
  await unidadeDeTrabalho(async ({ sql }) => {
    await sessaoRepositorio.remover(sql, sessaoId);
  });
}
