import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import { periodoCoerente, type AnoLetivo } from '../domain/academicYear';
import * as anosLetivos from '../infra/academicYearRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  ano: z
    .number()
    .int(MENSAGENS.anoLetivo.anoNaoInteiro)
    .min(LIMITES.anoLetivo.anoMinimo, MENSAGENS.anoLetivo.anoAbaixoDoMinimo)
    .max(LIMITES.anoLetivo.anoMaximo, MENSAGENS.anoLetivo.anoAcimaDoMaximo),
  dataInicio: z.string().date(MENSAGENS.anoLetivo.dataInicioFormato),
  dataFim: z.string().date(MENSAGENS.anoLetivo.dataFimFormato),
});

export async function definirAnoLetivo(e: {
  redeId: string;
  ano: number;
  dataInicio: string;
  dataFim: string;
}): Promise<Result<AnoLetivo>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, ano, dataInicio, dataFim } = validada.data;
  if (!periodoCoerente(dataInicio, dataFim)) {
    return fieldFailure(
      CAMPOS.anoLetivo.dataFim,
      CODIGOS.anoLetivo.periodoIncoerente,
      MENSAGENS.anoLetivo.periodoIncoerente,
    );
  }

  const anoLetivo: AnoLetivo = { id: uuidIdGenerator.next(), redeId, ano, dataInicio, dataFim };
  const criado = await unitOfWork(({ sql }) => anosLetivos.inserir(sql, anoLetivo));
  if (!criado) {
    return fieldFailure(
      CAMPOS.anoLetivo.ano,
      CODIGOS.anoLetivo.duplicado,
      MENSAGENS.anoLetivo.duplicado(ano),
    );
  }
  return success(anoLetivo);
}
