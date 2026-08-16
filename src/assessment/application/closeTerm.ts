import { z } from 'zod';
import { academico } from '../../academics';
import { unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constants';
import { mensagemDePendencias, pendenciasDoFechamento } from '../domain/termClosing';
import { bimestreValido } from '../domain/grade';
import * as fechamentoRepositorio from '../infra/closingRepository';
import * as notaRepositorio from '../infra/gradeRepository';

export type FechamentoDeBimestre = {
  redeId: string;
  turmaId: string;
  bimestre: number;
  fechadoPor: string;
};

const esquema = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(),
  bimestre: z.number().refine(bimestreValido, MENSAGENS.bimestreInvalido),
  fechadoPor: z.string().uuid(),
});

export async function fecharBimestre(entrada: FechamentoDeBimestre): Promise<Result<void>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));
  const { redeId, turmaId, bimestre, fechadoPor } = validada.data;

  const turma = await academico.turmaPorId(redeId, turmaId);
  if (turma === null) {
    return fieldFailure(CAMPOS.turmaId, CODIGOS.naoEncontrada, MENSAGENS.turmaNaoEncontrada);
  }

  const disciplinas = await academico.listarTurmaDisciplinas(redeId, turmaId);
  if (disciplinas.length === 0) {
    return fieldFailure(
      CAMPOS.turmaId,
      CODIGOS.semDisciplina,
      MENSAGENS.fechamento.semDisciplina,
    );
  }

  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  if (matriculas.length === 0) {
    return fieldFailure(
      CAMPOS.turmaId,
      CODIGOS.semMatriculaAtiva,
      MENSAGENS.fechamento.semMatriculaAtiva,
    );
  }

  return await unitOfWork<Result<void>>(async ({ sql }) => {
    if (await fechamentoRepositorio.estaFechado(sql, redeId, turmaId, bimestre)) {
      return fieldFailure(CAMPOS.bimestre, CODIGOS.jaFechado, MENSAGENS.fechamento.jaFechado);
    }

    const lancadas = await notaRepositorio.contagemPorDisciplina(
      sql,
      redeId,
      disciplinas.map((disciplina) => disciplina.id),
      bimestre,
      matriculas.map((matricula) => matricula.id),
    );
    const pendencias = pendenciasDoFechamento(disciplinas, matriculas.length, lancadas);
    if (pendencias.length > 0) {
      return fieldFailure(
        CAMPOS.bimestre,
        CODIGOS.fechamentoIncompleto,
        mensagemDePendencias(pendencias),
      );
    }

    await fechamentoRepositorio.registrar(sql, { redeId, turmaId, bimestre, fechadoPor });
    return success<void>(undefined);
  });
}
