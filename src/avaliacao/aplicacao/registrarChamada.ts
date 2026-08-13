import { z } from 'zod';
import { academico } from '../../academico';
import { unidadeDeTrabalho } from '../../shared/db';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { dataDeChamadaValida, dataDentroDoAnoLetivo } from '../dominio/frequencia';
import * as frequenciaRepositorio from '../infra/frequenciaRepositorio';

export type RegistroDeChamada = {
  redeId: string;
  turmaId: string;
  data: string;
  linhas: { matriculaId: string; presente: boolean; justificativa?: string | null }[];
};

const JUSTIFICATIVA_MAXIMA = 500;

const esquema = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(),
  data: z.string().refine(dataDeChamadaValida, 'Informe uma data válida no formato AAAA-MM-DD.'),
  linhas: z
    .array(
      z.object({
        matriculaId: z.string().uuid(),
        presente: z.boolean(),
        justificativa: z
          .string()
          .max(JUSTIFICATIVA_MAXIMA, 'A justificativa é longa demais.')
          .nullable()
          .optional(),
      }),
    )
    .min(1, 'Nenhuma linha de chamada foi enviada.'),
});

/**
 * Chamada de um dia inteiro para uma turma. A frequência é por dia: uma linha por aluno por data,
 * nunca por aula. Reenviar a mesma data corrige o registro em vez de duplicá-lo.
 */
export async function registrarChamada(entrada: RegistroDeChamada): Promise<Resultado<number>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));
  const { redeId, turmaId, data, linhas } = validada.data;

  const turma = await academico.turmaPorId(redeId, turmaId);
  if (turma === null) {
    return falhaDeCampo('turmaId', 'nao_encontrada', 'Turma não encontrada nesta rede.');
  }

  const anoLetivo = (await academico.listarAnosLetivos(redeId)).find(
    (ano) => ano.id === turma.anoLetivoId,
  );
  if (anoLetivo === undefined) {
    return falhaDeCampo('turmaId', 'ano_letivo_ausente', 'A turma não tem ano letivo definido.');
  }
  if (!dataDentroDoAnoLetivo(data, anoLetivo.dataInicio, anoLetivo.dataFim)) {
    return falhaDeCampo(
      'data',
      'data_fora_do_ano_letivo',
      `A chamada precisa cair entre ${anoLetivo.dataInicio} e ${anoLetivo.dataFim}.`,
    );
  }

  const recusa = await conferirMatriculas(redeId, turmaId, linhas);
  if (recusa !== null) return recusa;

  return await unidadeDeTrabalho<Resultado<number>>(async ({ sql }) => {
    const gravadas = await frequenciaRepositorio.gravarEmLote(sql, {
      redeId,
      data,
      linhas: linhas.map((linha) => ({
        matriculaId: linha.matriculaId,
        presente: linha.presente,
        justificativa: linha.justificativa ?? null,
      })),
    });
    return sucesso(gravadas);
  });
}

/** O lote inteiro vale ou nada vale: a tela mostra a turma completa, não uma seleção de alunos. */
async function conferirMatriculas(
  redeId: string,
  turmaId: string,
  linhas: { matriculaId: string }[],
): Promise<Resultado<number> | null> {
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  const daTurma = new Set(matriculas.map((matricula) => matricula.id));
  const enviadas = linhas.map((linha) => linha.matriculaId);
  if (enviadas.some((matriculaId) => !daTurma.has(matriculaId))) {
    return falhaDeCampo(
      'linhas',
      'matricula_fora_da_turma',
      'Há aluno sem matrícula ativa nesta turma na chamada.',
    );
  }
  if (new Set(enviadas).size !== enviadas.length) {
    return falhaDeCampo('linhas', 'matricula_repetida', 'O mesmo aluno aparece duas vezes.');
  }
  return null;
}
