import { z } from 'zod';
import { academico } from '../../academico';
import { unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import { dataDeChamadaValida, dataDentroDoAnoLetivo } from '../dominio/frequencia';
import * as frequenciaRepositorio from '../infra/frequenciaRepositorio';

export type RegistroDeChamada = {
  redeId: string;
  turmaId: string;
  data: string;
  linhas: { matriculaId: string; presente: boolean; justificativa?: string | null }[];
};

const esquema = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(),
  data: z.string().refine(dataDeChamadaValida, MENSAGENS.chamada.dataInvalida),
  linhas: z
    .array(
      z.object({
        matriculaId: z.string().uuid(),
        presente: z.boolean(),
        justificativa: z
          .string()
          .max(LIMITES.caracteresDaJustificativa, MENSAGENS.chamada.justificativaLonga)
          .nullable()
          .optional(),
      }),
    )
    .min(1, MENSAGENS.chamada.loteVazio),
});

export async function registrarChamada(entrada: RegistroDeChamada): Promise<Result<number>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));
  const { redeId, turmaId, data, linhas } = validada.data;

  const turma = await academico.turmaPorId(redeId, turmaId);
  if (turma === null) {
    return fieldFailure(CAMPOS.turmaId, CODIGOS.naoEncontrada, MENSAGENS.turmaNaoEncontrada);
  }

  const anoLetivo = (await academico.listarAnosLetivos(redeId)).find(
    (ano) => ano.id === turma.anoLetivoId,
  );
  if (anoLetivo === undefined) {
    return fieldFailure(
      CAMPOS.turmaId,
      CODIGOS.anoLetivoAusente,
      MENSAGENS.chamada.anoLetivoAusente,
    );
  }
  if (!dataDentroDoAnoLetivo(data, anoLetivo.dataInicio, anoLetivo.dataFim)) {
    return fieldFailure(
      CAMPOS.data,
      CODIGOS.dataForaDoAnoLetivo,
      MENSAGENS.chamada.dataForaDoAnoLetivo(anoLetivo.dataInicio, anoLetivo.dataFim),
    );
  }

  const recusa = await conferirMatriculas(redeId, turmaId, linhas);
  if (recusa !== null) return recusa;

  return await unitOfWork<Result<number>>(async ({ sql }) => {
    const gravadas = await frequenciaRepositorio.gravarEmLote(sql, {
      redeId,
      data,
      linhas: linhas.map((linha) => ({
        matriculaId: linha.matriculaId,
        presente: linha.presente,
        justificativa: linha.justificativa ?? null,
      })),
    });
    return success(gravadas);
  });
}

async function conferirMatriculas(
  redeId: string,
  turmaId: string,
  linhas: { matriculaId: string }[],
): Promise<Result<number> | null> {
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  const daTurma = new Set(matriculas.map((matricula) => matricula.id));
  const enviadas = linhas.map((linha) => linha.matriculaId);
  if (enviadas.some((matriculaId) => !daTurma.has(matriculaId))) {
    return fieldFailure(
      CAMPOS.linhas,
      CODIGOS.chamada.matriculaForaDaTurma,
      MENSAGENS.chamada.matriculaForaDaTurma,
    );
  }
  if (new Set(enviadas).size !== enviadas.length) {
    return fieldFailure(
      CAMPOS.linhas,
      CODIGOS.chamada.matriculaRepetida,
      MENSAGENS.chamada.matriculaRepetida,
    );
  }
  return null;
}
