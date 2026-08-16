import { z } from 'zod';
import { identity } from '../../identity/index';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import type { TurmaDisciplina } from '../dominio/turma';
import * as disciplinas from '../infra/disciplinaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(MENSAGENS.alocacao.turmaObrigatoria),
  disciplinaId: z.string().uuid(MENSAGENS.alocacao.disciplinaObrigatoria),
  professorUsuarioId: z.string().uuid(MENSAGENS.alocacao.professorObrigatorio),
});

export async function alocarProfessor(e: {
  redeId: string;
  turmaId: string;
  disciplinaId: string;
  professorUsuarioId: string;
}): Promise<Result<TurmaDisciplina>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, turmaId, disciplinaId, professorUsuarioId } = validada.data;
  return unitOfWork(async ({ sql }): Promise<Result<TurmaDisciplina>> => {
    const turma = await turmas.porId(sql, redeId, turmaId);
    if (turma === null) {
      return fieldFailure(
        CAMPOS.alocacao.turmaId,
        CODIGOS.turmaNaoEncontrada,
        MENSAGENS.turmaNaoEncontrada,
      );
    }
    const disciplina = await disciplinas.porId(sql, redeId, disciplinaId);
    if (disciplina === null) {
      return fieldFailure(
        CAMPOS.alocacao.disciplinaId,
        CODIGOS.disciplinaNaoEncontrada,
        MENSAGENS.disciplinaNaoEncontrada,
      );
    }
    const ehProfessor = await identity.isTeacherAtSchool(
      redeId,
      professorUsuarioId,
      turma.unidadeId,
    );
    if (!ehProfessor) {
      return fieldFailure(
        CAMPOS.alocacao.professorUsuarioId,
        CODIGOS.alocacao.semPapelDeProfessor,
        MENSAGENS.alocacao.semPapelDeProfessor,
      );
    }

    const alocacao: TurmaDisciplina = {
      id: uuidIdGenerator.next(),
      redeId,
      turmaId,
      disciplinaId,
      disciplinaNome: disciplina.nome,
      professorUsuarioId,
    };
    const criada = await turmas.inserirDisciplina(sql, alocacao);
    if (!criada) {
      return fieldFailure(
        CAMPOS.alocacao.disciplinaId,
        CODIGOS.alocacao.disciplinaJaAlocada,
        MENSAGENS.alocacao.disciplinaJaAlocada,
      );
    }
    return success(alocacao);
  });
}
