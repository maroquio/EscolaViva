import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';

const schema = z.string().uuid();

/**
 * Sair apaga a linha, não marca uma coluna: sessão encerrada é sessão que não existe mais.
 * Id fora do formato simplesmente não corresponde a nada — o cookie é assinado, então isso só
 * acontece com valor forjado, e forjado não merece erro explicativo.
 */
export async function encerrarSessao(sessaoId: string): Promise<void> {
  if (!schema.safeParse(sessaoId).success) return;
  await unidadeDeTrabalho(async ({ sql }) => {
    await sessaoRepositorio.remover(sql, sessaoId);
  });
}
