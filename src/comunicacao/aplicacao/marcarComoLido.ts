import { z } from 'zod';

import { unitOfWork } from '../../shared/db';
import { failure, schemaErrors, success, type Result } from '../../shared/result';
import { marcarLeitura } from '../infra/comunicadoRepositorio';

export type EntradaDeLeitura = {
  redeId: string;
  comunicadoId: string;
  responsavelId: string;
};

const esquema = z.object({
  redeId: z.string().uuid(),
  comunicadoId: z.string().uuid(),
  responsavelId: z.string().uuid(),
});

export async function marcarComoLido(entrada: EntradaDeLeitura): Promise<Result<void>> {
  const validado = esquema.safeParse(entrada);
  if (!validado.success) return failure(...schemaErrors(validado.error.issues));

  await unitOfWork(({ sql }) => marcarLeitura(sql, validado.data));
  return success<void>(undefined);
}
