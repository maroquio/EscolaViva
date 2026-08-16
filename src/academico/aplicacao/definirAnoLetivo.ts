import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import { periodoCoerente, type AnoLetivo } from '../dominio/anoLetivo';
import * as anosLetivos from '../infra/anoLetivoRepositorio';

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
}): Promise<Resultado<AnoLetivo>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, ano, dataInicio, dataFim } = validada.data;
  if (!periodoCoerente(dataInicio, dataFim)) {
    return falhaDeCampo(
      CAMPOS.anoLetivo.dataFim,
      CODIGOS.anoLetivo.periodoIncoerente,
      MENSAGENS.anoLetivo.periodoIncoerente,
    );
  }

  const anoLetivo: AnoLetivo = { id: idGeneratorUuid.novo(), redeId, ano, dataInicio, dataFim };
  const criado = await unidadeDeTrabalho(({ sql }) => anosLetivos.inserir(sql, anoLetivo));
  if (!criado) {
    return falhaDeCampo(
      CAMPOS.anoLetivo.ano,
      CODIGOS.anoLetivo.duplicado,
      MENSAGENS.anoLetivo.duplicado(ano),
    );
  }
  return sucesso(anoLetivo);
}
