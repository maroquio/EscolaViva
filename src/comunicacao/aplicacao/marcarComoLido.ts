import { z } from 'zod';

import { unidadeDeTrabalho } from '../../shared/db';
import { errosDeSchema, falha, sucesso, type Resultado } from '../../shared/resultado';
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

export async function marcarComoLido(entrada: EntradaDeLeitura): Promise<Resultado<void>> {
  const validado = esquema.safeParse(entrada);
  if (!validado.success) return falha(...errosDeSchema(validado.error.issues));

  await unidadeDeTrabalho(({ sql }) => marcarLeitura(sql, validado.data));
  return sucesso<void>(undefined);
}
