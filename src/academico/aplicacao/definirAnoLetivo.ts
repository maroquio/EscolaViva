import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { periodoCoerente, type AnoLetivo } from '../dominio/anoLetivo';
import * as anosLetivos from '../infra/anoLetivoRepositorio';

const ANO_MINIMO = 2000;
const ANO_MAXIMO = 2100;

const entrada = z.object({
  redeId: z.string().uuid(),
  ano: z
    .number()
    .int('O ano precisa ser um número inteiro.')
    .min(ANO_MINIMO, `O ano precisa ser a partir de ${ANO_MINIMO}.`)
    .max(ANO_MAXIMO, `O ano precisa ser até ${ANO_MAXIMO}.`),
  dataInicio: z.string().date('Informe a data de início no formato AAAA-MM-DD.'),
  dataFim: z.string().date('Informe a data de término no formato AAAA-MM-DD.'),
});

export async function definirAnoLetivo(e: {
  redeId: string;
  ano: number;
  dataInicio: string;
  dataFim: string;
}): Promise<Resultado<AnoLetivo>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, ano, dataInicio, dataFim } = validada.data;
  if (!periodoCoerente(dataInicio, dataFim)) {
    return falhaDeCampo(
      'dataFim',
      'periodo_incoerente',
      'A data de término precisa ser posterior à data de início.',
    );
  }

  const anoLetivo: AnoLetivo = { id: idGeneratorUuid.novo(), redeId, ano, dataInicio, dataFim };
  const criado = await unidadeDeTrabalho(({ sql }) => anosLetivos.inserir(sql, anoLetivo));
  if (!criado) {
    return falhaDeCampo('ano', 'ano_duplicado', `Esta rede já tem o ano letivo ${ano} definido.`);
  }
  return sucesso(anoLetivo);
}
